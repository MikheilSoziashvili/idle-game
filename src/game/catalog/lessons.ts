import type { NodeKind } from '../engine/types';

// ---------------------------------------------------------------------------
// The educational layer. UPTIME uses real infrastructure and real failure
// modes; these "field notes" fire the FIRST time the player experiences each
// phenomenon and explain the actual engineering concept behind it, with the
// real terminology. Dry SRE-mentor voice: teach, don't preach.
// ---------------------------------------------------------------------------

export interface LessonDef {
  id: string;
  title: string;
  tag: string; // the real-world term, shown as a chip
  body: string;
}

export const LESSONS: LessonDef[] = [
  {
    id: 'first-request',
    title: 'Request → response',
    tag: 'the basics',
    body:
      'Every click on a website is a request: it travels to your infrastructure, gets processed, and returns as a response — ideally in a few hundred milliseconds. You earn per served request here; real platforms earn trust the same way. Everything that follows — caches, queues, balancers — exists to answer more requests, faster, for less money.',
  },
  {
    id: 'bottleneck',
    title: 'The red edge',
    tag: 'saturation',
    body:
      'A server receiving more requests per second than its capacity builds a queue; when the queue overflows, requests fail. That red edge is saturation — the first thing real dashboards watch. Two fixes: a bigger box (vertical scaling) or more boxes behind a load balancer (horizontal scaling). Horizontal wins at scale: no ceiling, no single point of failure.',
  },
  {
    id: 'latency-curve',
    title: 'The hockey stick',
    tag: 'queueing theory',
    body:
      "Latency doesn't grow linearly with load — it explodes near 100% utilization, because an almost-full system queues almost everything. This is why real teams autoscale at 60–75% utilization, not 95%. The last quarter of capacity isn't really usable; it's where response times go to die.",
  },
  {
    id: 'cache-aside',
    title: 'The read that never happened',
    tag: 'cache-aside',
    body:
      'Redis just answered a read from memory in ~1ms without asking the database — a cache hit. At an 80% hit rate your database sees only 1 in 5 reads, so a cache effectively multiplies database capacity by 5×. The pattern (check cache → on miss, read the DB and fill the cache) is called cache-aside, and it is the highest-leverage optimization in web architecture.',
  },
  {
    id: 'db-contention',
    title: 'Protect the primary',
    tag: 'stateful systems',
    body:
      "Databases are the hardest thing to scale because they hold state — you can't just clone them like app servers. Writes are worse than reads: they must be ordered and durable (3× the cost here). Real teams defend the primary at all costs: caches for reads, replicas for read fan-out, queues to smooth write bursts.",
  },
  {
    id: 'queue-buffer',
    title: 'Buffer, don\'t drop',
    tag: 'backpressure',
    body:
      "Kafka is accepting work faster than your workers can drain it — and that's the point. A queue converts a spike you couldn't afford to serve instantly into a backlog you process at your own pace; the trade is that jobs finish later. Rule of thumb: provision workers for average load and let the queue eat the peaks.",
  },
  {
    id: 'autoscaling',
    title: 'The loop closes itself',
    tag: 'control loops',
    body:
      'The autoscaler just did your job: it saw utilization drift past target and added instances, no human involved. Real autoscalers (Kubernetes HPA, EC2 Auto Scaling Groups) work exactly like this — a control loop tracking a target metric, with cooldowns to prevent flapping. Your skill shifts from buying servers to tuning policy: target, min, max, aggressiveness.',
  },
  {
    id: 'cold-start',
    title: 'Cold starts',
    tag: 'serverless',
    body:
      "Lambda scales from zero automatically — but 'from zero' is literal: fresh instances take time to warm up, so the first requests after a traffic jump wait. Serverless is unbeatable for spiky, low-average workloads (idle costs nothing) and gets expensive at sustained scale. Everything in infrastructure is a trade.",
  },
  {
    id: 'spike',
    title: 'The hug of death',
    tag: 'capacity planning',
    body:
      "Real spikes look like this: launches, front pages, viral moments — several times normal traffic, arriving in minutes. You cannot buy servers inside that window unless provisioning is automated. Teams that survive have headroom, autoscaling with fast boots, queues for deferrable work, and caches so the spike lands on the cheap layers first.",
  },
  {
    id: 'shed-load',
    title: 'Fail cheap, fail fast',
    tag: 'load shedding',
    body:
      'The gateway just returned 429 Too Many Requests instead of letting requests time out. Counter-intuitively, rejecting work quickly is kinder than accepting work you will fail slowly: users can retry, servers don\'t melt, and the reputation damage is a fraction. Every serious API sheds load at the door.',
  },
  {
    id: 'sla-nines',
    title: 'Counting nines',
    tag: 'SLOs',
    body:
      "Uptime is counted in nines: 99.9% ('three nines') still means 43 minutes of downtime per month; 99.99% means 4.3. Each extra nine costs roughly ten times the engineering effort. That's why real SLAs are promises with error budgets rather than perfection — and why your reputation here tracks uptime, not feature count.",
  },
  {
    id: 'p95',
    title: 'Percentiles, not averages',
    tag: 'observability',
    body:
      "Prometheus is scraping your platform now. Notice the dashboard says p95, not average: an average hides pain — 100 fast requests plus 5 awful ones still 'averages fine'. p95 says: 1 in 20 users waits longer than this. Real SLOs are set on percentiles, because your slowest requests belong to your angriest users — often the big customers with the most data.",
  },
  {
    id: 'redundancy',
    title: 'Everything fails, always',
    tag: 'reliability',
    body:
      "An incident is running. Hardware dies, zones lose power, deploys go bad — real reliability engineering starts from the assumption that everything fails, always. The answer is redundancy: N+1 instances, multi-zone regions, orchestrators that heal automatically. You cannot prevent failures; you can only make them boring.",
  },
  {
    id: 'cdn-edge',
    title: 'Move the bytes to the users',
    tag: 'edge computing',
    body:
      'Your CDN is serving from the edge — machines physically near users — so those requests never cross an ocean to your origin. Physics is undefeated: light in fiber costs ~50ms per continent crossed, and no code optimization buys that back. The cheapest, fastest request is the one your infrastructure never sees.',
  },
  {
    id: 'rearchitect',
    title: 'The rewrite',
    tag: 're-architecture',
    body:
      "You've outgrown this architecture — a good problem. Real companies hit this too: the scrappy stack that found product-market fit is never the platform that serves millions (ask anyone who watched Twitter's fail whale). Raising a round trades your infrastructure for permanent Scale Points — and blueprints survive, because the second build is always faster. That is what institutional knowledge means.",
  },
  {
    id: 'cache-warm',
    title: 'The cold cache',
    tag: 'cache warm-up',
    body:
      "That cache just booted EMPTY — every request is a miss until it fills, and all those misses are hitting your origin at once. This is why real teams fear restarting a hot cache more than almost any deploy: the database behind it has usually forgotten how to live without it (the 'thundering herd'). Mitigations in the wild: rolling restarts, cache warmers, and keeping the origin provisioned for a cold start you hope never comes.",
  },
  {
    id: 'repl-lag',
    title: 'Yesterday\'s data, served fresh',
    tag: 'replication lag',
    body:
      'Your replica is falling behind the primary — it replays the write-ahead log, and the log is arriving faster than it can apply. Reads still succeed, but they return the PAST: a user updates their cart, refreshes, and sees the old one. This is replication lag, the classic asterisk on "just add read replicas". Real fixes: ease write pressure on the primary (queues, batching), or route the reads that must be fresh (read-your-writes) to the primary and let the rest tolerate staleness.',
  },
  {
    id: 'conn-pool',
    title: 'Too many friends',
    tag: 'connection pooling',
    body:
      "Every app instance holds open connections to your database, and each one costs the DB real memory and scheduling work (Postgres famously forks a process per connection). Scale out your app tier without pooling and you can strangle a healthy primary with pure connection overhead — the queries were fine; the hellos killed it. The industry fix is a pooler like PgBouncer: thousands of client connections multiplexed onto a few dozen database sessions.",
  },
  {
    id: 'retry-storm',
    title: 'The stampede after the stumble',
    tag: 'retry storm',
    body:
      "Requests are timing out — and the users behind them are hitting refresh. Every timeout breeds a retry, so effective load RISES exactly when capacity falls: the failure feeds itself. This is how small incidents become big ones (and why clients should retry with exponential backoff and jitter). The architectural fix is to fail FAST at the door: a rate-limiting gateway turns overload into instant 429s, which don't time out and don't multiply.",
  },
  {
    id: 'microservices',
    title: 'The monolith, decomposed',
    tag: 'service decomposition',
    body:
      "One of your products now enters through its own front door and runs on its own stack. That's the essence of microservices — not small code, but ISOLATION: search traffic can no longer take down checkout, each stack scales to its own workload shape, and each can pick its own database. The tax is real too: more boxes to run, more wires to misconfigure, and every hop adds latency. Amazon and Netflix decomposed when team count, not request count, demanded it.",
  },
  {
    id: 'sharding',
    title: 'When one primary isn\'t enough',
    tag: 'sharding',
    body:
      "You've hit the wall every planet-scale system hits: caches absorb reads, replicas spread reads, but WRITES still funnel into one primary. Sharding is the answer of last resort: partition the data by key (user id, region, tenant) so each shard owns a slice and takes only its share of writes. Now capacity scales with shard count — and so does operational pain: cross-shard queries, rebalancing hot shards, resharding as you grow. YouTube ran on sharded MySQL via Vitess; so does Slack.",
  },
  {
    id: 'tail-latency',
    title: 'The tail wags the business',
    tag: 'p99',
    body:
      "Your p95 looks fine — but p99 is several times worse, and that 1-in-100 request isn't random: heavy users with the most data hit the slow paths most often, so your worst latency lands on your best customers. Real SLOs are set on the tail (p99, even p99.9) because averages hide exactly the pain that churns accounts. When the tail detaches from the median, look for queues: one slow request at the front of a line delays everyone behind it.",
  },
  {
    id: 'circuit-breaker',
    title: 'Fail fast, recover faster',
    tag: 'circuit breaking',
    body:
      'A breaker just tripped: a dependency was timing out, so its callers stopped sending and failed fast with cheap 429s instead. Counter-intuitive but vital — hammering a drowning service keeps it drowning (every timeout breeds retries), while backing off gives it room to surface. The breaker probes with a trickle of traffic (half-open) and closes once the dependency answers again. Netflix built Hystrix around exactly this pattern after cascade failures took down the whole product.',
  },
  {
    id: 'error-budget',
    title: 'Reliability is a budget, not a virtue',
    tag: 'SLO / error budget',
    body:
      "Your SLO promises a success ratio; the gap between that promise and 100% is your ERROR BUDGET — failure you're allowed to spend. Spend it on risky deploys, bold migrations, load experiments. But when the budget runs dry, releases freeze until reliability recovers: that's the deal between velocity and stability, made explicit. This is how Google SRE ended the eternal dev-vs-ops war — nobody argues about 'being careful'; they argue about a number.",
  },
  {
    id: 'release-train',
    title: 'You are the outage',
    tag: 'change risk',
    body:
      "Most production incidents aren't hardware or traffic — they're CHANGES: a deploy, a config flip, a migration. Every ship is a gamble against your error budget. The fix isn't shipping less (features are why the company exists); it's making shipping safe: canary rollouts that expose a bad build to a slice of traffic, automatic rollback, and freezing only when the budget says so. Elite teams deploy MORE often than laggards — smaller changes, safer rails, faster recovery.",
  },
  {
    id: 'incident-command',
    title: 'Someone has to drive',
    tag: 'incident response',
    body:
      "An incident is running and you have a toolkit: surge capacity (expensive, instant headroom), emergency load-shedding (fail cheap while you think), rollback (when the change was the cause). Real incident command works the same way — one person drives, actions are deliberate, and the goal is MITIGATE FIRST, diagnose later. Restore service, then find root cause in the postmortem. The worst incidents aren't the biggest failures; they're the small ones nobody took command of.",
  },
  {
    id: 'data-gravity',
    title: 'Data has gravity',
    tag: 'storage physics',
    body:
      "Your database was fine at 5 GB and is struggling at 50 — nothing changed except the data. Indexes stop fitting in RAM, every query touches more disk, maintenance (vacuum, compaction) takes longer and hurts more, and one day the disk simply fills and writes stop. Scale reveals problems that weren't there on day one. The escape routes: bigger boxes (upgrades buy comfort), deleting data (nobody ever does), or sharding — which spreads the GROWTH itself, not just the queries.",
  },
  {
    id: 'hot-key',
    title: 'The celebrity problem',
    tag: 'hot partitions',
    body:
      "Your shards split traffic evenly — until one key got famous. Now half the load hammers ONE shard while its siblings idle, and adding more shards fixes nothing: the hot key still lives in exactly one place. This is what took down early Twitter every time a celebrity tweeted. The real fixes: cache the hot key in front (reads never reach the shard), or split the key itself (celebrity followers sharded N ways). Even key DESIGN is capacity planning.",
  },
  {
    id: 'stampede',
    title: 'The thundering herd',
    tag: 'cache stampede',
    body:
      "A popular cache entry expired, and every request that missed went to the database AT ONCE — thousands of identical queries for the same key. That's a cache stampede: the cache was protecting you exactly until the moment it didn't. Request coalescing fixes it with one idea: only ONE request refreshes an expired key; everyone else briefly gets the stale copy (stale-while-revalidate). Facebook's memcache paper calls this 'leases' — the same trick at a billion rps.",
  },
  {
    id: 'gray-failure',
    title: 'Slow is the new down',
    tag: 'gray failure',
    body:
      "A node is failing right now and its health check says it's fine. That's a GRAY failure: not down, just slow — and slow is worse, because nothing routes around it. Health checks answer 'can you reply?', not 'are you replying well?'. The tell is in the tail: p99 detaches while averages look normal. This is why distributed tracing earns its bill — it finds the one slow hop your green dashboards are hiding.",
  },
  {
    id: 'correlated-failure',
    title: 'They all fail together',
    tag: 'correlated failure',
    body:
      "Every node of one kind just degraded at once — same registry, same provider, same bug. Redundancy math assumes failures are INDEPENDENT; correlated failures break the assumption: N copies of the same thing share the same fate. Real outages love this shape: a bad TLS cert in every pod, a cloud provider's managed-Redis incident, one poisoned container image. The hedge is diversity — of kind, of vendor, of version — which is exactly why 'boring' polyglot architectures survive.",
  },
  {
    id: 'on-call',
    title: 'The pager is a person',
    tag: 'on-call',
    body:
      "An incident fired and a human answered — your on-call engineer just auto-mitigated while you were busy elsewhere. That's what on-call IS: a person whose evening absorbs the failure. Reaction time depends on seniority and fatigue, and fatigue is the real currency: every page spends some. Real rotations exist to spread that cost across a team — a pager that always rings the same person is an outage generator with extra steps.",
  },
  {
    id: 'burnout',
    title: 'The rotation you didn\'t build',
    tag: 'burnout',
    body:
      "An engineer just hit their limit and went on leave — mid-quarter, unplanned, exactly when you needed them. Burnout isn't a personality flaw; it's an arithmetic outcome: pages × stress ÷ recovery time. And it compounds: a burned-out responder means slower mitigation, longer incidents, more pages for whoever's left. This is the bus-factor lesson with a human face — one of anything, including people, is a single point of failure.",
  },
  {
    id: 'finops-unit',
    title: 'Cost per request is the real bill',
    tag: 'FinOps',
    body:
      "Your bill isn't '$4/s' — it's 'what does serving ONE request cost, and what does it earn?' Unit economics turn infrastructure from a cost center into an argument you can win: an idle box is infinite cost-per-request; a reserved instance serving steady traffic is the cheapest compute you'll ever own; spot handles the bursts. Real FinOps teams publish cost-per-request per service and let the numbers shame the waste.",
  },
  {
    id: 'reserved-capacity',
    title: 'Commitment is a discount',
    tag: 'reserved capacity',
    body:
      "You just pre-paid for capacity you're confident you'll use — and the cloud rewarded the commitment with a lower rate. That's the whole reserved-instance trade: predictability for price. The portfolio real teams run: RESERVED for the steady floor you're sure of, ON-DEMAND for the wiggle, SPOT for the bursty and interruptible. Getting the floor estimate right is capacity planning; getting it wrong is paying list price for regret.",
  },
  {
    id: 'tech-debt',
    title: 'The loan you took without noticing',
    tag: 'tech debt',
    body:
      "Every fast ship borrowed a little against the future, and the balance is now big enough to feel: deploys fail more, provisioning drags, and eventually everything runs a little worse. Tech debt isn't a moral failing — it's leverage, and leverage has interest. The payments are refactor sprints: they produce zero features and buy back your velocity. Teams that never pay ship slower every quarter and call it 'growing pains'.",
  },
  {
    id: 'staging-catch',
    title: 'Prod is not the test environment',
    tag: 'multi-env pipeline',
    body:
      "A bad build just died in staging — quietly, for free, before any user saw it. That's the entire argument for a promotion pipeline: dev proves it compiles, staging proves it survives contact with realistic traffic, prod proves nothing because by then it's too late to be a test. The canary is still your backstop for what staging misses (data-shape surprises, real-traffic weirdness) — layers, not either/or.",
  },
  {
    id: 'bot-flood',
    title: 'Traffic that pays nothing',
    tag: 'abuse',
    body:
      "Requests are up and revenue isn't — you're being scraped. Bots consume real capacity and pay $0, so 'serve everything' is the wrong instinct: every bot served at peak is a paying user dropped. The answer is the same door that sheds overload: rate limiting at the gateway fails the flood cheaply while humans sail through. Distinguishing the two (and deciding how aggressively to shed) is a real product decision at every big platform.",
  },
];

export const lessonById = new Map(LESSONS.map((l) => [l.id, l]));

// --------------------------- per-node field manual --------------------------
// Real-world context for every piece of the catalog, shown in the Inspector.

export const NODE_LEARN: Record<Exclude<NodeKind, 'zone'>, string> = {
  users:
    'The internet: browsers, apps, other services. Demand follows growth and reputation — real traffic curves are exactly this unforgiving.',
  nginx:
    'A web server and reverse proxy that fronts a third of the web. It serves static files straight off disk and proxies dynamic requests upstream — the classic front door.',
  lb:
    'Spreads requests across identical backends so you can scale horizontally. Managed balancers (AWS ELB/ALB) health-check their targets and route to the least loaded — if one box dies, traffic flows around it.',
  haproxy:
    'The classic software load balancer: legendary raw throughput on a single box for almost nothing. The trade against a managed LB is operational — you run it, you patch it, and stock round-robin doesn\'t know which backend is drowning.',
  apigw:
    'A managed front door: authentication, routing and rate limiting per client. Its superpower is failing cheap — a fast 429 is kinder than a slow timeout, for you and the caller.',
  ingress:
    'Per-product traffic routing — the Kubernetes Ingress / GeoDNS pattern. Binding a product here carves its traffic out of the shared firehose so it runs on a stack of its own: isolated blast radius, workload-shaped scaling, independent deploys. This is how monoliths become platforms.',
  cdn:
    'A network of edge servers near users (Cloudflare runs in 300+ cities; CloudFront is the AWS equivalent). Static content is served from the closest one — a physics-level latency win no origin tuning can match.',
  fastly:
    'An edge network built for programmability: config deploys and cache purges land in seconds, so teams cache things others don\'t dare to — API responses, personalized pages. You pay per request for the privilege; heavy hitters negotiate.',
  varnish:
    'The self-hosted HTTP accelerator (it powered Wikipedia for years). Sits in front of your origin and absorbs repeated requests with zero per-request fees — but it lives in your rack, so distant users still pay the round trip a real edge network erases.',
  s3:
    'Object storage: effectively infinite capacity, eleven nines of durability, priced per request. The standard home for images, video and backups — usually with a CDN in front.',
  app:
    'Your code in a container on a box — an EC2 instance, in AWS terms. Kept stateless on purpose so you can run N identical copies; the state lives in the database, cache and queue, which is exactly what those ports are.',
  spot:
    'Spare cloud capacity sold at a steep discount — with the catch that the provider takes it back (with two minutes\' notice) whenever a full-price customer wants it. Real fleets run spot for stateless workloads with N+1 headroom and let the orchestrator absorb the churn.',
  lambda:
    'Functions-as-a-service: zero idle cost, self-scaling, pay per invocation. Ideal for spiky or rare workloads; at sustained volume, dedicated servers become cheaper. Beware cold starts.',
  redis:
    'An in-memory store answering in microseconds, with real data structures (sorted sets, streams, pub/sub). As a cache it absorbs the read traffic that would otherwise crush your database — the highest-leverage box in this catalog.',
  memcached:
    'The original web cache: a flat key-value store in RAM, multithreaded and brutally simple. Cheaper per request than Redis, but no data structures means more logic your cache can\'t express — which in practice means more misses.',
  postgres:
    'The system of record. Stateful and durable, therefore the hardest thing to scale — writes must be ordered and safely on disk. Shield it: cache the reads, replicate for fan-out, queue the bursts. The balanced default most teams should start with.',
  mysql:
    'The database that powered the early web (Facebook, YouTube and Wikipedia grew up on it). Fast, cheap, everywhere — the general trade against Postgres is weaker behavior under heavy concurrent writes and fewer advanced features.',
  mssql:
    'Microsoft\'s enterprise engine: an excellent optimizer and first-class tooling, priced by the core. The classic build-vs-buy trade — raw engine strength you pay for in licensing, forever, whether you use it or not.',
  mongo:
    'The document database: schema-on-read, JSON all the way down, writes spread easily. The trade for that flexibility is weaker relational guarantees — joins, transactions and strict consistency are where SQL engines still win.',
  elastic:
    'A search and analytics index, not a system of record. It answers full-text and aggregation queries a SQL database would grind on — at the price of eventual consistency, real RAM appetite, and needing a real database behind it for writes.',
  replica:
    "A read-only copy kept in sync from the primary's write-ahead log (WAL). Spreads reads across machines; writes still funnel to one place — the price of consistency.",
  shardrouter:
    'Vitess/Citus-style query routing: data is partitioned by key across multiple primaries, and this box sends each read/write to the shard that owns it. The only pattern that scales WRITES horizontally — at the price of cross-shard joins, hot-shard rebalancing, and resharding pain. You adopt sharding when you must, not when you can.',
  queue:
    'Kafka is a durable log decoupling producers from consumers: write at spike speed, read at your own pace, replay history. Built for firehose volume — the trade is operational weight; below serious scale, a simpler broker does the job for less.',
  rabbitmq:
    'The classic message broker: routing, priorities, per-message acks — simple to run and snappy at modest volume. The general trade against Kafka is buffer depth: when the backlog becomes a firehose, the durable log wins.',
  sqs:
    'The managed-queue trade taken to its end: nothing to operate, a practically bottomless buffer, and a bill that scales exactly with usage. Polling adds latency and per-message fees add up at volume — classic build-vs-buy.',
  worker:
    'Pulls jobs off the queue and grinds: emails, exports, ML batches. Workers pull rather than receive, so they never overload — add more to drain the backlog faster.',
  prometheus:
    "The de-facto standard metrics system: scrapes numbers from everything and answers 'what changed?'. Observability isn't optional — you cannot fix what you cannot see.",
  datadog:
    'Observability as a product: metrics, traces and logs correlated out of the box, no servers to run. Teams consistently learn more per request than with self-hosted tooling — then the invoice arrives. The build-vs-buy trade, in dashboard form.',
  grafana:
    'Dashboards over your metrics. The distance between data and insight is a good graph — every real ops room has a wall of these.',
  autoscaler:
    'A control loop: watch a metric, compare to target, add or remove capacity, cool down, repeat. Kubernetes HPA and EC2 Auto Scaling Groups in the flesh.',
  k8s:
    'The orchestrator: bin-packs containers onto machines, restarts whatever dies, reschedules around failures. You declare the desired state; it makes reality match.',
  cicd:
    'Automated build–test–deploy. Elite teams ship in minutes, not quarters — DORA research keeps finding that deploy speed predicts everything else.',
  stripe:
    'Billing as an API: metering, invoices, retries on failed cards. Undifferentiated heavy lifting you buy rather than build — so revenue collects itself.',
};

// ------------------------------- glossary ----------------------------------

export const GLOSSARY: { term: string; def: string }[] = [
  { term: 'Throughput (RPS)', def: 'Requests served per second. The top line of any platform.' },
  { term: 'p95 latency', def: '95% of requests finish faster than this. Percentiles expose the pain averages hide.' },
  { term: 'SLO / SLA', def: 'Objective you aim for / agreement you pay out on. Both counted in nines: 99.9% = 43 min down per month.' },
  { term: 'Saturation', def: 'Demand ≥ capacity. Queues grow, latency spikes, then requests drop.' },
  { term: 'Backpressure', def: 'Slowing or buffering intake when downstream is full — queues instead of crashes.' },
  { term: 'Cache hit ratio', def: 'Share of reads answered by the cache. Every hit is a database query that never happened.' },
  { term: 'Horizontal vs vertical', def: 'More boxes vs bigger boxes. Horizontal has no ceiling and no single point of failure.' },
  { term: 'Load shedding', def: 'Rejecting excess work fast (429) instead of failing it slowly (timeout).' },
  { term: 'Cold start', def: 'Latency paid while serverless capacity warms from zero after a traffic jump.' },
  { term: 'N+1 redundancy', def: 'One more instance than needed, so any single failure is boring.' },
  { term: 'Congestion collapse', def: 'Overload so deep everything times out and throughput hits zero. Shed load before this.' },
  { term: 'Control loop', def: 'Measure → compare to target → act → cool down. Autoscalers and orchestrators are just this.' },
  { term: 'Replication lag', def: 'How far a replica trails its primary. Lagging replicas serve the past.' },
  { term: 'Connection pool', def: 'Reused DB connections shared by many clients. Without one, app instances strangle the primary with hellos.' },
  { term: 'Cache warm-up', def: 'A restarted cache is empty; hit rate climbs as traffic refills it. Misses meanwhile hammer the origin.' },
  { term: 'Retry storm', def: 'Timeouts breed retries, raising load exactly when capacity fell. Fail fast to break the loop.' },
];
