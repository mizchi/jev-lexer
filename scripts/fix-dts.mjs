// tsc's rewriteRelativeImportExtensions rewrites .ts -> .js in emitted JS but
// leaves the .ts specifiers in the emitted .d.ts, which a consumer without
// allowImportingTsExtensions cannot resolve. Rewrite them here.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".d.ts")) {
      const src = readFileSync(p, "utf8");
      const out = src.replace(/(from\s+"\.\.?\/[^"]+)\.ts"/g, '$1.js"').replace(/(import\(\s*"\.\.?\/[^"]+)\.ts"/g, '$1.js"');
      if (out !== src) writeFileSync(p, out);
    }
  }
}
walk("dist");
