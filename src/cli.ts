#!/usr/bin/env node
/**
 * jev-lexer <file> [--html|--ansi|--json] [--theme name] [--no-filename]
 *                  [--dry-run] [--cache path|--no-cache] [--compare [--lang id]]
 * jev-lexer eval  [--replay] [--repeat N]
 * jev-lexer bench [--replay]
 *
 * Exit codes: 0 ok, 2 configuration error (no key, bad theme, missing
 * file), 3 requests failed (unanswered > 0).
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { AnswerCache } from "./cache.ts";
import type { TokenClass } from "./classes.ts";
import { usdFor } from "./estimate.ts";
import { API_KEY_VARS, Jev, JevError, fromEnv } from "./jev.ts";
import { lex } from "./lex.ts";
import { mergeSpans, type Span } from "./merge.ts";
import { buildPlan } from "./plan.ts";
import { splitParts } from "./split.ts";
import { resolveTheme, toThemedTokens, type ThemeRegistrationAny, type ThemeRegistrationResolved } from "./tokens.ts";
import { tokensToHtml } from "./html.ts";
import { tokensToAnsi } from "./ansi.ts";

export type Format = "html" | "ansi" | "json";

export interface CliArgs {
  command: "highlight" | "eval" | "bench";
  file: string | null;
  format: Format | null;
  theme: string;
  filename: boolean;
  dryRun: boolean;
  cache: string | null;
  compare: boolean;
  lang: string | null;
  replay: boolean;
  repeat: number;
  minConfidence: number;
  arms: string[];
}

export function parseCli(argv: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      html: { type: "boolean", default: false },
      ansi: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      theme: { type: "string", default: "github-dark" },
      "no-filename": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      cache: { type: "string" },
      "no-cache": { type: "boolean", default: false },
      compare: { type: "boolean", default: false },
      lang: { type: "string" },
      replay: { type: "boolean", default: false },
      repeat: { type: "string", default: "1" },
      "min-confidence": { type: "string", default: "0" },
      arms: { type: "string", default: "bare,named" },
    },
  });
  const first = positionals[0] ?? null;
  const command = first === "eval" || first === "bench" ? first : "highlight";
  const format: Format | null = values.html ? "html" : values.ansi ? "ansi" : values.json ? "json" : null;
  return {
    command,
    file: command === "highlight" ? first : null,
    format,
    theme: values.theme!,
    filename: !values["no-filename"],
    dryRun: values["dry-run"]!,
    cache: values["no-cache"] ? null : (values.cache ?? ".jev-lexer-cache.json"),
    compare: values.compare!,
    lang: values.lang ?? null,
    replay: values.replay!,
    repeat: Math.max(1, Number.parseInt(values.repeat!, 10) || 1),
    minConfidence: Number.parseFloat(values["min-confidence"]!) || 0,
    arms: values.arms!.split(",").map((a) => a.trim()).filter(Boolean),
  };
}

export async function loadTheme(name: string): Promise<ThemeRegistrationAny> {
  try {
    const mod = (await import(`@shikijs/themes/${name}`)) as { default: ThemeRegistrationAny };
    return mod.default;
  } catch (err: unknown) {
    throw new Error(`theme "${name}" is not a @shikijs/themes name (${(err as Error).message})`);
  }
}

class ExitError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

async function highlight(args: CliArgs): Promise<number> {
  if (!args.file) throw new ExitError(2, "usage: jev-lexer <file> [--html|--ansi|--json] [--theme name]");
  const file = args.file;
  const code = await readFile(file, "utf8").catch(() => {
    throw new ExitError(2, `cannot read ${file}`);
  });
  const filename = args.filename ? file : null;
  if (args.dryRun) {
    const plan = buildPlan(code, splitParts(code), { filename });
    const asked = plan.batches.reduce((n, b) => n + b.parts.length, 0);
    process.stdout.write(
      `${plan.windows.length} window(s), ${plan.batches.length} request(s), ${asked} question(s), ${plan.skipped} skipped\n` +
        `~${plan.estimatedTokens.toLocaleString()} input tokens, ~$${usdFor(plan.estimatedTokens).toFixed(5)}\n`,
    );
    return 0;
  }
  if (!fromEnv(API_KEY_VARS)) throw new ExitError(2, `no API key; set ${API_KEY_VARS[0]}`);
  const theme = resolveTheme(
    await loadTheme(args.theme).catch((e: Error) => {
      throw new ExitError(2, e.message);
    }),
  );
  const cache = args.cache ? await AnswerCache.open(args.cache) : null;
  const client = new Jev();
  const result = await lex(code, { client, cache, filename, minConfidence: args.minConfidence });
  await cache?.save();
  const format: Format = args.format ?? (process.stdout.isTTY ? "ansi" : "html");
  if (args.compare) {
    process.stdout.write(await renderCompare(code, args, theme, result.spans));
  } else if (format === "json") {
    process.stdout.write(JSON.stringify(result.spans) + "\n");
  } else {
    const tokens = toThemedTokens(code, result.spans, theme);
    process.stdout.write(format === "html" ? tokensToHtml(tokens, theme) + "\n" : tokensToAnsi(tokens) + "\n");
  }
  const s = result.spent;
  process.stderr.write(
    `${s.calls} request(s), ${s.inputTokens.toLocaleString()} input tokens, $${s.usd.toFixed(5)}, ${s.ms} ms; ${result.unanswered} unanswered\n`,
  );
  for (const e of result.errors) process.stderr.write(`  ${e.message}\n`);
  return result.unanswered > 0 ? 3 : 0;
}

export async function comparePanes(
  code: string,
  o: { lang: string | null; theme: ThemeRegistrationResolved; spans: Span[]; gpu: TokenClass[] | null },
): Promise<string> {
  const panes: string[] = [];
  if (o.lang) {
    const { oracleTokens } = await import("../eval/oracle.ts");
    const tokens = await oracleTokens(code, o.lang, o.theme.name);
    panes.push(`== shiki (${o.lang})\n${tokensToAnsi(tokens)}`);
  }
  panes.push(`== jev-lexer\n${tokensToAnsi(toThemedTokens(code, o.spans, o.theme))}`);
  if (o.gpu) {
    const parts = splitParts(code);
    const labels = parts.map((p) => ({ type: o.gpu![p.start] ?? "plain", confidence: 1 }));
    panes.push(`== gpu-lexer\n${tokensToAnsi(toThemedTokens(code, mergeSpans(parts, labels), o.theme))}`);
  }
  return panes.join("\n\n") + "\n";
}

async function renderCompare(code: string, args: CliArgs, theme: ThemeRegistrationResolved, spans: Span[]): Promise<string> {
  const { gpuLexerAvailable, gpuLexerChars } = await import("../bench/gpu-lexer.ts");
  const gpu = (await gpuLexerAvailable()) ? await gpuLexerChars(code) : null;
  return comparePanes(code, { lang: args.lang, theme, spans, gpu });
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseCli(argv);
  try {
    if (args.command === "eval") return (await import("../eval/run.ts")).runEval(args);
    if (args.command === "bench") return (await import("../bench/run.ts")).runBench(args);
    return await highlight(args);
  } catch (err: unknown) {
    if (err instanceof ExitError) {
      process.stderr.write(`${err.message}\n`);
      return err.code;
    }
    if (err instanceof JevError && err.kind === "auth") {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => {
    process.exitCode = code;
  });
}
