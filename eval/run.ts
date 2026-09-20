/**
 * `jev-lexer eval`: for every corpus file, ask Jev in two arms — bare
 * (no hint) and named (file name passed) — score each against the
 * Shiki oracle, print the table, and record answers so `--replay`
 * recomputes without a key.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { CliArgs } from "../src/cli.ts";
import { CLASSES_HASH, type TokenClass } from "../src/classes.ts";
import { API_KEY_VARS, Jev, fromEnv, type Spend } from "../src/jev.ts";
import { lex } from "../src/lex.ts";
import { splitParts } from "../src/split.ts";
import { combine, partLabels, score, type Score } from "./metrics.ts";
import { oracleChars } from "./oracle.ts";

export const CORPUS_DIR = new URL("./corpus/", import.meta.url).pathname;
export const BASELINE = new URL("./baseline.json", import.meta.url).pathname;
export const LANGS: Record<string, string> = {
  ts: "ts", python: "python", rust: "rust", go: "go", shell: "bash", json: "json", css: "css", html: "html",
};
export type Arm = "bare" | "named";
export const ARMS: Arm[] = ["bare", "named"];

export interface CorpusFile {
  path: string;
  rel: string;
  lang: string;
  code: string;
}

export async function loadCorpus(): Promise<CorpusFile[]> {
  const out: CorpusFile[] = [];
  for (const dir of Object.keys(LANGS).sort()) {
    const full = join(CORPUS_DIR, dir);
    for (const name of (await readdir(full).catch(() => [] as string[])).sort()) {
      const path = join(full, name);
      out.push({ path, rel: relative(CORPUS_DIR, path), lang: LANGS[dir]!, code: await readFile(path, "utf8") });
    }
  }
  return out;
}

export interface Recording {
  version: 1;
  date: string;
  model: string | null;
  classesHash: string;
  repeat: number;
  /** arm → file → per-part predicted label (null for whitespace / unanswered) */
  labels: Record<Arm, Record<string, Array<TokenClass | null>>>;
  unanswered: Record<Arm, number>;
  spent: Record<Arm, Spend>;
}

/** Mode of N passes per part; ties go to the first pass. */
function vote(passes: Array<Array<TokenClass | null>>): Array<TokenClass | null> {
  const n = passes[0]!.length;
  return Array.from({ length: n }, (_, i) => {
    const counts = new Map<TokenClass | null, number>();
    for (const p of passes) counts.set(p[i]!, (counts.get(p[i]!) ?? 0) + 1);
    let best: TokenClass | null = passes[0]![i]!;
    let k = 0;
    for (const [c, m] of counts) {
      if (m > k) {
        best = c;
        k = m;
      }
    }
    return best;
  });
}

function spendDelta(after: Spend, before: Spend): Spend {
  return {
    ...after,
    calls: after.calls - before.calls,
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    ms: after.ms - before.ms,
    retried: after.retried - before.retried,
    rateLimited: after.rateLimited - before.rateLimited,
    splits: after.splits - before.splits,
    usd: after.usd - before.usd,
  };
}

export async function record(files: CorpusFile[], repeat: number): Promise<Recording> {
  const client = new Jev();
  const labels = { bare: {}, named: {} } as Recording["labels"];
  const unanswered = { bare: 0, named: 0 };
  const spent = {} as Record<Arm, Spend>;
  for (const arm of ARMS) {
    const before = { ...client.spent };
    for (const f of files) {
      const passes: Array<Array<TokenClass | null>> = [];
      for (let r = 0; r < repeat; r++) {
        const res = await lex(f.code, { client, filename: arm === "named" ? f.rel : null, cache: null });
        unanswered[arm] += res.unanswered;
        passes.push(res.labels.map((l) => l?.type ?? null));
      }
      labels[arm][f.rel] = vote(passes);
      process.stderr.write(`  ${arm} ${f.rel}\n`);
    }
    spent[arm] = spendDelta(client.spent, before);
  }
  return {
    version: 1,
    date: new Date().toISOString(),
    model: client.servedModel,
    classesHash: CLASSES_HASH,
    repeat,
    labels,
    unanswered,
    spent,
  };
}

export interface ArmReport {
  total: Score;
  perFile: Record<string, Score>;
  perLang: Record<string, Score>;
}

export async function scoreRecording(files: CorpusFile[], rec: Recording): Promise<Record<Arm, ArmReport>> {
  const out = {} as Record<Arm, ArmReport>;
  for (const arm of ARMS) {
    const perFile: Record<string, Score> = {};
    const byLang: Record<string, Score[]> = {};
    for (const f of files) {
      const pred = rec.labels[arm][f.rel];
      if (!pred) continue;
      const parts = splitParts(f.code);
      const truth = partLabels(parts, await oracleChars(f.code, f.lang));
      const s = score(truth, pred);
      perFile[f.rel] = s;
      (byLang[f.lang] ??= []).push(s);
    }
    out[arm] = {
      total: combine(Object.values(perFile)),
      perFile,
      perLang: Object.fromEntries(Object.entries(byLang).map(([l, ss]) => [l, combine(ss)])),
    };
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function renderReport(rec: Recording, report: Record<Arm, ArmReport>): string {
  const lines: string[] = [];
  lines.push(`model ${rec.model ?? "?"}, classes ${rec.classesHash}, ${rec.date}, repeat ${rec.repeat}`);
  lines.push("");
  lines.push("| arm | supervised parts | agreement | macro F1 | plain false-colour | unanswered | requests | input tokens | USD | ms |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const arm of ARMS) {
    const t = report[arm].total;
    const s = rec.spent[arm];
    lines.push(
      `| ${arm} | ${t.supervised} | ${pct(t.agreement)} | ${pct(t.macroF1)} | ${pct(t.plainFalseColour)} | ${rec.unanswered[arm]} | ${s.calls} | ${s.inputTokens.toLocaleString()} | $${s.usd.toFixed(4)} | ${s.ms} |`,
    );
  }
  lines.push("");
  lines.push("| language | bare agreement | named agreement | bare F1 | named F1 |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const lang of Object.keys(report.bare.perLang).sort()) {
    const b = report.bare.perLang[lang]!;
    const n = report.named.perLang[lang];
    lines.push(`| ${lang} | ${pct(b.agreement)} | ${n ? pct(n.agreement) : "-"} | ${pct(b.macroF1)} | ${n ? pct(n.macroF1) : "-"} |`);
  }
  for (const arm of ARMS) {
    lines.push("");
    lines.push(`confusion (${arm}), rows = shiki, columns = jev-lexer`);
    const classes = Object.keys(report[arm].total.perClass) as TokenClass[];
    lines.push(`| | ${classes.join(" | ")} |`);
    lines.push(`| --- | ${classes.map(() => "---:").join(" | ")} |`);
    for (const t of classes) {
      lines.push(`| ${t} | ${classes.map((p) => report[arm].total.confusion[t]?.[p] ?? 0).join(" | ")} |`);
    }
  }
  return lines.join("\n") + "\n";
}

export async function runEval(args: CliArgs): Promise<number> {
  const files = await loadCorpus();
  if (files.length === 0) {
    process.stderr.write(`no corpus under ${CORPUS_DIR}\n`);
    return 2;
  }
  let rec: Recording;
  if (args.replay) {
    rec = JSON.parse(await readFile(BASELINE, "utf8")) as Recording;
    if (rec.classesHash !== CLASSES_HASH) {
      process.stderr.write(`warning: baseline was recorded under classes ${rec.classesHash}, current is ${CLASSES_HASH}\n`);
    }
  } else {
    if (!fromEnv(API_KEY_VARS)) {
      process.stderr.write(`no API key; set ${API_KEY_VARS[0]} or use --replay\n`);
      return 2;
    }
    rec = await record(files, args.repeat);
    await writeFile(BASELINE, JSON.stringify(rec));
    process.stderr.write(`recorded ${BASELINE}\n`);
  }
  const report = await scoreRecording(files, rec);
  process.stdout.write(renderReport(rec, report));
  return rec.unanswered.bare + rec.unanswered.named > 0 ? 3 : 0;
}
