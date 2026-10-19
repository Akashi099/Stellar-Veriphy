import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.VERIPHY_DATA_DIR ?? path.join(process.cwd(), ".data");

// Minimal file-backed record store: one JSON array per collection, cached in
// memory, written atomically (temp file + rename) with writes serialized.
export class JsonCollection<T extends { id: string }> {
  private records: Promise<Map<string, T>> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly name: string) {}

  private get file(): string {
    return path.join(DATA_DIR, `${this.name}.json`);
  }

  private load(): Promise<Map<string, T>> {
    this.records ??= fs.readFile(this.file, "utf8").then(
      (raw) => new Map((JSON.parse(raw) as T[]).map((r) => [r.id, r])),
      (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return new Map<string, T>();
        this.records = null;
        throw err;
      },
    );
    return this.records;
  }

  async get(id: string): Promise<T | undefined> {
    return (await this.load()).get(id);
  }

  async all(): Promise<T[]> {
    return [...(await this.load()).values()];
  }

  async put(record: T): Promise<void> {
    const records = await this.load();
    records.set(record.id, record);
    const snapshot = JSON.stringify([...records.values()], null, 2);
    const write = this.writeChain.then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, snapshot, "utf8");
      await fs.rename(tmp, this.file);
    });
    this.writeChain = write.catch(() => {});
    return write;
  }
}

// Reuse one instance per collection across hot reloads in development.
const registry = globalThis as unknown as { __veriphyCollections?: Map<string, JsonCollection<never>> };

export function collection<T extends { id: string }>(name: string): JsonCollection<T> {
  registry.__veriphyCollections ??= new Map();
  let existing = registry.__veriphyCollections.get(name);
  if (!existing) {
    existing = new JsonCollection<never>(name);
    registry.__veriphyCollections.set(name, existing);
  }
  return existing as unknown as JsonCollection<T>;
}
