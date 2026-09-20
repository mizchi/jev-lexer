/**
 * One `choice` per askable part. The question carries the part's text
 * and a little same-line context; the whole file travels once as the
 * request's state. Thresholds never appear here — a cutoff is a
 * decision the caller makes from the answer.
 */
import { CRITERIA, TASK, taskNamed } from "./classes.ts";
import type { ChoiceQuestion } from "./jev.ts";
import type { Part } from "./split.ts";

export const CONTEXT_UNITS = 24;

export function questionId(i: number): string {
  return `q${String(i).padStart(5, "0")}`;
}

/** Offsets at which each line begins; a trailing newline starts no line. */
export function lineStartsOf(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    if (c === 10 || (c === 13 && code.charCodeAt(i + 1) !== 10)) {
      if (i + 1 < code.length) starts.push(i + 1);
    }
  }
  return starts;
}

export interface Position {
  line: number;
  col: number;
}

/** 1-based line and column of a part, by binary search over line starts. */
export function locate(part: Part, lineStarts: number[]): Position {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= part.start) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: part.start - lineStarts[lo]! + 1 };
}

/** Same-line text on either side of the part, clipped to CONTEXT_UNITS. */
export function contextOf(code: string, part: Part): { before: string; after: string } {
  let b = part.start;
  while (b > 0 && part.start - b < CONTEXT_UNITS) {
    const c = code.charCodeAt(b - 1);
    if (c === 10 || c === 13) break;
    b -= 1;
  }
  let a = part.end;
  while (a < code.length && a - part.end < CONTEXT_UNITS) {
    const c = code.charCodeAt(a);
    if (c === 10 || c === 13) break;
    a += 1;
  }
  return { before: code.slice(b, part.start), after: code.slice(part.end, a) };
}

export function buildQuestion(
  code: string,
  part: Part,
  id: string,
  at: Position,
  filename: string | null,
): ChoiceQuestion {
  const { before, after } = contextOf(code, part);
  return {
    type: "choice",
    instructions: {
      task: filename ? taskNamed(filename) : TASK,
      subject: id,
      line: at.line,
      col: at.col,
      text: part.text,
      before,
      after,
    },
    criteria: { ...CRITERIA },
  };
}

export interface Choice {
  choice: string;
  confidence: number;
  probabilities: Record<string, number> | null;
}

export function readChoice(answers: Record<string, unknown> | undefined, id: string): Choice | null {
  const a = answers?.[id] as
    | { type?: string; choice?: unknown; confidence?: unknown; probabilities?: unknown }
    | undefined;
  if (!a || a.type !== "choice" || typeof a.choice !== "string") return null;
  return {
    choice: a.choice,
    confidence: typeof a.confidence === "number" ? a.confidence : 0,
    probabilities: (a.probabilities as Record<string, number> | undefined) ?? null,
  };
}
