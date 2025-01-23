// Core exports
export { KeyValueStore } from "./key-value-store";

// Type exports
export type {
  KeyValueAdapter,
  KeyValueAdapterWithBackup,
  KeyValueStoreConfig,
  KeyValueStoreHooks,
  SupportsBackup,
  ValueValidator,
} from "./types";

// Adapter exports
export { SqliteAdapter } from "./adapters/sqlite-adapter";
export type { SqliteAdapterConfig } from "./adapters/sqlite-adapter";
export { FileAdapter } from "./adapters/file-adapter";
export type { FileAdapterConfig } from "./adapters/file-adapter";