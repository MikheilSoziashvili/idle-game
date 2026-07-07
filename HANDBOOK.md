# UPTIME — The Player's Handbook

*You are the platform team now. This is your onboarding doc.*

UPTIME is an idle/strategy game about real infrastructure: every box on the canvas is a real technology (Nginx, Postgres, Kafka, Redis…) with its real-world trade-offs baked into its stats, and every failure mode you'll hit — cache stampedes, replication lag, retry storms, connection exhaustion — is one that has paged a real on-call engineer. Play it as a game; leave with a systems-design education.

---

## 1. The 60-second version

1. **Traffic pays.** Users send requests; every request you serve earns money; every request you drop burns reputation — and reputation is your growth rate.
2. **Drag** a server from the palette onto the canvas. **Wire** (`W`) the Internet to it. You're live.
3. Watch the **top bar**: RPS served, p95 latency, profit/s, uptime. Click any gauge to see *why* it reads what it reads.
4. A **red edge** means the node behind it is saturating. Cache it, queue it, or scale it.
5. When you outgrow the architecture, **raise a funding round** (prestige): the canvas resets, but you bank permanent Scale Points — and your blueprints survive.

The in-game tutorial walks you through this. Field notes (the cards that pop up) teach each concept the *first time it happens to you* — the game never lectures ahead of your experience.

---

## 2. How traffic actually works

### Request classes

All traffic is one of five classes, each with a fixed color everywhere in the UI (cards, wires, edge labels):

| Class | Color | What it is | Who terminates it |
|---|---|---|---|
| `static` | 🔵 blue | Pages, images, JS bundles | Web servers, CDNs, S3 |
| `api` | 🟠 amber | Compute-bound requests | App servers, Lambda |
| `read` | 🟣 purple | Database reads | Databases, replicas, **caches** (partially) |
| `write` | 🔴 red | Database writes | Databases only — and they cost more (Postgres ×3, MySQL ×5, SQL Server ×2, Mongo ×1.2) |
| `job` | 🟢 teal | Async work (exports, ML batches) | Workers, via queues |

Which classes exist depends on which **products** you've launched (§10). A static site sends only `static`; launch Accounts and reads/writes appear; launch Search and jobs arrive.

### Ports and wires

Wires only connect matching **port types** — the type system is a teacher:

- **web** (blue) — carries requests between front-line boxes
- **storage** (purple) — reads/writes/replication between apps, caches and databases
- **jobs** (teal) — async work into queues and out to workers
- **control** (cyan, dashed) — policy, not traffic: Autoscaler/Kubernetes → Zone

In wire mode you can drag **card-to-card** — ports auto-match. If two boxes can't connect, the error toast explains *why* and names the intermediary you're missing (e.g. web boxes don't speak storage — put an App Server in between).

### The flow model

Each node drains what its in-wires delivered, processes up to its capacity, and:
- **serves** classes it terminates (this earns money),
- **cache-hits** a fraction (caches serve reads/static without asking downstream),
- **forwards** the rest out the matching port,
- **drops** whatever overflows its queue or times out (5 s for user-facing classes; jobs are patient).

Backpressure is emergent: a slow node's queue grows, its latency climbs (`base × (1 + 2·util³) + queue wait`), and past the queue limit requests spill as errors. The famous hockey stick — latency exploding near 100% utilization — is why real teams autoscale at 60–75%, and why you should too.

---

## 3. Reading the cockpit

### Top bar gauges

| Gauge | Target | Notes |
|---|---|---|
| **RPS** served / offered | serve what's offered | The gap is your drops + sheds |
| **p95 latency** | SLO 250 ms | 95% of requests finish faster than this. Excludes async jobs. Revenue decays past ~220 ms and floors at 30% by 2.6 s — slow is the same as down, financially. Real-time products tighten the knee to 140 ms. |
| **Profit /s** | up and to the right | revenue − infra. Without Stripe, revenue settles slowly through AR (click **Invoice** to collect now). |
| **Uptime** | SLA 99.9% | Served ÷ completed, smoothed. 99.9% = 43 min of error budget per month. |
| **RP / REP / SP** | — | Research Points (observability generates them) · Reputation (drives growth) · Scale Points (prestige currency) |

### Card anatomy

Every node card is a live mini-dashboard:

- **Role line** — what the box is doing *right now*: `84% hit · shielding postgres`, `buffering 240 jobs → 2 workers`, `partitioning r/w → 3 shards`, `r 12 · w 3/s · conns 4/6`
- **Stats row** — in-rps, effective latency, served, queue depth (or cache hit%)
- **Class strip** — colored bar showing the traffic mix passing through
- **Utilization bar** — green → amber → red
- **Queue bar** — appears when a backlog builds
- **Sparkline** — served rps, last 48 s
- **Port glow** — a port lights up while traffic flows through it
- **Hints** — amber banners when something's misconfigured, with the fix

The **Inspector** (select a node) adds live stats, a **fed by / feeds** list (click to jump), the real documentation link for the technology, and the *why it matters* explainer.

### Overlays

The overlay switcher (bottom of the canvas) tints every card by one metric: **Load**, **Latency**, **Cost**, **Errors**, **Cache**. When something's wrong, the Errors overlay + the red **drop-path** breadcrumbs (edges upstream of a dropping node get highlighted) point at the bottleneck.

---

## 4. Money, reputation, growth

The core loop is a flywheel:

> serve requests → earn revenue → reputation holds → company scale grows → more traffic → build more

- **Reputation** chases your uptime: 99.9%+ maps to rep 100, 90% maps to 0. It **bleeds ~4× faster than it heals** — a 30-second outage costs real growth; a clean week earns it back.
- **Shedding beats dropping.** A rate-limited 429 costs ~15% of a hard drop's reputation damage. This is why API Gateways exist.
- **Growth** is logistic toward the current funding round's market cap. At the cap, only raising a round (§10) lets you grow further.
- **Costs**: every box has an hourly bill (opCost/s), upgrades multiply it ×1.45 per level, and some services charge per request (S3, Lambda, Fastly, SQS, Datadog). Disabled nodes cost 15% (parked, not free).
- **Offline progress**: away time accrues revenue at 50% efficiency, capped at 8 hours. Your automation writes you a story about what happened.

---

## 5. The catalog — trade-offs, not upgrades

Rival technologies are *sideways* choices, not tiers. The differences below are the design intent (exact numbers are on the cards and in `balance.ts`):

### Ingress / network
| Tech | The trade |
|---|---|
| **Nginx** ($60) | The front door. Serves static itself, proxies the rest. Your first box. |
| **Load Balancer** ($140) | Managed, health-checked, splits by *headroom* — pulls failing targets from rotation. |
| **HAProxy** ($90) | 2× the throughput at half the run cost — but **round-robin**: blind to headroom *and* health. The classic managed-vs-software trade. |
| **API Gateway** ($220, research) | Sheds overload at the door as cheap 429s instead of expensive timeouts. Breaks retry storms. |
| **Product Ingress** ($400, research) | A dedicated front door for ONE product (§8). |

### Compute
| Tech | The trade |
|---|---|
| **App Server** ($120) | Stateless container. The workhorse. Zone-able. |
| **Spot Instance** ($100, cheap to run) | ~60% cheaper — and reclaimed for ~12 s on a rolling cycle. Run fleets with N+1 headroom, or don't run them at all. |
| **Lambda** (research) | Zero idle cost, self-scaling, $0.003 per request, cold starts when demand outruns warm capacity. Spiky workloads: yes. Sustained volume: do the math. |

### Cache / edge
| Tech | The trade |
|---|---|
| **Redis** ($180) | 85% read hit. The highest-leverage box in the catalog. |
| **Memcached** ($110) | ⅓ the cost, 2× the throughput, 62% hit — fast-and-dumb vs Redis's data structures. |
| **Cloudflare CDN** ($300) | 92% static / 30% read at the edge, flat fee. |
| **Fastly** ($340) | 90% static / **55% read** (programmable edge caches what others don't dare) — plus a per-request fee. |
| **Varnish** ($150) | Self-hosted accelerator: no per-request fees, but it's in *your* rack — no edge latency win. |
| **S3** ($90) | Not a cache: object storage that terminates static, priced per request. |

### Data (the hard part)
| Tech | The trade |
|---|---|
| **Postgres** ($240) | The balanced default. Writes cost 3× a read. |
| **MySQL** ($170) | Cheaper, everywhere — writes cost **5×** (weaker write concurrency). |
| **SQL Server** ($320, 0.65/s bill) | Strong engine, 2× writes — licensed by the core, forever. |
| **MongoDB** ($220, research) | Writes spread easily (×1.2) — weaker relational guarantees. |
| **Elasticsearch** ($380, research) | Read/search fan-out monster; **needs a real database behind it for writes**. |
| **Read Replica** ($200, research) | Wire a storage link FROM a SQL primary to keep it in sync. Reads scale; lag is real (§6). |
| **Shard Router** ($260, research) | Splits reads *and writes* across multiple primaries — the only way writes scale (§8). |

### Async
**Kafka** ($260) is a durable log with a deep buffer for firehose volume; **RabbitMQ** ($150) is the simpler broker that does the job below serious scale; **SQS** ($80, per-message fee) is the zero-ops managed version. All of them feed **Workers**, which *pull* — they never overload; add more to drain faster. Rule of thumb: provision workers for average load, let the queue eat the peaks.

### Observability & automation
**Prometheus** turns served traffic into Research Points; **Datadog** samples 2× better for a real SaaS bill; **Grafana** multiplies RP ×1.5. **Autoscaler** + **Zones** = capacity as policy. **Kubernetes** heals attached zones fast and bin-packs them 20% cheaper. **CI/CD** cuts boots from 10 s to 3 s and upgrades by 12%. **Stripe** settles revenue instantly (+2%).

---

## 6. How real behavior bites (the realism layer)

These are the mechanics that make UPTIME a simulation rather than a spreadsheet. Each fires a field note the first time it happens to you.

| Behavior | The rule | The defense |
|---|---|---|
| **Cold caches** | A freshly deployed cache starts at 25% effectiveness and warms over ~40 s of traffic. Restarting a hot cache = a miss storm at your origin (the *thundering herd*). | Keep the origin provisioned for a cold start; don't restart caches casually. |
| **Replication lag** | Push a SQL primary past ~70% write utilization and its replicas fall behind (watch the `lag` stat). Past 2 s, replica reads are **stale** and earn 15% less. | Ease write pressure: queue the bursts, upgrade the primary, or shard. |
| **Connection-pool pressure** | Every wired client (× its zone instances) holds connections. A database tolerates 6 + 3/level clients; past that, latency and capacity degrade. | The **Connection Pooling** research (PgBouncer) absorbs it entirely. Until then: replicas spread clients, upgrades raise the pool. |
| **Retry storms** | 30% of timed-out user requests come *back* as retries — load rises exactly when capacity falls. | Fail fast: API Gateway / rate-limit region policies shed as 429s, which never time out and never multiply. |
| **Health checks** | Smart balancers (ELB) pull targets below 50% health from rotation. Round-robin splitters (HAProxy, raw DNS) keep sending into the fire. | Pay for the managed LB, or accept the risk knowingly. |
| **Spot reclaims** | Each spot box goes dark ~12 s per ~3.5 min cycle (staggered per node; zone pools lose half). | N+1 headroom, orchestration, or don't put spot on the critical path. |
| **Cold starts** | Lambda's warm capacity follows recent throughput; a demand jump pays a ~260 ms penalty until it catches up. | Front spiky-but-shallow traffic; keep deep sustained flows on servers. |

---

## 7. The scaling ladder

Every architecture in UPTIME climbs the same ladder real systems climb. When a step stops working, the next one exists for a reason:

1. **Vertical** — upgrade the box (capacity ×1.65/level, cost ×1.45/level, max L6). Simple, ceilinged.
2. **Horizontal** — Load Balancer + N servers. No ceiling, no single point of failure.
3. **Cache the reads** — an 85% hit rate multiplies effective DB capacity ~6×. The cheapest capacity you'll ever buy.
4. **Queue the bursts** — convert spikes you can't serve into backlogs you drain at your own pace.
5. **Replicate the reads** — fan reads across replicas; accept the lag asterisk.
6. **Pool the connections** — PgBouncer research; your app tier stops strangling the primary with hellos.
7. **Shard the writes** — the last wall (§8).
8. **Decompose the monolith** — per-product stacks behind dedicated ingresses (§8).

The **Architecture Doctor** (🩺) reads your live graph and tells you which rung you're failing on, with a costed fix.

---

## 8. Building big

### Zones (research: Autoscaling)
Paint a **Zone** (`Z`): a declarative pool of one template (nginx / app / spot / worker) with min/max instances and a target utilization. Wire an **Autoscaler** to its control port and capacity becomes a policy, not a purchase. Kubernetes attached = self-healing + 20% cheaper.

### Regions
Paint a **Region** (`R`) and apply policies to everything inside: **Redundancy** (+25% cost; outages degrade instead of kill), **Rate-limit** (shed overload gracefully), **Cache TTL** (+8% hit), **Aggressive scaling** (faster autoscale, +10% cost). Multi-region research makes redundancy fully absorb outages.

### Blueprints
Save any selection as a **blueprint**; stamp it with `B`. Blueprints survive prestige — the second build is always faster; that's what institutional knowledge means. Share them as `UPBP1.…` codes.

### Product Ingress (research: Domain Decomposition)
Bind a launched product to a **Product Ingress** and its traffic enters *there* instead of the shared Internet. Now Search runs on its own stack — its job-heavy shape gets queues and workers, while Checkout keeps its write-optimized data layer. Isolation is the point: one product's meltdown stops taking the others with it. Two ingresses on one product split it (multi-entry). Unwired/unbound ingresses safely fall back to the Internet.

### Shard Router (research: Sharding)
Caches absorb reads. Replicas spread reads. Pooling absorbs connections. **Writes still funnel into one primary** — until you shard. Wire App → Shard Router → 2+ primaries and each shard takes its slice of reads *and writes*. Capacity now scales with shard count; so does operational reality (the lesson covers what Vitess and hot shards mean). Milestones pay RP for your first decomposition and your first shard split.

---

## 9. Incidents & live-ops

**Events** begin gently (first scripted spike ~4 minutes in; real incidents only after $1.8k lifetime revenue): traffic spikes (2.2–3.4× for 45–90 s, 15 s warning), slow-query storms (−55% DB capacity), zone outages, third-party dependency failures, bad deploys. Difficulty adapts invisibly: struggling players get longer gaps and gentler spikes; cruising players get pressure.

- **First-failure insurance**: your first bottleneck teaches instead of scarring — 30 s of rep protection, once per run.
- **Postmortems**: after every incident, an auto-generated report card — what it cost, what softened it (things you built), what would have helped (things you didn't). Archived in Company History (🕘).
- **Chaos drill** (🔥): a daily 3-minute gauntlet (spike + slow queries + outage). Pass with <3% drops for RP that scales with your streak.
- **SLA contracts**: after the 10-rps milestone, a board of client offers refreshes every 5 minutes — hold a metric (p95, uptime, cost…) for a hold window before the deadline, get paid in cash/RP/rep. Failing costs reputation: sign what you can keep.
- **Board mandates**: chosen when you raise a round; risk/reward for the *next* run — **Blitzscaling** (×1.5 growth, ~35% more events, +40% SP), **Reliability pledge** (+12% revenue, rep bleeds ×1.75, +25% SP), **Shoestring ops** (−15% cost, −15% market cap, +30% SP).
- **The rival**: a competitor ticker grows toward 90% of the round's cap. Raise while out-serving them: +2 SP.
- **Mastery**: every technology levels up with lifetime requests served (1k / 100k / 10M → bronze / silver / gold), each tier +2% capacity for that kind, forever.

### The reliability loop (SLOs, releases, incident command)

The SRE mechanic, made playable:

- **SLO & error budget**: each funding round promises a success ratio (99% pre-seed → 99.95% at IPO). The gap to 100% is your **error budget** over a rolling 10-minute window — the green strip under the uptime gauge. Drops burn it fast; shed 429s burn it at 15%. Run it dry and **releases freeze** until it recovers past 15%.
- **Ship releases (🚀)**: every ~75 s you can ship a feature — +$35 launch bump and permanent demand growth (+1.5% each, capped +30%). But every deploy is a gamble: **22% chance of a bad deploy** (44% if you ship with a thin budget) that degrades a random node. **Progressive Delivery** research adds canaries: bad builds are caught at 5% traffic and rolled back for a small fee. Velocity vs reliability, the actual trade.
- **p99 tail latency**: the p95 gauge now shows the tail. When p99 detaches from p95 (3×+), a queue is holding your heaviest users hostage — and they're your biggest accounts.
- **Circuit Breakers** (research): callers stop forwarding to a drowning dependency and fail fast as cheap 429s — the edge turns amber with a `⌁ open` badge, probes half-open, closes when the target recovers. Kills retry storms at the source.
- **Incident Command**: when something is actively burning, a red command bar appears with real mitigations — **Surge** (+40% capacity for 30 s, costs real money), **Shed load** (20 s of global fail-cheap), **Roll back** (when the deploy was the cause — you lose the feature, the node comes back healthy). Commanding an incident visibly earns rep back in the postmortem. Mitigate first, diagnose later.

---

## 10. Products & funding rounds

### Products (tiers)
Launching a product adds its traffic stream — shape and value both. Launch what your architecture can serve; a product you can't handle tanks uptime *and* reputation.

| Product | Cost | Gate | Traffic it adds |
|---|---|---|---|
| Static Site | free | — | all static |
| Dynamic API | $400 | — | + api |
| Accounts + Database | $1.2k | Caching research | + reads/writes |
| Search / Analytics | $2.5k | Queues research | + jobs |
| Real-time Platform | $6k | CDN research, Seed round | latency-sensitive (140 ms knee) |
| ML Inference | $15k | ML Pipelines, Series A | job-heavy, high value |

### Raising rounds (prestige)
Scale Points pending = √(lifetime revenue ÷ 2500), min 2 to raise. Raising resets the canvas and cash but banks SP permanently:

- **Rounds**: Pre-seed → Seed → Series A–E → **IPO** at 0 / 2 / 8 / 20 / 50 / 120 / 260 / 550 total SP. Each raises the market cap — from 260 rps at Pre-seed to **1.6M rps at IPO**.
- **Perks** (SP, permanent, max 10 levels, cost = level+1): Throughput +8%/lvl · Revenue +8%/lvl · Efficiency −6% cost/lvl · Momentum (+$750 starting cash & +6% demand/lvl).
- **What survives**: SP, perks, blueprints, achievements, mastery, all-time stats. **What doesn't**: the canvas, cash, research, tiers — the rewrite is the point.

---

## 11. Cases, challenges & making your own

- **Case studies** (Cases button): timed consulting engagements with fixed budgets and SLO objectives — an AWS-patterns track plus a 5-mission product arc (URL shortener → streaming platform). Your campaign is snapshotted and restored when you exit; passing banks RP.
- **Weekly challenge**: one seeded scenario, identical for every player that ISO week. Compare score codes.
- **Challenge editor**: build your own scenario (budget, traffic, events, objectives) and export it as a `UPCASE1.…` code. Imported content is sandboxed and validated.
- **Constrained runs**: self-imposed handicaps (serverless-only, no-cache…) with achievements for raising a round under them.
- **Exports**: **⎙ Photo mode** renders your graph as a clean SVG diagram; **¶ Design doc** exports a full Markdown architecture document — components with live roles, traffic flows by class, SLO snapshot, data-layer notes, Doctor risks, incident history. Your save itself travels as a `UPTIME1.…` code (Settings).

---

## 12. Controls & reference card

| Key | Tool |
|---|---|
| `V` | Move (Shift+drag = box select) |
| `S` | Select (drag a box; bulk-upgrade in Inspector) |
| `W` | Wire — drag card-to-card, ports auto-match; click a wire to remove it |
| `Z` | Zone (paint a pool) |
| `R` | Region (paint policies) |
| `B` | Stamp a blueprint |
| `U` | Upgrade (click nodes) |
| `X` | Bulldoze (50% salvage) |
| `F` / `L` | Fit view / auto-layout |
| `Cmd/Ctrl+S` | Save now (autosaves every 10 s regardless) |
| `Space` | Pause / resume |
| `1` `2` `3` | Sim speed 1× / 2× / 4× |
| `?` | Field Manual (glossary + collected notes) |
| `Esc` | Cancel stamp → back to Move → clear selection |

**Rename anything** (nodes, zones) in the Inspector — `pg-prod-1` beats "Postgres" in your postmortems and exports.

---

## 13. Field manual: when it breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Red edge, drops climbing | Saturation at the node behind it | Upgrade, add a balanced sibling, or cache/queue upstream |
| p95 exploding, no drops | Utilization ~90%+ somewhere (the hockey stick) | Scale *before* 75% util — the last quarter of capacity isn't usable |
| "Timeouts breeding retries" | Congestion collapse forming | Shed at the door (API Gateway / rate-limit region), then add capacity |
| Cache hit% suddenly low | It restarted cold | Wait out the warm-up; keep origin headroom for next time |
| "Replica lag — stale reads" | Primary write util > 70% | Queue write bursts, upgrade the primary, or shard |
| "Connection storm" on a DB | Too many clients on the pool | Pooling research, a replica, or a DB upgrade |
| Reads fine, writes drowning | The last scaling wall | Shard Router → multiple primaries |
| One product ruining all of them | Shared monolithic stack | Product Ingress → give it its own stack |
| Everything's fine but growth stalled | Market cap for the round | Raise the round; pick a mandate you can honor |

When in doubt: **🩺 Architecture Doctor** for a costed review, the **Errors overlay** + red breadcrumbs for *where*, and the **Event Log** for *what happened*.

---

*Numbers in this handbook match `src/game/engine/balance.ts` and `src/game/catalog/nodes.ts` at the time of writing; the cards and Inspector are always authoritative. Everything fails, always — the question is only how boring you made it.*
