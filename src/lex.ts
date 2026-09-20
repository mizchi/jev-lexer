/**
 * The orchestrator, and the only place a request is made:
 * split → plan → (cache | ask) per batch → merge.
 *
 * A batch that fails leaves its parts plain and is counted in
 * `unanswered`; a highlighter that silently painted everything white on
 * a failure would look like success, so the count is part of the
 * result and the CLI turns it into a non-zero exit.
 */
import { isTokenClass } from "./classes.ts";
import { cacheKey, type AnswerCache } from "./cache.ts";
import { DEFAULT_CONCURRENCY, Jev, JevError, mapLimit, type AskClient, type Question, type Spend } from "./jev.ts";
import { mergeSpans, type PartLabel, type Span } from "./merge.ts";
import { buildPlan, stateOf, type Plan } from "./plan.ts";
import { buildQuestion, lineStartsOf, locate, questionId, readChoice } from "./questions.ts";
import { splitParts, type Part } from "./split.ts";

export interface LexOptions {
  client?: AskClient;
  cache?: AnswerCache | null;
  /** Below this a part is plain. Default 0: every answer is used. */
  minConfidence?: number;
  /** Optional hint, e.g. "src/app.tsx". Nothing is inferred from it locally. */
  filename?: string | null;
  concurrency?: number;
}

export interface LexResult {
  spans: Span[];
  parts: Part[];
  labels: Array<PartLabel | null>;
  /** Askable parts with no usable answer: skipped by the plan, failed request, or an unknown label. */
  unanswered: number;
  errors: JevError[];
  spent: Spend;
  plan: Plan;
}

export async function lex(code: string, opts: LexOptions = {}): Promise<LexResult> {
  const parts = splitParts(code);
  const filename = opts.filename ?? null;
  const plan = buildPlan(code, parts, { filename });
  const client = opts.client ?? new Jev();
  const cache = opts.cache ?? null;
  const lineStarts = lineStartsOf(code);
  const labels: Array<PartLabel | null> = new Array(parts.length).fill(null);
  const errors: JevError[] = [];
  let unanswered = plan.skipped;

  await mapLimit(plan.batches, opts.concurrency ?? DEFAULT_CONCURRENCY, async (batch) => {
    const window = plan.windows[batch.window]!;
    const state = stateOf(window, filename);
    const questions: Record<string, Question> = {};
    const pending: Array<{ index: number; id: string; key: string }> = [];
    for (const index of batch.parts) {
      const part = parts[index]!;
      const at = locate(part, lineStarts);
      const id = questionId(index);
      const q = buildQuestion(code, part, id, { line: at.line - window.firstLine + 1, col: at.col }, filename);
      const key = cacheKey(client.model, state, q);
      const hit = cache?.get(key);
      if (hit) {
        labels[index] = hit;
        continue;
      }
      questions[id] = q;
      pending.push({ index, id, key });
    }
    if (pending.length === 0) return;
    let res;
    try {
      res = await client.askSplitting(state, questions);
    } catch (err: unknown) {
      if (err instanceof JevError && err.kind === "auth") throw err;
      errors.push(err instanceof JevError ? err : new JevError(String(err)));
      unanswered += pending.length;
      return;
    }
    for (const { index, id, key } of pending) {
      const c = readChoice(res.answers, id);
      if (!c || !isTokenClass(c.choice)) {
        unanswered += 1;
        continue;
      }
      const label: PartLabel = { type: c.choice, confidence: c.confidence };
      labels[index] = label;
      cache?.set(key, label);
    }
  });

  const spans = mergeSpans(parts, labels, opts.minConfidence ?? 0);
  return { spans, parts, labels, unanswered, errors, spent: client.spent, plan };
}
