/**
 * `jev-lexer bench`: Shiki (truth) vs jev-lexer (bare, named — from the
 * eval recording) vs gpu-lexer (CPU, computed here), scored over
 * jev-lexer's parts, written to bench/report.md.
 */
import { readFile, writeFile } from "node:fs/promises";
import type { CliArgs } from "../src/cli.ts";
import { TOKEN_CLASSES } from "../src/classes.ts";
import { splitParts } from "../src/split.ts";
import { ARMS, BASELINE, loadCorpus, scoreRecording, type Recording } from "../eval/run.ts";
import { combine, partLabels, score, type Score } from "../eval/metrics.ts";
import { oracleChars } from "../eval/oracle.ts";
import { gpuLexerAvailable, gpuLexerChars } from "./gpu-lexer.ts";

export const REPORT = new URL("./report.md", import.meta.url).pathname;
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export async function runBench(args: CliArgs): Promise<number> {
  const files = await loadCorpus();
  const rec = JSON.parse(await readFile(BASELINE, "utf8").catch(() => {
    throw new Error(`no eval recording at ${BASELINE}; run \`jev-lexer eval\` first`);
  })) as Recording;
  const jev = await scoreRecording(files, rec);
  const hasGpu = await gpuLexerAvailable();
  const gpuPerFile: Record<string, Score> = {};
  const gpuByLang: Record<string, Score[]> = {};
  let gpuMs = 0;
  if (hasGpu) {
    for (const f of files) {
      const parts = splitParts(f.code);
      const truth = partLabels(parts, await oracleChars(f.code, f.lang));
      const t0 = performance.now();
      const pred = partLabels(parts, await gpuLexerChars(f.code));
      gpuMs += performance.now() - t0;
      const s = score(truth, pred);
      gpuPerFile[f.rel] = s;
      (gpuByLang[f.lang] ??= []).push(s);
    }
  }
  const gpuTotal = hasGpu ? combine(Object.values(gpuPerFile)) : null;
  const lines: string[] = [];
  lines.push("# jev-lexer vs gpu-lexer, scored against Shiki");
  lines.push("");
  lines.push(
    `Corpus: ${files.length} files under eval/corpus. Truth: Shiki 4.4.3 with the true language, scopes normalized with gpu-lexer's classFromScopes. Scored over jev-lexer's non-whitespace parts, majority class per part.`,
  );
  lines.push(
    `jev-lexer recording: model ${rec.model ?? "?"}, ${rec.date}, repeat ${rec.repeat}. gpu-lexer: ${hasGpu ? "promoted checkpoint, int6 weights, CPU via packages/training/src/tree-model.js" : "not available (submodule missing)"}.`,
  );
  lines.push("");
  lines.push("| system | agreement | macro F1 | plain false-colour | wall clock | cost |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  lines.push("| Shiki (truth) | 100.00% | 100.00% | 0.00% | - | - |");
  for (const arm of ARMS) {
    if (!jev[arm]) continue;
    const t = jev[arm].total;
    const s = rec.spent[arm];
    lines.push(
      `| jev-lexer (${arm}) | ${pct(t.agreement)} | ${pct(t.macroF1)} | ${pct(t.plainFalseColour)} | ${s.ms} ms request time | $${s.usd.toFixed(4)} |`,
    );
  }
  if (gpuTotal) {
    lines.push(`| gpu-lexer | ${pct(gpuTotal.agreement)} | ${pct(gpuTotal.macroF1)} | ${pct(gpuTotal.plainFalseColour)} | ${gpuMs.toFixed(0)} ms CPU | $0 |`);
  }
  lines.push("");
  lines.push("| language | jev bare | jev named | gpu-lexer |");
  lines.push("| --- | ---: | ---: | ---: |");
  const armPct = (arm: (typeof ARMS)[number], pick: (s: Score) => number, lang?: string) => {
    const r = jev[arm];
    if (!r) return "-";
    const s = lang ? r.perLang[lang] : r.total;
    return s ? pct(pick(s)) : "-";
  };
  for (const lang of Object.keys((jev.bare ?? jev.named).perLang).sort()) {
    const g = hasGpu ? combine(gpuByLang[lang] ?? []) : null;
    lines.push(
      `| ${lang} | ${armPct("bare", (s) => s.agreement, lang)} | ${armPct("named", (s) => s.agreement, lang)} | ${g ? pct(g.agreement) : "-"} |`,
    );
  }
  lines.push("");
  lines.push("| class | jev bare F1 | jev named F1 | gpu-lexer F1 |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const c of TOKEN_CLASSES) {
    lines.push(
      `| ${c} | ${armPct("bare", (s) => s.perClass[c].f1)} | ${armPct("named", (s) => s.perClass[c].f1)} | ${gpuTotal ? pct(gpuTotal.perClass[c].f1) : "-"} |`,
    );
  }
  const report = lines.join("\n") + "\n";
  process.stdout.write(report);
  if (!args.replay) await writeFile(REPORT, report);
  return 0;
}
