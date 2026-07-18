export type StoredObject = {
  key: string;
  byteSize: number;
};

export interface StorageAdapter {
  put(key: string, body: Uint8Array): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  openReadStream(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
