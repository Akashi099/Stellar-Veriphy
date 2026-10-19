import { readdir, stat, unlink } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export interface StoredObject {
  /** Backend-specific key, e.g. a path relative to the storage root. */
  key: string;
  sizeBytes: number;
  lastModified: Date;
}

/**
 * Minimal media storage surface needed by orphan cleanup (#782). Implementations translate between
 * their own object keys and the references stored in MongoDB (`storageRef`, `tempUploadRef`).
 */
export interface MediaStorage {
  /** Short name for logs and metrics, e.g. "local". */
  readonly name: string;
  /** Yields every stored object. Order does not matter. */
  list(): AsyncIterable<StoredObject>;
  /** The reference string a database record would hold for `key`. */
  refFor(key: string): string;
  /** The object key for a database reference, or undefined if the reference belongs to another backend. */
  keyFromRef(ref: string): string | undefined;
  delete(key: string): Promise<void>;
}

const LOCAL_SCHEME = "local://";

/**
 * Media stored on a local or mounted filesystem under `root`. References are `local://<relative path>`;
 * bare relative paths are accepted as well. Keys can never resolve outside `root`.
 */
export class LocalMediaStorage implements MediaStorage {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async *list(): AsyncIterable<StoredObject> {
    const pending = [this.root];
    while (pending.length > 0) {
      const dir = pending.pop()!;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.isFile()) {
          const info = await stat(full);
          yield { key: relative(this.root, full).split(sep).join("/"), sizeBytes: info.size, lastModified: info.mtime };
        }
      }
    }
  }

  refFor(key: string): string {
    return `${LOCAL_SCHEME}${key}`;
  }

  keyFromRef(ref: string): string | undefined {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref) && !ref.startsWith(LOCAL_SCHEME)) return undefined;
    const key = ref.startsWith(LOCAL_SCHEME) ? ref.slice(LOCAL_SCHEME.length) : ref;
    return this.resolveKey(key) ? key.replace(/^\/+/, "") : undefined;
  }

  async delete(key: string): Promise<void> {
    const path = this.resolveKey(key);
    if (!path) throw new Error(`Refusing to delete "${key}": outside the media storage root`);
    try {
      await unlink(path);
    } catch (err) {
      // Already gone (e.g. removed by a concurrent run) is the desired end state.
      if ((err as { code?: string }).code !== "ENOENT") throw err;
    }
  }

  private resolveKey(key: string): string | undefined {
    const path = resolve(this.root, key.replace(/^\/+/, ""));
    return path.startsWith(this.root + sep) ? path : undefined;
  }
}
