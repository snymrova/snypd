/**
 * The masthead: the site's name — or its logo, when the site sets one (U3) — and under it a tagline;
 * beside them the `header` menu when the site has one (U2). One file, no layouts — this is the override
 * docs/09 U1 exists to make possible. The menu is `content/nav/header.yaml`; `menu()` resolves it and
 * marks the current page.
 */
import { menu, settingText, type Html, type PartProps } from "@snypd/render";

export default function Header({ ctx, route }: PartProps): Html {
  const items = menu(ctx, "header", route);
  const logo = settingText(ctx, "logo");
  // The logo's intrinsic size comes from `ctx.media`, the same lookup a `figure` uses, so a masthead
  // does not reflow while it loads. An off-site logo has no entry and gets no attributes, as S13 decided.
  const size = logo ? ctx.media[logo] : undefined;
  // Falls back to the site's own description, which is what this part read before the setting existed.
  const tagline = settingText(ctx, "tagline") ?? ctx.site.description;
  return (
    <header class="snypd-masthead">
      <div class="snypd-brand">
        <a href="/" rel="home">
          {logo
            ? <img class="snypd-logo" src={logo} alt={ctx.site.name} decoding="async"
                width={size ? String(size.width) : undefined} height={size ? String(size.height) : undefined} />
            : ctx.site.name}
        </a>
        {tagline ? <p class="snypd-tagline">{tagline}</p> : null}
      </div>
      {items.length ? (
        <nav aria-label="Site">
          <ul>{items.map((i) => <li><a href={i.href} rel={i.rel} aria-current={i.current ? "page" : undefined}>{i.label}</a></li>)}</ul>
        </nav>
      ) : null}
    </header>
  );
}
