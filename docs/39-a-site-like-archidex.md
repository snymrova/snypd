# 39 · A site like Archidex: how far the shelf is from a commercial studio template

**Asked, 5 Oct 2026:** *"how far are we from creating a site like this https://html.ravextheme.com/archidex/index-02.html usin snypd"*

Archidex is a RavexTheme HTML template for architecture and interior studios: 19 home variants, a dark full-bleed look, project and service detail pages, and jQuery, Bootstrap, Swiper, GSAP (ScrollSmoother, ScrollTrigger, SplitText), Odometer, Isotope and Magnific Popup underneath. index-02 is the "Architecture Studio" home. This document compares it, band by band, with what the shelf draws today, names what is missing, and says where the gap goes in docs/37's plan. It is a teardown, not a plan of its own: nothing here moves ahead of the W4 verdicts and the mobile pass.

---

## 0. The answer on one page

1. **The content model is already there.** Ferrule (`examples/studio`) is a site of the same kind: a studio, `work` cases filed under `service` and `industry` with `role: fact` fields and a year, offices and social links in settings, a hero with a reel, full-bleed bands, a colophon footer. Archidex's projects, services, offices and pages all map onto types and primitives we have (§1).
2. **The look gets about two-thirds of the way.** The `studio` kit on darker tokens, a display sans and real architecture photography gives the hero, the services, the footer and the case pages. Two bands that carry Archidex's character are missing: **project rows that reveal their photos on hover**, and **a gallery that scrolls sideways**.
3. **Four pieces and one primitive close most of the gap** (§2): `entries/register`, a `:::gallery` primitive drawn by every blocks piece, a `media-beside` switch on `home/bands`, and `masthead/drawer`. That is about a week at W4's pace of roughly a piece a day. The mobile pass's scroller (docs/37, the plan of 5 Oct) is most of what the gallery needs, so the gallery should come right after it.
4. **The motion layer is out by design.** Smooth scrolling, split-letter titles, parallax and odometers contradict `motion`'s rule (nothing moves between pages, and the page is never held). `motion/glide` with `reveal: true` is the nearest we go (§3).
5. **The newsletter is a form, and a static site has no forms.** It is a question of a plugin and a provider, not of a piece (§3).

---

## 1. Band by band

index-02, top to bottom, against the shelf:

| Archidex | What it does | snypd today | Gap |
|---|---|---|---|
| Header | Fixed bar, logo, a side-toggle panel holding the menu, social links and a "Drop a line" email | `masthead/bar`: a sticky bar that blurs what scrolls under it and turns opaque once stuck | **Small.** No side panel with social and contact; a phone gets the Menu button |
| Hero | Full-bleed photograph, "building from 1997 – 2025", "Architectural Solution", a *Get started* button | `home/bands` hero: `::cover` with `media` (photo or reel) under a display-size headline | **Small.** The button is a `::cta` after the hero, not in it |
| Showcase / Solution | Image beside a pull quote (name, role), a paragraph and *Learn more*; the image rises with parallax | `::figure` + `:::pullquote{cite}` + prose in a band | **Medium.** They stack. No band sets a picture beside its text |
| Projects | Ten rows under a header (*Projects · Area · Date*): name, "Residential, Ghana", 2024; two or three photos per row shown under the pointer; *View project* | `work` type + `entries/ledger` (ruled rows, a term, the date at the right); `home/portfolio` and `list/grid` for covers | **Missing.** The hover-reveal register is the band that makes the template recognisable |
| Services | 01–05 numbered cards, a title and a line each | `:::steps`, or `home/bands`' numbered `##` bands | **None** worth a piece |
| Design showcase | Full-width picture, "Design. Visualization. Interaction.", then a Swiper carousel captioned *(01) Urban City Remark (2022)* | `::figure{width="full"}`; no gallery | **Missing.** No primitive holds several pictures as one thing |
| Footer | Newsletter, quick links, social, office address, phone, email, copyright | `footer/colophon`: description beside the menu, social and office lists, the name set huge, the note | **Small**, apart from the newsletter (§3) |
| Inner pages | About, ten service pages, twelve project pages, team, FAQ, blog, gallery, contact | `feature/facts` case pages, service and industry term pages, authors, `:::faq`, posts, a `mailto:` `::cta` | A gallery page waits on the primitive; a contact form waits on §3 |

What the comparison does **not** show is a gap in the content model. Every band is either a list of a type the site declares or a primitive in a `##` section, which is what decision 275 asked for.

---

## 2. What would close it

In the order they pay back:

1. **`entries/register`: a list as a register.** A header row (the type's name, its first `role: fact` field, the year), then one ruled row per entry with those three columns. Under the pointer the entry's cover, and up to two more pictures from its `media:`, rise beside the row. On a phone, and under `@media (hover: none)`, they sit under the title as a short strip in the scroller pattern instead. It belongs to `entries`, so `list/ruled`'s archive and `home/bands`' newest-work band both get it. It reads only tokens the shelf has. The hover pictures need `ctx` to hand a part the entry's media, which is one field on the card. Refs: Archidex's project rows; the same idea in Pentagram's and Bureau Borsche's work indexes.
2. **`:::gallery`: the fifteenth primitive.** A container of `::figure`s with `layout: strip | grid` and an optional `title` and `year`. `strip` is the scroller pattern: snap points, edge fades, a counter (01 / 06), keyboard and swipe, no library. `grid` is the same figures as an even grid, and it is what a reader without CSS gets. Each figure keeps the lightbox it already has. Every blocks piece draws it (hairline, rows, ruled, surface, ink), so the primitive has to land on all five before it ships. Its fallback is the figures one after another, which is valid markdown already.
3. **`home/bands › media-beside`: a switch.** When a band's `##` section opens with a `::figure`, the figure takes one column and the rest of the section the other, alternating sides from band to band. Off by default. This is the Showcase / Solution band, and also the about page's usual shape.
4. **`masthead/drawer`: the side panel.** The name at the left; a button opening a panel from the right that holds the menu, the `social` and `offices` settings, and one contact line. It is a `<dialog>`, so focus and Escape come with it, and on a phone it is the same panel at full width. It is the masthead that suits a site whose menu runs past five items.

Smaller, and not worth a piece each: a `button`/`href` pair on `::cover` (the hero's *Get started*), and the phone and email in `footer/colophon` taken from settings it already reads.

**A kit, once these pass.** The studio kit with the four pieces above, a dark seed and a display sans is an architecture kit. It can be proven on a second specimen with Commons CC0 architecture photography, fetched the way Ferrule's media was, and boarded beside a screenshot of index-02. That makes a fair benchmark for docs/38's question: does the shelf reach a template people pay for?

---

## 3. What stays out

- **The GSAP layer.** ScrollSmoother takes the scroll away from the browser. SplitText splits the title into letters a screen reader reads one by one. The parallax and the odometers move what the reader did not ask to move. `motion`'s rule is that nothing moves between pages and the page is never held. `motion/glide` gives the scroll entrances (`reveal: true`) and counting numbers is already a switch. That is the whole of it.
- **Nineteen home variants.** A site has one front page; a kit is how another one is reached.
- **The newsletter.** A form needs somewhere to post. It belongs with whatever plugin and provider decision comes first (a Buttondown or Listmonk plugin, say). Until then, a `::cta` to the list's own sign-up page.
- **The demo mega-menu**, the preloader and the custom cursor.

---

## 4. Where it goes in docs/37

Nothing here moves ahead of the plan of 5 Oct: the W4 verdicts, then the mobile pass, then the end of W5. The order after that:

1. **The mobile pass's scroller pattern** is built first anyway. `:::gallery`'s `strip` and `entries/register`'s phone strip both stand on it.
2. **`:::gallery`** after the mobile pass, since a primitive is a spec change and every blocks piece has to draw it.
3. **`entries/register`, `media-beside` and `masthead/drawer`** as W4-style drafts, each on its board at three token sets and passed or parked at a sitting (decision 278).
4. **The architecture kit and its specimen** once all four pass, as a W5 kit, and boarded against index-02.

## 5. Decisions asked

- **291. A `:::gallery` primitive.** Several figures as one thing, `layout: strip | grid`, drawn by every blocks piece, the strip built on the mobile pass's scroller. Recommendation: yes. It is the one band in Archidex that no arrangement of today's primitives can make.
- **292. Hover never hides content on a phone.** A part that reveals something under the pointer must show it some other way under `@media (hover: none)`. `entries/register` is the first part this applies to; the mobile pass's hover rule makes it a check. Recommendation: yes.
- **293. Scroll-jacking stays out of `motion`.** No smooth-scroll library, no letter-split titles, no parallax, even as an opt-in switch. Recommendation: yes. It keeps `motion`'s rule one sentence long.
