/**
 * Input-token estimate and the two server ceilings, ported from
 * jev-lint's batch.ts. The estimate is approximate on purpose: the
 * client reacts to the server's `max_tokens_exceeded` by halving the
 * question set, so this only has to be close enough for planning and
 * for a dry-run price.
 */
export const MAX_REQUEST_TOKENS = 65_536;
export const MAX_STATE_TOKENS = 32_768;
export const STATE_MARGIN = 1.25;
export const REQUEST_MARGIN = 1.1;
export const STATE_BUDGET = Math.floor(MAX_STATE_TOKENS / STATE_MARGIN);
export const REQUEST_BUDGET = Math.floor(MAX_REQUEST_TOKENS / REQUEST_MARGIN);

const CHARS_PER_TOKEN_TEXT = 3.4;
const CHARS_PER_TOKEN_STRUCT = 2.2;
const TEXT_LIKE_LENGTH = 64;

export function estimateTokens(value: unknown): number {
  return Math.ceil(cost(value));
}

function cost(value: unknown): number {
  if (typeof value === "string") {
    const len = JSON.stringify(value).length;
    return len / (value.length >= TEXT_LIKE_LENGTH ? CHARS_PER_TOKEN_TEXT : CHARS_PER_TOKEN_STRUCT);
  }
  if (value === null || typeof value !== "object") {
    return String(value).length / CHARS_PER_TOKEN_STRUCT;
  }
  if (Array.isArray(value)) {
    return (2 + Math.max(0, value.length - 1)) / CHARS_PER_TOKEN_STRUCT + value.reduce((s: number, v) => s + cost(v), 0);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    (2 + Math.max(0, entries.length - 1)) / CHARS_PER_TOKEN_STRUCT +
    entries.reduce((s, [k, v]) => s + (k.length + 3) / CHARS_PER_TOKEN_STRUCT + cost(v), 0)
  );
}

/** Price of one estimated/actual input-token count. Output is not billed. */
export const USD_PER_MTOK = 0.042;
export function usdFor(inputTokens: number): number {
  return (inputTokens / 1_000_000) * USD_PER_MTOK;
}
