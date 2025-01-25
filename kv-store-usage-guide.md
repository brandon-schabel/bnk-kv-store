## 1. Introduction

`@bnk/kv-store` is a **highly modular**, **zero-dependency**, **TypeScript-based** key-value store for [Bun](https://bun.sh). At its core, it’s an in-memory store that can optionally **sync** and **persist** to different backends, such as **SQLite** or **files**. It supports:

- **In-Memory** caching of data for performance
- **Optional** persistence to data stores (SQLite, file, etc.)
- **Validation** capabilities (Zod, custom functions, etc.)
- **Hooks** to trigger side effects on data changes, backups, or deletes
- **Versioning** to keep track of changes over time
- **Backups** for reliability
- **Easy Testing** with small, pluggable modules

This library is especially handy for **lightweight** or **rapid** data storage needs in Bun, such as storing configuration, caching requests, or building small local apps without a heavy database requirement.

---

## 2. Installation

```bash
bun add @bnk/kv-store
```

Once installed, you can import it anywhere in your Bun + TypeScript project:

```typescript
import { KeyValueStore } from '@bnk/kv-store';
```

---

## 3. Basic In-Memory Usage

The simplest way to use the library is **in-memory only**, meaning no data is persisted to disk or a database. This is great for temporary caching or ephemeral data during app runtime.

```typescript
import { KeyValueStore } from '@bnk/kv-store';

const store = new KeyValueStore({});

// Setting a key
store.set('greeting', 'Hello, world!');

// Getting a key
const greeting = store.get<string>('greeting');
console.log(greeting); // "Hello, world!"

// Deleting a key
store.delete('greeting');
```

### Notes on Basic Usage

1. **Key Strings Only**  
   All keys must be strings.  

2. **Value Serialization**  
   Values are stored in memory as JavaScript objects, but for potential persistence, they must be **JSON-serializable**. If you try to set circular references or other non-serializable data, an error will be thrown.

3. **Optionally typed**  
   You can pass a type parameter (e.g. `store.get<MyType>("myKey")`) for TypeScript convenience. However, TypeScript won't enforce it unless you use a validator (see [Validation](#6-validation) below).

---

## 4. Adding Persistence

### 4.1 SQLite Adapter

To persist your data in an SQLite database:

```typescript
import { KeyValueStore, SqliteAdapter } from '@bnk/kv-store';

async function runExample() {
  const adapter = new SqliteAdapter({ path: 'my-store.db' });
  
  const store = new KeyValueStore({
    adapter,
    syncIntervalMs: 5000 // automatically sync every 5 seconds
  });

  // Initialize store (creates table if needed, then loads existing data)
  await store.init();

  // Set a key in memory
  store.set('user', { name: 'Alice', age: 29 });

  // Force immediate sync to SQLite
  await store.sync();

  // Confirm in memory
  console.log(store.get('user')); // { name: 'Alice', age: 29 }

  // Later, you can create backups
  await store.createBackup();
}

runExample();
```

**Key Points**  

- **`syncIntervalMs`** automatically calls `store.sync()` periodically, pushing memory changes to SQLite.  
- You can **manually** call `store.sync()` whenever you want to persist changes immediately.  
- If you enable **versioning** (see [Versioning](#8-versioning)), the store’s version is also saved in the database.

### 4.2 File Adapter

To store your data in a file (JSON-based):

```typescript
import { KeyValueStore, FileAdapter } from '@bnk/kv-store';

async function runFileExample() {
  const adapter = new FileAdapter({ filePath: 'my-store.json' });

  const store = new KeyValueStore({
    adapter,
    syncIntervalMs: 3000
  });

  await store.init();
  store.set('todoItems', ['Buy milk', 'Clean house', 'Pay bills']);

  // Save to file
  await store.sync();
}

runFileExample();
```

**Key Points**  

- All data is kept in a JSON file that is read on `init()` and written on each `sync()`.  
- This can be perfect for storing small amounts of data like config files, settings, or user preferences.  

---

## 5. Hooks

Hooks let you observe or react to changes in the store:

- **`onUpdate(key, value)`** – Called when a key is set or updated
- **`onDelete(key)`** – Called when a key is deleted
- **`onBackup(timestamp, version)`** – Called after a backup operation

```typescript
import { KeyValueStore } from '@bnk/kv-store';

const store = new KeyValueStore({
  hooks: {
    onUpdate: (key, newValue) => {
      console.log(`Key "${key}" updated to:`, newValue);
    },
    onDelete: (key) => {
      console.log(`Key "${key}" was deleted`);
    },
    onBackup: (timestamp, version) => {
      console.log(`Backup created at ${timestamp} with version ${version}`);
    }
  }
});

store.set('counter', 1); 
store.delete('counter');
```

These hooks are **non-blocking**: any errors are caught internally so they don't disrupt store operations, but they will be logged in the console if they fail.

---

## 6. Validation

**Validation** is an optional but powerful feature. You can add a validator whenever you **set** or **get** a key, ensuring the data meets certain criteria.

### 6.1 Using a Custom Validator

```typescript
import { KeyValueStore, type ValueValidator } from '@bnk/kv-store';

const isNumber: ValueValidator<number> = (val) => {
  if (typeof val !== 'number') {
    throw new Error('Value must be a number!');
  }
  return val;
};

const store = new KeyValueStore({});
store.set('count', 123, { validator: isNumber }); // OK

// This will throw an error
store.set('count', 'not a number', { validator: isNumber });
```

### 6.2 Using Zod

If you prefer a more robust schema-based approach, use [Zod](https://github.com/colinhacks/zod) or any similar library:

```typescript
import { z } from 'zod';
import { KeyValueStore, ValueValidator } from '@bnk/kv-store';

const userSchema = z.object({
  name: z.string(),
  age: z.number()
});
type User = z.infer<typeof userSchema>;

const userValidator: ValueValidator<User> = (val) => {
  return userSchema.parse(val);
};

const store = new KeyValueStore({});
store.set('user', { name: 'Brandon', age: 30 }, { validator: userValidator });
// If the value doesn’t match the schema, an error is thrown.
```

### 6.3 Validating on `get()`

You can also validate data on retrieval, which is helpful if the data might have changed in a way that no longer meets the schema:

```typescript
const user = store.get<User>('user', { validator: userValidator });
console.log(user?.name, user?.age); // Safe to use
```

---

## 7. Common Use Cases & Example Apps

### 7.1 Small Configuration Store

If your Bun application needs to manage configuration settings:

```typescript
// config-store.ts
import { KeyValueStore, FileAdapter } from '@bnk/kv-store';

const configStore = new KeyValueStore({
  adapter: new FileAdapter({ filePath: 'app-config.json' }),
  syncIntervalMs: 5000,
  enableVersioning: true
});

export async function initConfigStore() {
  await configStore.init();
}

// Save a config key
export function setConfigKey<T>(key: string, value: T) {
  configStore.set<T>(key, value);
}

// Get a config key
export function getConfigKey<T>(key: string): T | undefined {
  return configStore.get<T>(key);
}

// Force immediate persistence
export async function saveConfig() {
  await configStore.sync();
}
```

In another file, you might use it like so:

```typescript
import { initConfigStore, setConfigKey, getConfigKey, saveConfig } from './config-store';

async function main() {
  await initConfigStore();
  
  setConfigKey('apiUrl', 'https://api.example.com');
  setConfigKey('retryCount', 3);

  console.log(getConfigKey<string>('apiUrl')); // "https://api.example.com"
  console.log(getConfigKey<number>('retryCount')); // 3

  // Force save immediately
  await saveConfig();
}

main();
```

### 7.2 Simple “To-Do” CLI App

Using a **file adapter** or **SQLite adapter**, we can store to-do items:

```typescript
// todo-app.ts
import { KeyValueStore, SqliteAdapter } from '@bnk/kv-store';

const store = new KeyValueStore({
  adapter: new SqliteAdapter({ path: 'todo.db' }),
  syncIntervalMs: 10000
});

type Todo = {
  id: number;
  title: string;
  completed: boolean;
};

export async function initTodoStore() {
  await store.init();
}

export async function addTodo(title: string) {
  const todos = store.get<Todo[]>('todos') || [];
  const newId = todos.length ? todos[todos.length - 1].id + 1 : 1;
  const newTodo: Todo = { id: newId, title, completed: false };

  todos.push(newTodo);
  store.set('todos', todos);
  await store.sync();

  return newTodo;
}

export function listTodos(): Todo[] {
  return store.get<Todo[]>('todos') || [];
}

export async function markComplete(id: number) {
  const todos = store.get<Todo[]>('todos') || [];
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = true;
    store.set('todos', todos);
    await store.sync();
  }
  return todo;
}
```

You could create a small CLI (using `process.argv`) to interact with these functions. Each call is in-memory, with a periodic or forced sync to SQLite.

---

## 8. Versioning

When **versioning** is enabled, each data mutation increments an internal counter. You can then query this version number (useful for concurrency checks or data synchronization tasks):

```typescript
import { KeyValueStore } from '@bnk/kv-store';

const store = new KeyValueStore({ enableVersioning: true });
console.log(store.getVersion()); // 0

store.set('key1', 'value1');
console.log(store.getVersion()); // 1

store.delete('key1');
console.log(store.getVersion()); // 2
```

If using an adapter, the **version** is also stored and retrieved upon `store.init()`, so it’s kept in sync across restarts.

---

## 9. Backup Functionality

Both the **SQLite** and **file** adapters have a built-in `backup()` method that copies the database or JSON file to a **timestamped** backup. You trigger it via:

```typescript
await store.createBackup();
```

If you have defined an `onBackup` hook, it will trigger automatically when the backup is successful:

```typescript
const store = new KeyValueStore({
  adapter: new FileAdapter({ filePath: 'my-store.json' }),
  hooks: {
    onBackup: (timestamp, version) => {
      console.log(`Backup at ${timestamp}, store version: ${version}`);
    }
  }
});
```

---

## 10. Best Practices

1. **Set Up Proper Error Handling**  
   - Although the library catches hook errors, you should still handle potential I/O failures (e.g., disk full, invalid JSON, corrupted database files).

2. **Use Validation Where Possible**  
   - This ensures your data remains consistent and typed.

3. **Call `dispose()` If Necessary**  
   - If you have a continuous process, you might not need this. But in short-lived scripts, you can call `store.dispose()` to clear the `syncInterval` timer or other resources.

4. **Test Thoroughly**  
   - The library is well-tested, but your usage might differ. Use the provided test functions or your own test suite to ensure your adapters and logic are correct.

5. **Periodically Backup**  
   - If data is critical, make sure to call `store.createBackup()` regularly or rely on external backup mechanisms. The built-in backup approach simply copies the underlying file or database.

---

## 11. Small Example: Session Management in a Bun HTTP Server

Below is a simple illustration of how you could create a minimal server storing sessions (or tokens) in memory with optional file persistence.

```typescript
// server.ts
import { serve } from 'bun';
import { KeyValueStore, FileAdapter } from '@bnk/kv-store';

const sessionStore = new KeyValueStore({
  adapter: new FileAdapter({ filePath: 'session-data.json' }),
  enableVersioning: true
});

await sessionStore.init();

serve({
  port: 3000,
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/create-session') {
      // Just a silly random token
      const sessionId = Math.random().toString(36).substring(2);
      sessionStore.set(`session-${sessionId}`, { createdAt: Date.now() });
      await sessionStore.sync();

      return new Response(`Session created with ID: ${sessionId}`);
    }

    if (url.pathname.startsWith('/get-session/')) {
      const sessionId = url.pathname.split('/').pop();
      const sessionData = sessionStore.get(`session-${sessionId}`);
      return new Response(JSON.stringify(sessionData, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
});
```

- **Create a new session** by visiting [http://localhost:3000/create-session](http://localhost:3000/create-session).  
- Retrieve session data by going to [http://localhost:3000/get-session/<sessionId>](http://localhost:3000/get-session/<sessionId>).

All sessions are written to memory and (optionally) persisted to `session-data.json` after each update.

---

## 12. API Reference (Quick Summary)

```typescript
class KeyValueStore {
  constructor(config: KeyValueStoreConfig);

  // Initialize store and load any existing data from adapter
  init(): Promise<void>;

  // Get a value by key
  get<T>(key: string, options?: { validator?: ValueValidator<T> }): T | undefined;

  // Set a value by key
  set<T>(key: string, value: unknown, options?: { validator?: ValueValidator<T> }): T;

  // Delete a value by key
  delete(key: string): void;

  // Force sync to external storage
  sync(): Promise<void>;

  // Create a backup (if adapter supports it)
  createBackup(): Promise<void>;

  // Retrieve current version (returns -1 if versioning disabled)
  getVersion(): number;

  // Clean up resources (e.g., clear intervals)
  dispose(): void;
}
```

**Adapters**  

- **`SqliteAdapter`** — syncs with an SQLite DB.  
- **`FileAdapter`** — syncs with a JSON file.  

Each adapter has its own configuration, e.g.:

```typescript
class SqliteAdapter {
  constructor(config: { path: string, tableName?: string });
  // ...
}

class FileAdapter {
  constructor(config: { filePath: string });
  // ...
}
```

---

## 13. Conclusion

`@bnk/kv-store` offers a flexible, extensible way to manage key-value data in Bun. It’s designed with **simplicity**, **performance**, and **testability** in mind. Whether you need a quick in-memory cache or a more robust, validated, and versioned store with SQLite or file persistence, this library has you covered.
