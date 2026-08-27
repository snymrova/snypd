/** @snypd/viz — build-time SVG for `chart` (S8), `diagram` (S9) and `flow` (S10). No client JS, no D3. */
export { renderChart, normalizeRows, isChartType, CHART_TYPES, MAX_POINTS, type ChartType, type ChartRow, type ChartInput, type ChartResult } from "./chart";
export { renderDiagram, normalizeGraph, MAX_NODES, NODE_KINDS, type Direction, type NodeKind, type DiagramNode, type DiagramEdge, type DiagramInput, type DiagramResult } from "./diagram";
export { renderFlow, desugarFlow, type FlowInput, type FlowResult } from "./flow";
export { layoutGraph, type LayoutItem, type LayoutEdge, type LayoutResult, type Placed, type RoutedEdge } from "./layout";
export { SERIES, TOKENS as VIZ_TOKENS, seriesColor } from "./palette";
export { linear, band, points, ticks, niceStep, niceDomain, type Linear, type Band } from "./scale";
