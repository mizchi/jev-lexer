import type { CliArgs } from "../src/cli.ts";
export async function runEval(_args: CliArgs): Promise<number> {
  process.stderr.write("eval: not implemented yet\n");
  return 2;
}
