/**
 * The header's menu (U7, docs/14 §4.6), as one piece of markup for base's header and for every masthead
 * piece that draws its own header: a button and the `<ul popover>` it opens on a phone, so the platform
 * does the sheet (light dismiss, Escape, focus) and anything wider puts the list back in flow.
 *
 * A masthead piece whose `menu-button` switch is off (the W4 sitting's mobile pass, docs/37 §18) keeps a
 * short menu out from behind the button: six items or fewer are a row that scrolls sideways under the
 * name on a phone (`.snypd-scroller`, base's sheet), with no button and no popover. A longer menu is a sheet
 * whatever the switch says, because seven tabs in a strip are mostly off the screen.
 */
import { menu, type SiteCtx } from "./theme";
import { jsx, Fragment, type Child, type Html } from "./jsx-runtime";

const h = (tag: string | typeof Fragment, attrs: Record<string, unknown>, ...children: Child[]): Html => jsx(tag, { ...attrs, children });

/** The most items a strip holds before the menu goes back behind its button. */
export const STRIP_MAX = 6;

export function SiteMenu({ ctx, route, extra }: { ctx: SiteCtx; route: string; /** One more `<li>` after the menu's own, as title-bar's link to the source. */ extra?: Html | null }): Html | null {
  const items = menu(ctx, "header", route);
  const n = items.length + (extra ? 1 : 0);
  if (!n) return null;
  // Off, not absent: a masthead with no such switch (`bar`, or a theme on no pieces) keeps its button.
  const strip = ctx.pieces.masthead?.["menu-button"] === false && n <= STRIP_MAX;
  const lis = [items.map((i) => h("li", {}, h("a", { href: i.href, rel: i.rel, "aria-current": i.current ? "page" : undefined }, i.label))), extra ?? null];
  return strip
    ? h("nav", { "aria-label": "Site", "data-menu": "strip" }, h("ul", { id: "snypd-menu", class: "snypd-scroller" }, ...lis))
    : h("nav", { "aria-label": "Site" },
      h("button", { type: "button", class: "snypd-menu-button", popovertarget: "snypd-menu" }, "Menu"),
      h("ul", { id: "snypd-menu", popover: true }, ...lis));
}
