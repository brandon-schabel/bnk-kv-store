# @bnk/kv-store

A highly modular, zero-dependency, TypeScript-based key-value store for Bun with support for:
- In-memory caching first (always)
- Optional syncing to various data stores (SQLite, file, etc.)
- Flexible validators (e.g., Zod, ArkType, or any custom function)
- Simple hook system (onUpdate, onDelete, etc.)
- Versioning and timestamped backups
- Performance optimizations (using Maps in memory, minimizing writes)
- Highly testable architecture (each module is focused and pluggable)

## Installation

```bash
bun add @bnk/kv-store
```

## Usage

### Basic In-Memory Store

```typescript
import { KeyValueStore } from '@bnk/kv-store';

const store = new KeyValueStore({});

// Set a value
store.set('name', 'Brandon');

// Get a value
const name = store.get('name'); // Brandon

// Delete a value
store.delete('name');
```

### With SQLite Persistence

```typescript
import { KeyValueStore, SqliteAdapter } from '@bnk/kv-store';

const adapter = new SqliteAdapter({ path: 'my-store.db' });
const store = new KeyValueStore({
  adapter,
  syncIntervalMs: 5000, // sync every 5 seconds
});

// Initialize the store (creates tables if needed)
await store.init();

// Set values (stored in memory first)
store.set('user', { name: 'Brandon', age: 30 });

// Force a sync to SQLite right now
await store.sync();

// Create a backup
await store.createBackup();
```

### With File Persistence

```typescript
import { KeyValueStore, FileAdapter } from '@bnk/kv-store';

const adapter = new FileAdapter({ filePath: 'my-store.json' });
const store = new KeyValueStore({ adapter });

await store.init();
store.set('settings', { theme: 'dark' });
await store.sync();
```

### With Validation

```typescript
import { KeyValueStore, type ValueValidator } from '@bnk/kv-store';

// Custom validator
const numberValidator: ValueValidator<number> = (val) => {
  if (typeof val !== 'number') {
    throw new Error('Value must be a number');
  }
  return val;
};

const store = new KeyValueStore({});

// Set with validation
store.set('count', 42, { validator: numberValidator });

// Get with validation
const count = store.get('count', { validator: numberValidator });
```

### With Hooks

```typescript
import { KeyValueStore } from '@bnk/kv-store';

const store = new KeyValueStore({
  hooks: {
    onUpdate: (key, value) => {
      console.log(`Key ${key} was updated with:`, value);
    },
    onDelete: (key) => {
      console.log(`Key ${key} was deleted`);
    },
    onBackup: (timestamp, version) => {
      console.log(`Backup created at ${timestamp}, version ${version}`);
    },
  },
  enableVersioning: true,
});
```

### With Zod Validation

```typescript
import { z } from 'zod';
import { KeyValueStore, type ValueValidator } from '@bnk/kv-store';

// Define a Zod schema
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
});

// Create a validator from the schema
const userValidator: ValueValidator<z.infer<typeof UserSchema>> = (val) => {
  return UserSchema.parse(val);
};

const store = new KeyValueStore({});

// Set with Zod validation
store.set('user', { name: 'Brandon', age: 30 }, { validator: userValidator });

// Get with Zod validation
const user = store.get('user', { validator: userValidator });
```

## API Reference

### KeyValueStore

The main class that manages the key-value store.

```typescript
class KeyValueStore {
  constructor(config: KeyValueStoreConfig);
  init(): Promise<void>;
  get<T>(key: string, options?: { validator?: ValueValidator<T> }): T | undefined;
  set<T>(key: string, value: unknown, options?: { validator?: ValueValidator<T> }): T;
  delete(key: string): void;
  sync(): Promise<void>;
  createBackup(): Promise<void>;
  getVersion(): number;
  dispose(): void;
}
```

### Adapters

#### SqliteAdapter

```typescript
class SqliteAdapter implements KeyValueAdapterWithBackup {
  constructor(config: { path: string; tableName?: string });
  // ... implements KeyValueAdapter interface
}
```

#### FileAdapter

```typescript
class FileAdapter implements KeyValueAdapterWithBackup {
  constructor(config: { filePath: string });
  // ... implements KeyValueAdapter interface
}
```

## License

MIT 