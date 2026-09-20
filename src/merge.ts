/**
 * Parts plus answers become spans. A part with no answer, or one under
 * the caller's confidence floor, is plain. Whitespace takes the class
 * of its neighbours when both agree, so `// a comment` is one span,
 * and is plain otherwise. A newline always ends a span and belongs to
 * none, which is what makes the line-based token layer trivial.
 */
import type { TokenClass } from "./classes.ts";
import type { Part } from "./split.ts";

export interface PartLabel {
  type: TokenClass;
  confidence: number;
}

export interface Span {
  type: TokenClass;
  start: number;
  end: number;
  /** Minimum over the merged parts; whitespace counts as 1. */
  confidence: number;
}

export function mergeSpans(parts: Part[], labels: ReadonlyArray<PartLabel | null>, minConfidence = 0): Span[] {
  // Pass 1: a class per part. null marks a newline (a hard break).
  const classes: Array<TokenClass | null> = new Array(parts.length);
  const confidences: number[] = new Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.kind === "newline") {
      classes[i] = null;
      confidences[i] = 1;
      continue;
    }
    if (p.kind === "space") {
      classes[i] = "plain";
      confidences[i] = 1;
      continue;
    }
    const l = labels[i];
    if (!l || l.confidence < minConfidence) {
      classes[i] = "plain";
      confidences[i] = l ? l.confidence : 0;
    } else {
      classes[i] = l.type;
      confidences[i] = l.confidence;
    }
  }
  // Pass 2: whitespace between two equal non-plain neighbours on the same line takes their class.
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]!.kind !== "space") continue;
    const prev = i > 0 ? classes[i - 1] : null;
    let j = i + 1;
    while (j < parts.length && parts[j]!.kind === "space") j += 1;
    const next = j < parts.length ? classes[j] : null;
    if (prev !== null && prev !== undefined && prev === next && prev !== "plain") {
      for (let k = i; k < j; k++) classes[k] = prev;
    }
    i = j - 1;
  }
  // Pass 3: fold runs.
  const spans: Span[] = [];
  let open: Span | null = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const c = classes[i];
    if (c === null || c === undefined) {
      open = null;
      continue;
    }
    if (open && open.type === c && open.end === p.start) {
      open.end = p.end;
      open.confidence = Math.min(open.confidence, confidences[i]!);
    } else {
      open = { type: c, start: p.start, end: p.end, confidence: confidences[i]! };
      spans.push(open);
    }
  }
  return spans;
}
