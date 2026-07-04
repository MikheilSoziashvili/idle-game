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
];
