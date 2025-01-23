import { expect, test, describe, beforeEach, beforeAll, afterAll, afterEach } from "bun:test";
import { KeyValueStore } from "./key-value-store";
import { SqliteAdapter } from "./adapters/sqlite-adapter";
import { FileAdapter } from "./adapters/file-adapter";
import type { ValueValidator } from "./types";
import { z } from "zod";

//
// 1. Core In-Memory Operations
//
describe("1. Core In-Memory Operations", () => {
    let store: KeyValueStore;

    beforeEach(() => {
        store = new KeyValueStore({});
    });

    test("1.1 Basic CRUD Functionality", () => {
        // Create
        expect(store.get("newKey")).toBeUndefined();
        store.set<string>("newKey", "newValue");
        expect(store.get<string>("newKey")).toBe("newValue");

        // Read
        expect(store.get<string>("newKey")).toBe("newValue");

        // Update
        store.set<string>("newKey", "updatedValue");
        expect(store.get<string>("newKey")).toBe("updatedValue");

        // Delete
        store.delete("newKey");
        expect(store.get("newKey")).toBeUndefined();
    });

    test("1.2 Concurrency & Thread Safety", async () => {
        store.set<number>("concurrentKey", 0);

        await Promise.all(
            Array.from({ length: 100 }, async () => {
                const currentVal = store.get<number>("concurrentKey") ?? 0;
                store.set<number>("concurrentKey", currentVal + 1);
            })
        );

        expect(store.get<number>("concurrentKey")).toBe(100);
    });

    test("1.3 Performance & Stress", () => {
        const start = performance.now();
        const NUM_KEYS = 1000;

        for (let i = 0; i < NUM_KEYS; i++) {
            store.set<{ data: string }>(`bulkKey_${i}`, { data: `value_${i}` });
        }

        const end = performance.now();
        const duration = end - start;

        expect(duration).toBeLessThan(2000); // 2 seconds threshold

        // Verify data integrity
        for (let i = 0; i < NUM_KEYS; i++) {
            expect(store.get<{ data: string }>(`bulkKey_${i}`)).toEqual({ data: `value_${i}` });
        }
    });
});

//
// 2. Validation Logic
//
describe("2. Validation Logic", () => {
    let store: KeyValueStore;

    beforeEach(() => {
        store = new KeyValueStore({});
    });

    test("2.1 Validation on Entry with Zod", () => {
        const userSchema = z.object({
            name: z.string(),
            age: z.number(),
        });

        type User = z.infer<typeof userSchema>;

        const userValidator: ValueValidator<User> = (val) => {
            return userSchema.parse(val);
        };

        // Valid data
        const validUser: User = { name: "Alice", age: 30 };
        store.set("user", validUser, { validator: userValidator });
        expect(store.get("user", { validator: userValidator })).toEqual(validUser);

        // Invalid data
        expect(() => {
            store.set("user2", { name: "Bob", age: "30" as any }, { validator: userValidator });
        }).toThrow();
    });

    test("2.2 Validation on Read", () => {
        const numberValidator: ValueValidator<number> = (val) => {
            if (typeof val !== "number") throw new Error("Expected a number");
            return val;
        };

        store.set("count", 123);
        expect(store.get("count", { validator: numberValidator })).toBe(123);

        store.set("count", "invalid" as any);
        expect(() => {
            store.get("count", { validator: numberValidator });
        }).toThrow();
    });

    test("2.3 No Validation scenario", () => {
        const data = {
            string: "value",
            number: 123,
            boolean: true,
            array: [1, 2, 3],
            object: { key: "value" }
        };

        store.set<typeof data>("unvalidated", data);
        expect(store.get<typeof data>("unvalidated")).toEqual(data);
    });

    test("2.4 Custom Validation Functions", () => {
        const uppercaseValidator: ValueValidator<string> = (val) => {
            if (typeof val !== "string" || val !== val.toUpperCase()) {
                throw new Error("Value must be uppercase string");
            }
            return val;
        };

        store.set<string>("shout", "HELLO", { validator: uppercaseValidator });
        expect(store.get<string>("shout", { validator: uppercaseValidator })).toBe("HELLO");

        expect(() => {
            store.set<string>("shout2", "hello", { validator: uppercaseValidator });
        }).toThrow();
    });

    test("2.5 Edge Cases", () => {
        // Empty object
        store.set<Record<string, never>>("emptyObj", {});
        expect(store.get<Record<string, never>>("emptyObj")).toEqual({});

        // Large string
        const largeString = "x".repeat(10000);
        store.set<string>("largeStr", largeString);
        expect(store.get<string>("largeStr")).toBe(largeString);

        // Deeply nested object
        const complexObj = {
            level1: {
                level2: {
                    level3: {
                        array: [1, 2, { nested: "value" }],
                        map: new Map([["key", "value"]]),
                        set: new Set([1, 2, 3])
                    }
                }
            }
        };
        store.set<typeof complexObj>("complex", complexObj);
        expect(store.get<typeof complexObj>("complex")).toEqual(complexObj);
    });
});

//
// 3. Storage Adapters
//
describe("3.1 SQLite Integration", () => {
    const dbPath = "test_comprehensive.db";
    let store: KeyValueStore;

    beforeEach(async () => {
        const adapter = new SqliteAdapter({ path: dbPath });
        store = new KeyValueStore({ adapter });
        await store.init();
    });

    afterEach(async () => {
        try {
            await Bun.write(dbPath, ""); // Truncate file
        } catch { }
    });

    test("3.1.1 Basic SQLite Operations", async () => {
        store.set<string>("sqlKey", "sqlValue");
        await store.sync();

        // Create new store instance to verify persistence
        const newAdapter = new SqliteAdapter({ path: dbPath });
        const newStore = new KeyValueStore({ adapter: newAdapter });
        await newStore.init();
        await newStore.sync();

        expect(newStore.get<string>("sqlKey")).toBe("sqlValue");
    });

    test("3.1.2 Complex Data Types in SQLite", async () => {
        const complexData = {
            array: [1, 2, 3],
            nested: { key: "value" },
            date: new Date(),
            number: 42.5
        };

        store.set<typeof complexData>("complexKey", complexData);
        await store.sync();

        // Verify with new instance
        const newAdapter = new SqliteAdapter({ path: dbPath });
        const newStore = new KeyValueStore({ adapter: newAdapter });
        await newStore.init();
        await newStore.sync();

        const retrieved = newStore.get<typeof complexData>("complexKey");
        expect(retrieved).toBeTruthy();
        if (retrieved) {
            // Compare everything except date
            const { date: originalDate, ...originalRest } = complexData;
            const { date: retrievedDate, ...retrievedRest } = retrieved;

            // Compare non-date fields
            expect(retrievedRest).toEqual(originalRest);

            // Compare date separately - ensure it's a valid date string that matches original
            expect(typeof retrievedDate).toBe("string");
            const parsedDate = new Date(retrievedDate);
            expect(parsedDate.getTime()).toBe(originalDate.getTime());
        }
    });

    test("3.1.3 Multiple Keys & Values", async () => {
        type TestData = {
            key1: string;
            key2: { nested: string };
            key3: number[];
        };

        const testData: TestData = {
            key1: "value1",
            key2: { nested: "value2" },
            key3: [1, 2, 3]
        };

        for (const [key, value] of Object.entries(testData)) {
            store.set<TestData[keyof TestData]>(key, value);
        }
        await store.sync();

        // Verify with new instance
        const newAdapter = new SqliteAdapter({ path: dbPath });
        const newStore = new KeyValueStore({ adapter: newAdapter });
        await newStore.init();
        await newStore.sync();

        for (const [key, value] of Object.entries(testData)) {
            expect(newStore.get<TestData[keyof TestData]>(key)).toEqual(value);
        }
    });
});

describe("3.2 File Adapter Integration", () => {
    const filePath = "test_comprehensive.json";
    let store: KeyValueStore;

    beforeEach(async () => {
        const adapter = new FileAdapter({ filePath });
        store = new KeyValueStore({ adapter });
        await store.init();
    });

    afterEach(async () => {
        try {
            await Bun.write(filePath, ""); // Truncate file
        } catch { }
    });

    test("3.2.1 Basic File Operations", async () => {
        store.set<string>("fileKey", "fileValue");
        await store.sync();

        // Verify with new instance
        const newAdapter = new FileAdapter({ filePath });
        const newStore = new KeyValueStore({ adapter: newAdapter });
        await newStore.init();

        expect(newStore.get<string>("fileKey")).toBe("fileValue");
    });

    test("3.2.2 Complex Data in File", async () => {
        const complexData = {
            array: [1, 2, 3],
            nested: { key: "value" },
            date: new Date(),
            number: 42.5
        };

        store.set<typeof complexData>("complexKey", complexData);
        await store.sync();

        // Verify with new instance
        const newAdapter = new FileAdapter({ filePath });
        const newStore = new KeyValueStore({ adapter: newAdapter });
        await newStore.init();

        const retrieved = newStore.get<typeof complexData>("complexKey");
        expect(retrieved).toBeTruthy();
        if (retrieved) {
            // Compare everything except date
            const { date: originalDate, ...originalRest } = complexData;
            const { date: retrievedDate, ...retrievedRest } = retrieved;

            // Compare non-date fields
            expect(retrievedRest).toEqual(originalRest);

            // Compare date separately - ensure it's a valid date string that matches original
            expect(typeof retrievedDate).toBe("string");
            const parsedDate = new Date(retrievedDate);
            expect(parsedDate.getTime()).toBe(originalDate.getTime());
        }
    });
});

//
// 4. Hooks and Events
//
describe("4. Hooks and Events", () => {
    test("4.1 Update & Delete Hooks", () => {
        let updateCount = 0;
        let deleteCount = 0;
        let lastUpdatedKey: string | undefined;
        let lastDeletedKey: string | undefined;

        const store = new KeyValueStore({
            hooks: {
                onUpdate: (key) => {
                    updateCount++;
                    lastUpdatedKey = key;
                },
                onDelete: (key) => {
                    deleteCount++;
                    lastDeletedKey = key;
                }
            }
        });

        store.set("key1", "value1");
        expect(updateCount).toBe(1);
        expect(lastUpdatedKey).toBe("key1");

        store.set("key2", "value2");
        expect(updateCount).toBe(2);
        expect(lastUpdatedKey).toBe("key2");

        store.delete("key1");
        expect(deleteCount).toBe(1);
        expect(lastDeletedKey).toBe("key1");
    });

    test("4.2 Hook Error Handling", () => {
        const store = new KeyValueStore({
            hooks: {
                onUpdate: () => {
                    throw new Error("Hook error");
                }
            }
        });

        // Store should still function even if hook throws
        expect(() => {
            store.set<string>("key", "value");
        }).not.toThrow();

        expect(store.get<string>("key")).toBe("value");
    });

    test("4.3 Multiple Hooks", () => {
        const events: string[] = [];

        const store = new KeyValueStore({
            hooks: {
                onUpdate: () => { events.push("update1"); return Promise.resolve(); },
                onDelete: () => { events.push("delete1"); return Promise.resolve(); }
            }
        });

        store.set("key", "value");
        store.delete("key");

        expect(events).toEqual(["update1", "delete1"]);
    });
});

//
// 5. Versioning
//
describe("5. Versioning", () => {
    test("5.1 Version Tracking", () => {
        const store = new KeyValueStore({ enableVersioning: true });
        expect(store.getVersion()).toBe(0);

        store.set("key1", "value1");
        expect(store.getVersion()).toBe(1);

        store.set("key2", "value2");
        expect(store.getVersion()).toBe(2);

        store.delete("key1");
        expect(store.getVersion()).toBe(3);
    });

    test("5.2 Version Persistence with SQLite", async () => {
        const dbPath = "version_test.db";
        const adapter = new SqliteAdapter({ path: dbPath });
        const store = new KeyValueStore({
            adapter,
            enableVersioning: true
        });

        await store.init();
        store.set("key1", "value1");
        store.set("key2", "value2");
        await store.sync();

        const version = store.getVersion();

        // Create new store instance
        const newAdapter = new SqliteAdapter({ path: dbPath });
        const newStore = new KeyValueStore({
            adapter: newAdapter,
            enableVersioning: true
        });
        await newStore.init();
        await newStore.sync();

        expect(newStore.getVersion()).toBe(version);

        // Cleanup
        try {
            await Bun.write(dbPath, ""); // Truncate file
        } catch { }
    });
});

//
// 6. Configuration & Flexibility
//
describe("6. Configuration & Flexibility", () => {
    test("6.1 Default Configuration", () => {
        const store = new KeyValueStore({});
        store.set<string>("key", "value");
        expect(store.get<string>("key")).toBe("value");
    });

    test("6.2 Custom Configuration", () => {
        const store = new KeyValueStore({
            enableVersioning: true,
            hooks: {
                onUpdate: () => { },
                onDelete: () => { }
            }
        });

        store.set<string>("key", "value");
        expect(store.get<string>("key")).toBe("value");
        expect(store.getVersion()).toBe(1);
    });

    test("6.3 Adapter Configuration", async () => {
        const filePath = "config_test.json";
        const fileAdapter = new FileAdapter({ filePath });
        const store = new KeyValueStore({ adapter: fileAdapter });

        await store.init();
        store.set<string>("key", "value");
        await store.sync();

        expect(store.get<string>("key")).toBe("value");

        // Cleanup
        try {
            await Bun.write(filePath, ""); // Truncate file
        } catch { }
    });
});

//
// 7. Error Handling & Edge Cases
//
describe("7. Error Handling & Edge Cases", () => {
    test("7.1 Invalid Keys", () => {
        const store = new KeyValueStore({});

        // @ts-expect-error - Testing runtime behavior with invalid key
        expect(() => store.set(null, "value")).toThrow();

        // @ts-expect-error - Testing runtime behavior with invalid key
        expect(() => store.set(undefined, "value")).toThrow();

        // Empty string should be allowed but might want to prevent it
        store.set<string>("", "empty key");
        expect(store.get<string>("")).toBe("empty key");
    });

    test("7.2 Invalid Values", () => {
        const store = new KeyValueStore({});

        // Undefined should be treated as delete
        store.set("key", undefined);
        expect(store.get("key")).toBeUndefined();

        // Circular references should throw
        const circular: any = { prop: "value" };
        circular.self = circular;

        expect(() => {
            store.set("circular", circular);
        }).toThrow();
    });

    test("7.3 Adapter Errors", async () => {
        // Test initialization error with invalid path
        const invalidDbPath = "/invalid/path/db.sqlite";
        const adapter = new SqliteAdapter({ path: invalidDbPath });
        const store = new KeyValueStore({ adapter });

        // Should fail to initialize with invalid path
        await expect(store.init()).rejects.toThrow("unable to open database file");
    });

    test("7.4 Large Values", () => {
        const store = new KeyValueStore({});
        const largeValue = "x".repeat(1024 * 1024); // 1MB string

        // Should handle large values
        store.set<string>("large", largeValue);
        expect(store.get<string>("large")).toBe(largeValue);
    });
});

//
// 8. Type Safety
//
describe("8. Type Safety", () => {
    test("8.1 Type Inference", () => {
        const store = new KeyValueStore({});

        // String type
        store.set("str", "value");
        const str = store.get("str");
        expect(typeof str).toBe("string");

        // Number type
        store.set("num", 42);
        const num = store.get("num");
        expect(typeof num).toBe("number");

        // Object type
        interface User {
            name: string;
            age: number;
        }
        const user: User = { name: "Test", age: 25 };
        store.set("user", user);
        const retrieved = store.get("user") as User;
        expect(retrieved.name).toBe("Test");
        expect(retrieved.age).toBe(25);
    });

    test("8.2 Validator Type Safety", () => {
        const store = new KeyValueStore({});

        const numberValidator: ValueValidator<number> = (val) => {
            if (typeof val !== "number") throw new Error("Not a number");
            return val;
        };

        // Valid case
        store.set<number>("num", 42, { validator: numberValidator });
        const num = store.get<number>("num", { validator: numberValidator });
        expect(typeof num).toBe("number");

        // Runtime validation check
        expect(() => {
            // @ts-expect-error - Testing runtime behavior with invalid type
            store.set<number>("num", "not a number", { validator: numberValidator });
        }).toThrow("Not a number");
    });
});

// Cleanup after all tests
afterAll(async () => {
    // Clean up any remaining test files
    const testFiles = [
        "test_comprehensive.db",
        "test_comprehensive.json",
        "version_test.db",
        "config_test.json"
    ];

    for (const file of testFiles) {
        try {
            await Bun.write(file, ""); // Truncate file
        } catch { }
    }
}); 