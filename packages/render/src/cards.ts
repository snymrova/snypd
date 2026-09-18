/**
 * Share cards (S36): the 1200 × 630 picture a link shows on a social network or in a chat, drawn per
 * page in the theme's own look by `snypd cards` and committed under `content/media/cards/`. The shell
 * shares a page's `cover.image` first, then its card, then `site.image` — so a site that never runs the
 * command keeps the card it had, and one that does gets a different picture for every page.
 *
 * The file for a route is derived, not recorded: the shell and the command both call `cardUrl`, so there
 * is no manifest for them to disagree about. `/` is `home`; `/posts/a-b` is `posts--a-b` (a double hyphen
 * because a slug may hold single ones, and a slash cannot be a filename).
 */
export const CARD_SIZE = { width: 1200, height: 630 } as const;
export const cardName = (route: string) => (route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replace(/\//g, "--"));
export const cardUrl = (route: string) => `/media/cards/${cardName(route)}.png`;
/** The touch icon `snypd cards` rasterises from `site.icon`; the build also serves it from `/`. */
export const TOUCH_ICON = "/media/icons/apple-touch-icon.png";
