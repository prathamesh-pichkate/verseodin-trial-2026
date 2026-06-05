## Setup

```bash
git clone <repo-url>
cd verseodin-trial-2026
nvm use
npm install
npm run seed
npm run dev
```

Notes:
- Node version is 22 (from `.nvmrc`).
- Seed scripts generate deterministic mock data in `public/visits.json` and `public/monitoring-events.json`.
- I did not change scaffold tooling (Next.js App Router, TypeScript strict, Tailwind, Recharts, Lucide).

## What I built

Feature 1 (`/traffic`): I implemented an AI Traffic dashboard that loads `visits.json` (~100k rows), classifies bots from user-agent substrings, aggregates once into a per-day x per-bot matrix, and renders a stacked bar chart with legend toggles, tooltip, summary line, Top Pages, and Top Crawlers. The page includes loading, empty, error, and all-bots-hidden states, and uses a single bot metadata map for color/label consistency across chart, legend, tooltip, and crawler avatars. Performance target behavior is achieved by reusing aggregated data for toggles instead of re-scanning raw visits on each interaction.

Feature 2 (`/actions`): I implemented an Action Centre that loads `monitoring-events.json` (~200 events), derives 15-30 actionable cards through a pure `deriveActions(events)` function, and renders Active/Dismissed tabs with composable Severity + Action Type filters. Accept/Dismiss updates card status immediately and persists through `localStorage` (`actionCentre.v1`) with merge logic that preserves status for matching derived IDs and drops stale IDs when source events change. The page includes hydration-safe loading (no wrong-state flash), explicit empty states, responsive card grid, semantic controls (`button`, `select`), and keyboard-operable interactions.

## What I cut and why

- Date-range filter (`7d/30d/90d`) in `/traffic`: optional in the brief, so I locked to 90 days to prioritize required interactions and performance.
- Web Worker for traffic aggregation: optional stretch; aggregation already meets budget with current seeded volume, so I kept implementation simpler for trial scope.
- Unit tests: optional positive signal only; I prioritized complete feature behavior and documentation within the 8-hour cap.
- Advanced mobile polish below 640px: spec allows basic handling; current layout remains usable and responsive.
- Toast notifications in Action Centre: explicitly not wanted in the spec; status change and card movement provide feedback.

## AI tool usage

I used AI tools (GitHub Copilot) as a coding assistant for boilerplate acceleration, refactor suggestions, and TypeScript narrowing ideas. I used them to speed up UI scaffolding (Tailwind structure), suggest derivation/grouping approaches, and draft utility logic, then I manually reviewed and edited all generated code before keeping it.

What I reviewed or rewrote line-by-line:
- Reworked traffic processing to aggregate once and avoid repeated raw-array filtering on legend toggles.
- Enforced deterministic action IDs from stable event-derived inputs (no random IDs).
- Tightened union-type narrowing for event-specific fields in derivation builders.
- Adjusted tooltip date handling and hydration behavior to avoid runtime and UI-state issues.

In short: AI helped with speed and drafts; final logic, constraints alignment, and acceptance decisions were manually verified.

## What I'd do in week 2

- Add focused unit tests for `deriveActions` determinism, filter composition, and persistence merge behavior.
- Add optional `7d/30d/90d` range controls on `/traffic` while keeping aggregated-data performance characteristics.
- Profile production build on a mid-range laptop and, if needed, move aggregation to a Web Worker.
- Improve accessibility depth (screen-reader announcements for tab/count changes and stronger keyboard focus states).
- Add lightweight product polish (small mobile ergonomics and clearer status microcopy) without adding out-of-scope infrastructure.
