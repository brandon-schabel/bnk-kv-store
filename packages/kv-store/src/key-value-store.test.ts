import { expect, test, describe, beforeEach } from "bun:test";
import { KeyValueStore } from "./key-value-store";
import { SqliteAdapter } from "./adapters/sqlite-adapter";
import { FileAdapter } from "./adapters/file-adapter";
import type { ValueValidator } from "./types";

describe("KeyValueStore", () => {
  describe("In-Memory Only", () => {
    let store: KeyValueStore;

    beforeEach(() => {
      store = new KeyValueStore({});
    });

    test("should store and retrieve values", () => {
      store.set("name", "Brandon");
      expect(store.get("name")).toBe("Brandon");
    });

    test("should delete values", () => {
      store.set("name", "Brandon");
      store.delete("name");
      expect(store.get("name")).toBeUndefined();
    });

    test("should validate values with custom validator", () => {
      const numberValidator: ValueValidator<number> = (val) => {
        if (typeof val !== "number") {
          throw new Error("Value must be a number");
        }
        return val;
      };

      store.set("count", 42, { validator: numberValidator });
      expect(store.get("count", { validator: numberValidator })).toBe(42);

      expect(() => {
        store.set("count", "not a number", { validator: numberValidator });
      }).toThrow();
    });

    test("should track version when enabled", () => {
      const versionedStore = new KeyValueStore({ enableVersioning: true });
      expect(versionedStore.getVersion()).toBe(0);

      versionedStore.set("key1", "value1");
      expect(versionedStore.getVersion()).toBe(1);

      versionedStore.set("key2", "value2");
      expect(versionedStore.getVersion()).toBe(2);

      versionedStore.delete("key1");
      expect(versionedStore.getVersion()).toBe(3);
    });

    test("should trigger hooks", () => {
      let updateCount = 0;
      let deleteCount = 0;

      const store = new KeyValueStore({
        hooks: {
          onUpdate: () => { updateCount++; },
          onDelete: () => { deleteCount++; }
        }
      });

      store.set("key1", "value1");
      expect(updateCount).toBe(1);

      store.delete("key1");
      expect(deleteCount).toBe(1);
    });
  });

  describe("SQLite Adapter", () => {
    let store: KeyValueStore;
    const dbPath = "test.db";

    beforeEach(async () => {
      const adapter = new SqliteAdapter({ path: dbPath });
      store = new KeyValueStore({ adapter });
      await store.init();
    });

    test("should persist data to SQLite", async () => {
      store.set("key1", "value1");
      await store.sync();

      // Create a new store instance to verify persistence
      const newAdapter = new SqliteAdapter({ path: dbPath });
      const newStore = new KeyValueStore({ adapter: newAdapter });
      await newStore.init();
      await newStore.sync(); // This will load from SQLite to memory

      expect(newStore.get("key1")).toBe("value1");
    });
  });

  describe("File Adapter", () => {
    let store: KeyValueStore;
    const filePath = "test-store.json";

    beforeEach(async () => {
      const adapter = new FileAdapter({ filePath });
      store = new KeyValueStore({ adapter });
      await store.init();
    });

    test("should persist data to file", async () => {
      store.set("key1", "value1");
      await store.sync();

      // Create a new store instance to verify persistence
      const newAdapter = new FileAdapter({ filePath });
      const newStore = new KeyValueStore({ adapter: newAdapter });
      await newStore.init();

      expect(newStore.get("key1")).toBe("value1");
    });
  });
}); 