# UPTIME

A node-based platform-engineering game. Traffic flows through an architecture you
build and wire together on a canvas — you win by **optimizing and automating the
system**, not by grinding a currency. It looks like the thing it simulates: a
living architecture diagram — light whiteboard canvas, white cards with the real
tools' marks (Nginx, Redis, PostgreSQL, Kafka, Kubernetes, Grafana, Stripe…),
wires that color with load, and a dark ops console + gauge bar docked on top.

Brand marks are rendered from the MIT-licensed [simple-icons](https://simpleicons.org)
set and used nominatively — this is a game *about* the real tools; all trademarks
belong to their respective owners. AWS services (S3, Lambda, ELB, Auto Scaling)
use original glyphs in AWS's category colors, since Amazon's marks aren't
redistributable.

**It also teaches for real.** The game is built as a hands-on platform-engineering
curriculum: the first time you experience each real phenomenon — saturation, the
latency hockey stick, cache-aside, backpressure, load shedding, cold starts,
counting nines — a *field note* explains the actual engineering concept behind it,
with the real terminology. Every node carries a real-world "field manual" entry in
the Inspector, the dashboard gauges explain p95/SLO/uptime math on hover, and a
glossary + your collected notes live in the Field Manual (`?`). Content lives in
`src/game/catalog/lessons.ts`; notes can be toggled off in Settings.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

`npm run build` type-checks and produces a production bundle in `dist/`.

## How to play (first 15 minutes)

1. Drag **Nginx** from the palette, wire **Internet → Nginx** (drag port to port,
   or press `W` and click node → node). Traffic starts flowing; you're live.
2. Traffic grows while reputation holds. Around 12 rps your Nginx saturates —
   the edge turns red, requests drop. Add a **Load Balancer** + second server,
   or click it with the **Upgrade** tool (`U`).
3. Build **Prometheus** → Research Points flow, overlays unlock (`Load`,
   `Latency`, `Cost`…) — the info-views for finding bottlenecks.
4. Research **Caching**, launch the **Accounts** tier, and protect Postgres with
   **Redis** (App → Redis → Postgres). Cache hits never touch the database.
5. Research **Autoscaling**, paint a **Zone** (`Z`), wire an **Autoscaler** to
   its control port. Manual server-buying is over.
6. Ride out a traffic spike, automate billing with **Stripe**, and when the
   dashboard shows 2+ pending SP — **raise a funding round** (prestige): the
   canvas resets, Scale Points and blueprints stay. Save a blueprint first.

**Sandbox mode** (⚙ → Sandbox): unlimited budget, everything unlocked, and a
traffic slider — pure creative building.

## Case studies (Cases button)

Six consulting engagements for developers, each modeling a pattern you'd deploy
on AWS: **Static site, global audience** (CloudFront + S3), **Black Friday**
(EC2 Auto Scaling + ElastiCache), **The database is on fire** (RDS + cache +
read replicas), **Right-size the fleet** (FinOps), **Spiky by design**
(Lambda + API Gateway), and **Four nines** (Multi-AZ + self-healing). You get
the client's half-built architecture, a fixed budget, scripted traffic and
incidents, and SLOs to hold continuously. Your campaign is snapshotted on entry
and restored on exit; passing pays Research Points back to the company and ends
with a real-world debrief. Definitions live in
`src/game/catalog/casestudies.ts` — add your own scenario by appending to
`CASES`.

## Keys

`V` move · `W` wire · `Z` zone · `R` region · `B` stamp blueprint · `U` upgrade ·
`X` bulldoze · `F` fit · `L` auto-layout · `Space` pause · `1/2/3` speed ·
`Shift+drag` box-select · `Cmd/Ctrl+Z` restore removed wires · `Cmd/Ctrl+S` save

## Architecture (for tinkering)

- `src/game/engine/balance.ts` — **every tunable number** lives here.
- `src/game/engine/simulation.ts` — fixed-timestep (10 Hz) flow simulation;
  fully decoupled from React. Each edge is a one-tick pipe; each node drains
  in-edges into a per-class backlog, processes up to `capacity × dt`, serves /
  cache-hits / forwards by port type, and sheds what overflows its queue.
  Latency = `base × (1 + 2·util³) + queueWait`; timeouts and drops are
  emergent backpressure.
- `src/game/engine/economy.ts` — demand & value blending from launched tiers.
- `src/game/catalog/` — node specs, tech tree, tiers, milestones, blueprints.
- `src/game/systems/` — autoscaler, events (spikes/incidents), overlays, zoning.
- `src/game/state/` — zustand store + localStorage persistence (autosave every
  10 s, offline progress at 50% efficiency capped at 8 h, export/import strings).
- `src/components/` — React Flow canvas, panels, HUD. The engine writes one
  snapshot per tick into the store; components subscribe narrowly by id.

Saves live in `localStorage` under `uptime.save.v1`. Dev console handles:
`window.__uptime` (store) and `window.__uptimeSave` (persistence).
