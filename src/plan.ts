/**
 * The request plan: which text is the state, and which parts are asked
 * against it in which request. Pure — nothing is sent.
 *
 * Jev's ceilings are 32Ki tokens for the state and 64Ki for the whole
 * request. A file that fits is one window. A file that does not is cut
 * on line boundaries into windows whose *core* lines are disjoint and
 * cover the file; each window's text adds OVERLAP_LINES of context on
 * both sides so a part near a cut still sees its surroundings. A part
 * is asked against the window whose core holds it.
 *
 * Per-line costs are summed through prefix sums, so planning a large
 * file is linear; the estimator is the same one the client uses.
 */
import { CRITERIA, TASK, type QuestionStyle } from "./classes.ts";
import { REQUEST_BUDGET, STATE_BUDGET, estimateTokens } from "./estimate.ts";
import { buildQuestion, lineStartsOf, locate, questionId } from "./questions.ts";
import { isAskable, type Part } from "./split.ts";

export const OVERLAP_LINES = 40;
/** Fixed cost of the state envelope beyond the source text. */
const STATE_OVERHEAD = 64;

export interface Window {
  text: string;
  /** 1-based source line of the window's first line. */
  firstLine: number;
  /** Source offsets of the window text. */
  start: number;
  end: number;
  /** True when even this text alone is over the state budget; nothing is asked against it. */
  oversized: boolean;
}

export interface Batch {
  window: number;
  /** Indexes into the parts array. */
  parts: number[];
}

export interface Plan {
  windows: Window[];
  batches: Batch[];
  /** Askable parts that no batch will ask, because their window is oversized. */
  skipped: number;
  estimatedTokens: number;
}

export function stateOf(window: Window, filename: string | null, style: QuestionStyle = "full"): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (style === "lean") {
    state.task = filename ? `${TASK} The file is named ${filename}; use the name only as a hint to the language.` : TASK;
  }
  if (style === "legend" || style === "lean") state.legend = { ...CRITERIA };
  if (filename) state.path = filename;
  state.source = window.text;
  return state;
}

export interface PlanOptions {
  filename?: string | null;
  style?: QuestionStyle;
}

interface Line {
  start: number;
  end: number;
  cost: number;
}

function linesOf(code: string): Line[] {
  const starts = lineStartsOf(code);
  return starts.map((s, i) => {
    const e = i + 1 < starts.length ? starts[i + 1]! : code.length;
    return { start: s, end: e, cost: (JSON.stringify(code.slice(s, e)).length - 2) / 3.4 };
  });
}

export function buildPlan(code: string, parts: Part[], opts: PlanOptions): Plan {
  const filename = opts.filename ?? null;
  const style = opts.style ?? "full";
  // What the state costs beyond the source: the path, and the legend when the style carries one.
  const pathCost = (filename ? estimateTokens(filename) + 4 : 0) + (style === "legend" || style === "lean" ? estimateTokens(CRITERIA) + estimateTokens(TASK) + 12 : 0);
  const budget = STATE_BUDGET - STATE_OVERHEAD - pathCost;
  const lines = linesOf(code);
  const n = lines.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + lines[i]!.cost;
  const costOf = (from: number, to: number) => prefix[to]! - prefix[from]!;

  // Windows: disjoint cores [i, j), each padded by `overlap` lines.
  const windows: Window[] = [];
  const cores: Array<{ from: number; to: number }> = [];
  if (estimateTokens({ source: code }) + pathCost <= STATE_BUDGET - STATE_OVERHEAD) {
    windows.push({ text: code, firstLine: 1, start: 0, end: code.length, oversized: false });
    cores.push({ from: 0, to: n });
  } else {
    const fits = (i: number, j: number, ov: number) => costOf(Math.max(0, i - ov), Math.min(n, j + ov)) <= budget;
    let i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && fits(i, j + 1, OVERLAP_LINES)) j += 1;
      let overlap = OVERLAP_LINES;
      while (overlap > 0 && !fits(i, j, overlap)) overlap = Math.floor(overlap / 2);
      const from = Math.max(0, i - overlap);
      const to = Math.min(n, j + overlap);
      const start = lines[from]!.start;
      const end = lines[to - 1]!.end;
      windows.push({ text: code.slice(start, end), firstLine: from + 1, start, end, oversized: !fits(i, j, overlap) });
      cores.push({ from: i, to: j });
      i = j;
    }
  }

  // Batches: askable parts of each core, packed under the request budget.
  const lineStarts = lineStartsOf(code);
  const batches: Batch[] = [];
  let skipped = 0;
  let estimatedTokens = 0;
  let p = 0;
  for (let w = 0; w < windows.length; w++) {
    const win = windows[w]!;
    const core = cores[w]!;
    const coreStart = lines[core.from]!.start;
    const coreEnd = lines[core.to - 1]!.end;
    const stateTokens = estimateTokens(stateOf(win, filename, style));
    let current: Batch = { window: w, parts: [] };
    let used = stateTokens;
    while (p < parts.length && parts[p]!.start < coreEnd) {
      const part = parts[p]!;
      p += 1;
      if (part.start < coreStart || !isAskable(part)) continue;
      if (win.oversized) {
        skipped += 1;
        continue;
      }
      const at = locate(part, lineStarts);
      // Context comes from the file (offsets are file offsets); the window is only the state.
      const q = buildQuestion(code, part, questionId(p - 1), { line: at.line - win.firstLine + 1, col: at.col }, filename, style);
      const qTokens = estimateTokens(q);
      if (current.parts.length > 0 && used + qTokens > REQUEST_BUDGET) {
        batches.push(current);
        estimatedTokens += used;
        current = { window: w, parts: [] };
        used = stateTokens;
      }
      current.parts.push(p - 1);
      used += qTokens;
    }
    if (current.parts.length > 0) {
      batches.push(current);
      estimatedTokens += used;
    }
  }
  return { windows, batches, skipped, estimatedTokens };
}
