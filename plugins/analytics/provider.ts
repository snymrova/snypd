/**
 * What the two slots share: the provider's script url and the attributes its tag needs. One place, so
 * `head` preconnects to exactly the origin `body-end` loads from — a self-hosted `src` moves both.
 */
export type Provider = "plausible" | "fathom" | "umami";
export interface Options { provider: Provider; domain?: string; site?: string; src?: string }

const DEFAULT_SRC: Record<Provider, string> = {
  plausible: "https://plausible.io/js/script.js",
  fathom: "https://cdn.usefathom.com/script.js",
  umami: "https://cloud.umami.is/script.js",
};

/** The resolved tag: `src` plus the provider's own attribute. Throws with the fix when an id is missing — a slot that throws is a diagnostic naming this plugin, not a page without a beacon and no word about why. */
export function beacon(options: Options, siteUrl: string): { src: string; origin: string; attrs: Record<string, string> } {
  const src = options.src ?? DEFAULT_SRC[options.provider];
  const origin = new URL(src).origin;
  switch (options.provider) {
    case "plausible": {
      const domain = options.domain ?? new URL(siteUrl).host;
      return { src, origin, attrs: { "data-domain": domain } };
    }
    case "fathom": {
      if (!options.site) throw new Error("fathom needs `site` (the site id from the Fathom dashboard): plugins: [{ analytics: { provider: fathom, site: ABCDEFGH } }]");
      return { src, origin, attrs: { "data-site": options.site } };
    }
    case "umami": {
      if (!options.site) throw new Error("umami needs `site` (the website id from the Umami dashboard): plugins: [{ analytics: { provider: umami, site: <uuid> } }]");
      return { src, origin, attrs: { "data-website-id": options.site } };
    }
  }
}
