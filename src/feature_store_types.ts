
// These interfaces are really part of the Node SDK's API for feature store components, but
// they were not included in the Node SDK's own TypeScript definitions; instead it uses "object"
// or "any" for these things in its LDFeatureStore interface (and in the undocumented internal
// interfaces used by CachingStoreWrapper). Changing that interface in the SDK would technically
// be a breaking change even if the underlying behavior was the same, so until the next major
// version of the SDK, these types are declared within each database package.

export interface DataKind {
  namespace: string;
}

export interface VersionedData {
  key: string;
  version: number;
  deleted?: boolean;
}

export interface KeyedItems {
  [name: string]: VersionedData;
}

export interface DataCollection {
  kind: DataKind,
  items: Array<VersionedData>,
}

export interface FullDataSet {
  [namespace: string]: KeyedItems;
}
