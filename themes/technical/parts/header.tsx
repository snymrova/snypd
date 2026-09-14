/**
 * The masthead: the site's name — or its logo (U3) — a tagline beside it rather than under it, the
 * `header` menu (U2), and a `src` link to the repository when the site sets one.
 *
 * The name is set in mono and the tagline follows it on the same line, separated by a rule: a
 * documentation header is a title bar, not a nameplate, and the vertical space editorial spends on a
 * masthead is space this theme spends on the first heading.
 */
import { menu, settingText, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const items = menu(ctx, "header", route);
  const logo = settingText(ctx, "logo");
  const size = logo ? ctx.media[logo] : undefined;
  const tagline = settingText(ctx, "tagline") ?? ctx.site.description;
  const repo = settingText(ctx, "repo");
  return (
    <header class="snypd-masthead">
      <div class="snypd-brand">
        <a href="/" rel="home">
          {logo
            ? <img class="snypd-logo" src={logo} alt={ctx.site.name} decoding="async"
                width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} />
            : ctx.site.name}
        </a>
        {tagline ? <span class="snypd-tagline">{tagline}</span> : null}
      </div>
      {items.length || repo ? (
        <nav aria-label="Site">
          {/* The same button and popover `base`'s header carries (U7): on a phone the list waits behind it. */}
          <button type="button" class="snypd-menu-button" popovertarget="snypd-menu">Menu</button>
          <ul id="snypd-menu" popover>
            {items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}
            {/* Last, and marked, because it is the one item in this menu that leaves the site. */}
            {repo ? <li class="snypd-repo"><a href={repo} rel="external">src</a></li> : null}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
