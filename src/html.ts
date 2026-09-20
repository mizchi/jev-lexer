/**
 * Shiki's own renderer over our tokens: `tokensToHast` + `hastToHtml`
 * from @shikijs/core, so the markup is Shiki's by construction —
 * `pre.shiki.<theme>[style][tabindex] > code > span.line > span[style]`.
 */
import { hastToHtml, tokensToHast } from "@shikijs/core";
import type { CodeToHastRenderOptions, ShikiTransformerContextSource, ThemeRegistrationResolved, ThemedToken } from "@shikijs/core";

export function tokensToHtml(tokens: ThemedToken[][], theme: ThemeRegistrationResolved): string {
  const options = {
    lang: "text",
    themes: {},
    fg: theme.fg,
    bg: theme.bg,
    themeName: theme.name,
    rootStyle: undefined,
  } as unknown as CodeToHastRenderOptions;
  const root = tokensToHast(tokens, options, {} as ShikiTransformerContextSource);
  return hastToHtml(root);
}
