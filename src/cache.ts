/**
 * A content-addressed answer cache: one JSON file, loaded and saved
 * whole. The key covers the model, the class contract, the state the
 * question was asked against and the question itself, so a change to
 * any of them is a miss and never a stale hit.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { CLASSES_HASH } from "./classes.ts";
import type { Question } from "./jev.ts";
import type { PartLabel } from "./merge.ts";

export function cacheKey(model: string, state: unknown, question: Question): string {
  return createHash("sha256")
    .update(JSON.stringify([model, CLASSES_HASH, state, question]))
    .digest("hex");
}

interface CacheFile {
  version: 1;
  entries: Record<string, PartLabel>;
}

export class AnswerCache {
  path: string | null;
  private entries: Map<string, PartLabel>;
  private dirty = false;

  constructor(path: string | null, entries: Record<string, PartLabel> = {}) {
    this.path = path;
    this.entries = new Map(Object.entries(entries));
  }

  /** Open a cache file, or an empty cache when the file does not exist. */
  static async open(path: string): Promise<AnswerCache> {
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as CacheFile;
      return new AnswerCache(path, raw.version === 1 ? raw.entries : {});
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return new AnswerCache(path);
      throw err;
    }
  }

  get size(): number {
    return this.entries.size;
  }
  get(key: string): PartLabel | undefined {
    return this.entries.get(key);
  }
  set(key: string, label: PartLabel): void {
    this.entries.set(key, label);
    this.dirty = true;
  }

  async save(): Promise<void> {
    if (!this.path || !this.dirty) return;
    const file: CacheFile = { version: 1, entries: Object.fromEntries(this.entries) };
    await writeFile(this.path, JSON.stringify(file));
    this.dirty = false;
  }
}
