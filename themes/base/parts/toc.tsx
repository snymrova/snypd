/**
 * The table of contents (U6b). **`base` renders nothing here, and that is the point of the file.**
 *
 * `technical` wanted a contents list built from the heading tree, and the only ways to get one without
 * this part were to fork `base`'s post layout — which D8 forbids, and rightly: a forked layout is a copy
 * of the markup contract that drifts the first time the original changes — or to give every theme a toc
 * whether it wanted one or not. So the layout renders a slot and the floor fills it with nothing: a theme
 * that says nothing about `toc` emits exactly the bytes it emitted before this part existed, and a theme
 * that wants one overrides one file, which is what `parts:` is for (docs/09 U1).
 *
 * The headings are on the page (`page.headings`, collected by the render that issued their ids), so this
 * needs no prop the other parts do not already get.
 */
import type { Html, PartProps } from "@snypd/render";

export default function Toc(_: PartProps): Html {
  return <></>;
}
