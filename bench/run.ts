import type { CliArgs } from "../src/cli.ts";
export async function runBench(_args: CliArgs): Promise<number> {
  process.stderr.write("bench: not implemented yet\n");
  return 2;
}
