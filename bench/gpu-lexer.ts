/**
 * gpu-lexer's promoted checkpoint, run on the CPU through its own
 * training-side JavaScript (tree-model.js) — the same code its
 * correctness benchmark uses — so the comparison needs no browser.
 * The int6 deployed weights are used, as the browser package ships them.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { isTokenClass, type TokenClass } from "../src/classes.ts";

const ROOT = new URL("./vendor/gpu-lexer/", import.meta.url);
const TRAINING = new URL("packages/training/src/", ROOT);

interface TreeRecord {
  features: unknown[];
  ranges: Uint32Array;
}

interface Loaded {
  classNames: readonly string[];
  model: Record<string, Float32Array>;
  shape: { hiddenSize: number; classifierSize: number; hashBuckets: number };
  featureVersion: number;
  createTreeRecord: (item: unknown, hashBuckets: number, opts: unknown) => { record: TreeRecord };
  treeProbabilities: (model: unknown, record: unknown, shape: unknown) => Float32Array[];
}

let loaded: Promise<Loaded | null> | null = null;

export async function gpuLexerAvailable(): Promise<boolean> {
  return (await load()) !== null;
}

async function load(): Promise<Loaded | null> {
  loaded ??= (async () => {
    if (!existsSync(new URL("packages/training/active/model-active.json", ROOT))) return null;
    const [{ classNames }, { loadFloatCheckpoint }, { dequantizeTensors }, { createTreeRecord, treeProbabilities }] =
      await Promise.all([
        import(new URL("classes.js", TRAINING).href),
        import(new URL("checkpoint.js", TRAINING).href),
        import(new URL("quantization.js", TRAINING).href),
        import(new URL("tree-model.js", TRAINING).href),
      ]);
    const checkpoint = await loadFloatCheckpoint(new URL("packages/training/active", ROOT).pathname);
    const bits = checkpoint.metadata.quantization.bits;
    const weightName = (await readdir(checkpoint.path)).find((n: string) => new RegExp(`^weights-int${bits}-.+\\.bin$`).test(n));
    if (!weightName) throw new Error("gpu-lexer: deployed int weights missing");
    const model = dequantizeTensors(await readFile(resolve(checkpoint.path, weightName)), checkpoint.metadata.quantization);
    return {
      classNames,
      model,
      shape: {
        hiddenSize: checkpoint.metadata.hiddenSize,
        classifierSize: checkpoint.metadata.architecture.classifierDimensions,
        hashBuckets: checkpoint.metadata.architecture.lexemeHashBuckets,
      },
      featureVersion: checkpoint.metadata.featureVersion,
      createTreeRecord,
      treeProbabilities,
    };
  })();
  return loaded;
}

function argmax(v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[best]!) best = i;
  return best;
}

/** One class per character; whitespace and anything unlabelled is plain. */
export async function gpuLexerChars(code: string): Promise<TokenClass[]> {
  const g = await load();
  if (!g) throw new Error("gpu-lexer submodule is not checked out: git submodule update --init");
  const item = { source: code, sourceLabels: [], language: "unknown", path: "input" };
  const { record } = g.createTreeRecord(item, g.shape.hashBuckets, { featureVersion: g.featureVersion, retainSource: true });
  const probs = g.treeProbabilities(g.model, record, g.shape);
  const out: TokenClass[] = new Array(code.length).fill("plain");
  for (let i = 0; i < probs.length; i++) {
    const name = g.classNames[argmax(probs[i]!)];
    const cls: TokenClass = isTokenClass(name) ? name : "plain";
    const from = record.ranges[i * 2]!;
    const to = record.ranges[i * 2 + 1]!;
    for (let k = from; k < to; k++) out[k] = cls;
  }
  return out;
}
