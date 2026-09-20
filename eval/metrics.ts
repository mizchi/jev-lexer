/**
 * Reduce per-character labels to per-part labels over our own parts,
 * then score the way gpu-lexer reports: agreement over supervised
 * (non-whitespace) parts, macro F1 over the eight coloured classes,
 * the rate at which truly-plain parts were coloured, and a confusion
 * matrix.
 */
import { TOKEN_CLASSES, type TokenClass } from "../src/classes.ts";
import { isAskable, type Part } from "../src/split.ts";

/** Coloured classes first, so a tie with plain goes to the colour: plain is the default, not a vote. */
const MAJORITY_ORDER: readonly TokenClass[] = [...TOKEN_CLASSES.filter((c) => c !== "plain"), "plain"];

/** Majority class over a part's characters, ties to the coloured class; whitespace parts are null. */
export function partLabels(parts: Part[], chars: ReadonlyArray<TokenClass>): Array<TokenClass | null> {
  return parts.map((p) => {
    if (!isAskable(p)) return null;
    const counts = new Map<TokenClass, number>();
    for (let i = p.start; i < p.end; i++) {
      const c = chars[i] ?? "plain";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: TokenClass = "plain";
    let n = -1;
    for (const c of MAJORITY_ORDER) {
      const k = counts.get(c) ?? 0;
      if (k > n) {
        best = c;
        n = k;
      }
    }
    return best;
  });
}

export type Confusion = Partial<Record<TokenClass, Partial<Record<TokenClass, number>>>>;

export interface ClassScore {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface Score {
  supervised: number;
  agreement: number;
  macroF1: number;
  plainFalseColour: number;
  perClass: Record<TokenClass, ClassScore>;
  confusion: Confusion;
}

export function score(truth: ReadonlyArray<TokenClass | null>, pred: ReadonlyArray<TokenClass | null>): Score {
  const confusion: Confusion = {};
  let supervised = 0;
  let agree = 0;
  let plainTotal = 0;
  let plainColoured = 0;
  for (let i = 0; i < truth.length; i++) {
    const t = truth[i];
    if (t === null || t === undefined) continue;
    const p = pred[i] ?? "plain";
    supervised += 1;
    if (t === p) agree += 1;
    if (t === "plain") {
      plainTotal += 1;
      if (p !== "plain") plainColoured += 1;
    }
    const row = (confusion[t] ??= {});
    row[p] = (row[p] ?? 0) + 1;
  }
  const perClass = {} as Record<TokenClass, ClassScore>;
  let f1Sum = 0;
  let f1Count = 0;
  for (const c of TOKEN_CLASSES) {
    const tp = confusion[c]?.[c] ?? 0;
    const support = Object.values(confusion[c] ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    const predicted = TOKEN_CLASSES.reduce((a, t) => a + (confusion[t]?.[c] ?? 0), 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[c] = { precision, recall, f1, support };
    if (c !== "plain" && support > 0) {
      f1Sum += f1;
      f1Count += 1;
    }
  }
  return {
    supervised,
    agreement: supervised ? agree / supervised : 0,
    macroF1: f1Count ? f1Sum / f1Count : 0,
    plainFalseColour: plainTotal ? plainColoured / plainTotal : 0,
    perClass,
    confusion,
  };
}

/** Sum several scores' confusions into one, then re-derive the rest. */
export function combine(scores: Score[]): Score {
  const truth: TokenClass[] = [];
  const pred: TokenClass[] = [];
  for (const s of scores) {
    for (const t of TOKEN_CLASSES) {
      for (const p of TOKEN_CLASSES) {
        const n = s.confusion[t]?.[p] ?? 0;
        for (let i = 0; i < n; i++) {
          truth.push(t);
          pred.push(p);
        }
      }
    }
  }
  return score(truth, pred);
}
