/**
 * The theme seam (docs/07 decision 3: the spec owns geometry, the theme owns colour and type). Every paint
 * in a chart is `var(--color-viz-*, <literal>)`, so:
 *   - `base`, which declares no tokens and emits 0 KB of CSS, still renders a correct chart;
 *   - a theme that declares `color.viz.1 …` in `theme.yaml` recolours every chart with no viz change
 *     (tokens → `:root { --color-viz-1: … }` in dist/assets/theme.css — render/tokens.ts).
 * Text and stems fall back to `currentColor` so charts follow the page in a dark theme without a token.
 * The literals are muted on purpose: the risk row "charts look generic / AI dashboard" is answered by a
 * quiet default and a hand-tuned `editorial` palette in S14, not by saturated primaries.
 */
export const SERIES = [
  "var(--color-viz-1, #3d5a80)",
  "var(--color-viz-2, #ee6c4d)",
  "var(--color-viz-3, #7fa3bd)",
  "var(--color-viz-4, #6a994e)",
  "var(--color-viz-5, #9b4b52)",
  "var(--color-viz-6, #8d6a9f)",
];

export const seriesColor = (i: number) => SERIES[i % SERIES.length]!;

/** Axis line and baseline. */
export const AXIS = "var(--color-viz-axis, rgba(128,128,128,.45))";
/** Grid lines behind the marks. */
export const GRID = "var(--color-viz-grid, rgba(128,128,128,.2))";
/** Category and value labels. */
export const LABEL = "var(--color-viz-label, currentColor)";
/** Tick numbers — quieter than labels. */
export const TICK = "var(--color-viz-tick, rgba(128,128,128,.9))";

/** The token names a theme declares to take the palette over (documented for theme authors). */
export const TOKENS = ["color.viz.1", "color.viz.2", "color.viz.3", "color.viz.4", "color.viz.5", "color.viz.6",
  "color.viz.axis", "color.viz.grid", "color.viz.label", "color.viz.tick"];
