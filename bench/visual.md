# snypd bench — visual

**Version** 0.1.0-s10 · **Bun** 1.4.0 · **Date** 2026-08-27T17:11:36.307Z · **Tokenizer** o200k_base

| Metric | Value | Budget | Status | Note |
|---|---|---|---|---|
| `viz.chart.renderMs` | 0.44 ms | 3 ms | ✅ | worst type (bar) on the worst shape — bar 0.44 ms / 6.5 KB · line 0.21 ms / 4.3 KB · area 0.18 ms / 4.5 KB · donut 0.34 ms / 6.8 KB · lollipop 0.30 ms / 7.6 KB |
| `viz.chart.svgKb` | 7.6 KB | 12 KB | ✅ | worst type (lollipop); zero JS, zero CSS |
| `viz.diagram.renderMs` | 8.6 ms | 15 ms | ✅ | worst shape (wide) at the 40-node cap, layout cache defeated — chain 5.20 ms / 10.4 KB · wide 8.60 ms / 11.9 KB · feedback 7.16 ms / 13.2 KB |
| `viz.diagram.svgKb` | 13.2 KB | 25 KB | ✅ | worst shape (feedback); zero JS, zero CSS |
| `viz.flow.renderMs` | 10.22 ms | 15 ms | ✅ | worst shape (ladder) at the 40-node cap, layout cache defeated — ladder 40 steps 10.22 ms / 13.7 KB · retry loop 38 steps 1.54 ms / 13.1 KB · nested 40 steps 3.16 ms / 14.4 KB |
| `viz.flow.svgKb` | 14.4 KB | 25 KB | ✅ | worst shape (nested); zero JS, zero CSS |

CI passes at ≤ 80 % of budget (docs/07 §3). Corpora are deterministic (`bun run corpus <n>`); 10k is generated on demand, not checked in.
