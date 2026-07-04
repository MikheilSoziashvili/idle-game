import type { NodeKind, ZoneState } from '../engine/types';

// ---------------------------------------------------------------------------
// Case studies: consulting-style scenarios for developers. Each drops you into
// a real architecture problem — AWS-flavored — with a fixed budget, scripted
// traffic and incidents, and SLOs to hold. Your campaign is snapshotted on
// entry and restored on exit; passing pays Research Points into the campaign.
// ---------------------------------------------------------------------------

export interface CaseObjectiveDef {
  id: string;
  label: string;
  metric: 'p95' | 'uptime' | 'dropped' | 'profit' | 'cost' | 'served' | 'dbmax';
  op: '<' | '>';
  value: number;
  holdSec: number; // must hold continuously this long
}

export interface CaseEventDef {
  at: number; // sim-seconds after case start
  kind: 'spike' | 'db_slow' | 'outage' | 'dep_failure';
  mult?: number;
  durSec?: number;
  label?: string;
}

export interface CaseNodeDef {
  kind: NodeKind;
  x: number;
  y: number;
  level?: number;
  zone?: Pick<ZoneState, 'template' | 'name' | 'w' | 'h' | 'min' | 'max' | 'instances' | 'targetUtil'>;
}

export interface CaseDef {
  id: string;
  title: string;
  client: string;
  brief: string;
  teach: string;
  aws: string; // the real-world stack being modeled
  cash: number;
  rp?: number;
  research: string[];
  tiers: number[];
  baseRps: number;
  nodes: CaseNodeDef[];
  edges: { si: number; sh: string; ti: number; th: string }[];
  events: CaseEventDef[];
  objectives: CaseObjectiveDef[];
  timeLimitSec: number;
  failCashBelow?: number;
  debrief: string;
  rewardRp: number;
}

export const CASES: CaseDef[] = [
  {
    id: 'case-edge',
    title: 'Static site, global audience',
    client: 'devdocs.io — documentation',
    brief:
      'Their docs pull 300 rps of pure static traffic from three continents into one overworked origin box. Readers in Sydney wait seconds; the origin melts daily. Budget covers a CDN and object storage — spend it well.',
    teach: 'Edge caching: the fastest request is one your origin never sees.',
    aws: 'CloudFront + S3',
    cash: 900,
    research: ['cdn'],
    tiers: [1],
    baseRps: 300,
    nodes: [
      { kind: 'users', x: 60, y: 240 },
      { kind: 'nginx', x: 380, y: 240, level: 3 },
    ],
    edges: [{ si: 0, sh: 'http-out', ti: 1, th: 'http-in' }],
    events: [{ at: 150, kind: 'spike', mult: 1.6, durSec: 45, label: 'docs linked from a conference keynote' }],
    objectives: [
      { id: 'lat', label: 'p95 under 80ms', metric: 'p95', op: '<', value: 80, holdSec: 60 },
      { id: 'drops', label: 'Fewer than 1 drop/s', metric: 'dropped', op: '<', value: 1, holdSec: 60 },
      { id: 'cost', label: 'Run cost under $1/s', metric: 'cost', op: '<', value: 1, holdSec: 60 },
    ],
    timeLimitSec: 300,
    debrief:
      'This is the canonical CloudFront + S3 pattern: put the CDN in front, let 90%+ of requests terminate at the edge, and the origin only ever sees cache misses. In real life the wins compound — S3 egress through CloudFront is cheaper than raw egress, and edge hits land in ~20ms instead of a trans-Pacific round trip. The metric that matters is cache-hit ratio; everything else follows it.',
    rewardRp: 25,
  },
  {
    id: 'case-blackfriday',
    title: 'Black Friday',
    client: 'cartel.shop — e-commerce',
    brief:
      "Marketing bought a prime-time ad without telling anyone. Traffic will spike to ~3.5× for two minutes — twice. You have an autoscaler that nobody wired up, a warm cache budget, and not much time. Drops during the window are lost carts.",
    teach: 'Capacity planning: headroom + autoscaling beat guessing.',
    aws: 'EC2 Auto Scaling Groups + ElastiCache',
    cash: 2500,
    research: ['containers', 'autoscaling', 'caching'],
    tiers: [1, 2, 3],
    baseRps: 60,
    nodes: [
      { kind: 'users', x: 60, y: 250 },
      { kind: 'lb', x: 330, y: 250 },
      {
        kind: 'zone',
        x: 590,
        y: 160,
        zone: { template: 'app', name: 'checkout-asg', w: 280, h: 190, min: 2, max: 14, instances: 2, targetUtil: 0.6 },
      },
      { kind: 'redis', x: 950, y: 170 },
      { kind: 'postgres', x: 1190, y: 170, level: 2 },
      { kind: 'autoscaler', x: 590, y: 430 },
    ],
    edges: [
      { si: 0, sh: 'http-out', ti: 1, th: 'http-in' },
      { si: 1, sh: 'http-out', ti: 2, th: 'http-in' },
      { si: 2, sh: 'data-out', ti: 3, th: 'data-in' },
      { si: 3, sh: 'data-out', ti: 4, th: 'data-in' },
    ],
    events: [
      { at: 60, kind: 'spike', mult: 3.5, durSec: 120, label: 'the ad airs' },
      { at: 265, kind: 'spike', mult: 3.5, durSec: 120, label: 'the replay airs' },
    ],
    objectives: [
      { id: 'scale', label: 'Serve 150+ rps (ride a spike)', metric: 'served', op: '>', value: 150, holdSec: 45 },
      { id: 'uptime', label: 'Uptime above 98.5%', metric: 'uptime', op: '>', value: 98.5, holdSec: 260 },
      { id: 'profit', label: 'Profitable ($5+/s)', metric: 'profit', op: '>', value: 5, holdSec: 60 },
    ],
    timeLimitSec: 480,
    failCashBelow: -200,
    debrief:
      "Real Black Fridays are won in October: teams pre-warm capacity, wire target-tracking Auto Scaling policies, and run game days against synthetic spikes. Notice what the autoscaler needed — cooldowns to avoid flapping, a max to cap the bill, and boot time short enough to matter inside a two-minute window. That last one is why fast deploys (and Lambda) exist. Also notice the cache: every read Redis absorbed was capacity you didn't have to buy.",
    rewardRp: 35,
  },
  {
    id: 'case-dbfire',
    title: 'The database is on fire',
    client: 'ledgerly — fintech SaaS',
    brief:
      'Every read and every write hits one RDS primary, and it is pegged — latency in the seconds, timeouts climbing. Reads outnumber writes two-to-one. You have budget for a cache tier and a read replica; the writes must keep flowing to the primary.',
    teach: 'Protect the primary: cache-aside reads, replica fan-out.',
    aws: 'RDS + ElastiCache + read replicas',
    cash: 1400,
    research: ['caching', 'replicas'],
    tiers: [3],
    baseRps: 70,
    nodes: [
      { kind: 'users', x: 60, y: 250 },
      { kind: 'lb', x: 320, y: 250 },
      {
        kind: 'zone',
        x: 580,
        y: 165,
        zone: { template: 'app', name: 'api-pool', w: 270, h: 180, min: 2, max: 8, instances: 3, targetUtil: 0.65 },
      },
      { kind: 'postgres', x: 940, y: 245, level: 1 },
    ],
    edges: [
      { si: 0, sh: 'http-out', ti: 1, th: 'http-in' },
      { si: 1, sh: 'http-out', ti: 2, th: 'http-in' },
      { si: 2, sh: 'data-out', ti: 3, th: 'data-in' },
    ],
    events: [{ at: 200, kind: 'db_slow', durSec: 40 }],
    objectives: [
      { id: 'db', label: 'Primary below 70% util', metric: 'dbmax', op: '<', value: 0.7, holdSec: 60 },
      { id: 'lat', label: 'p95 under 150ms', metric: 'p95', op: '<', value: 150, holdSec: 60 },
      { id: 'drops', label: 'Fewer than 0.5 drops/s', metric: 'dropped', op: '<', value: 0.5, holdSec: 90 },
    ],
    timeLimitSec: 360,
    debrief:
      "The fix is always the same shape: reads go to a cache first (ElastiCache answered 80% of them), replicas absorb the read misses, and only writes touch the primary — which suddenly has 3–5× the headroom without a bigger instance. Note the slow-query storm mid-case: a protected primary shrugs it off; a pegged one turns it into an outage. In production you'd add connection pooling (PgBouncer/RDS Proxy) before any of this — connections are the first thing to run out.",
    rewardRp: 30,
  },
  {
    id: 'case-rightsize',
    title: 'Right-size the fleet',
    client: 'burnco — series B startup',
    brief:
      'The previous platform team bought fourteen app servers "to be safe." Utilization: nine percent. The CFO wants the infra bill cut hard — without dropping a single request, and there is a rumor of a press mention later today.',
    teach: 'FinOps: the cheapest server is the one that turns itself off.',
    aws: 'EC2 right-sizing + Auto Scaling',
    cash: 600,
    research: ['containers', 'autoscaling', 'orchestration'],
    tiers: [1, 2],
    baseRps: 45,
    nodes: [
      { kind: 'users', x: 60, y: 250 },
      { kind: 'lb', x: 330, y: 250 },
      {
        kind: 'zone',
        x: 590,
        y: 140,
        zone: { template: 'app', name: 'overprovisioned-asg', w: 300, h: 230, min: 1, max: 20, instances: 14, targetUtil: 0.65 },
      },
    ],
    edges: [
      { si: 0, sh: 'http-out', ti: 1, th: 'http-in' },
      { si: 1, sh: 'http-out', ti: 2, th: 'http-in' },
    ],
    events: [{ at: 210, kind: 'spike', mult: 1.9, durSec: 50, label: 'the press mention' }],
    objectives: [
      { id: 'cost', label: 'Run cost under $1.00/s', metric: 'cost', op: '<', value: 1.0, holdSec: 90 },
      { id: 'uptime', label: 'Uptime above 99.9%', metric: 'uptime', op: '>', value: 99.9, holdSec: 90 },
      { id: 'profit', label: 'Profit above $2.5/s', metric: 'profit', op: '>', value: 2.5, holdSec: 60 },
    ],
    timeLimitSec: 360,
    failCashBelow: -100,
    debrief:
      'Scale-in is the forgotten half of autoscaling. Real fleets run at 40–70% target utilization: below that you are donating money to your cloud provider, above it you have no headroom for the press mention. The safe way to cut fourteen servers is not deleting thirteen — it is wiring the autoscaler, setting min low and target sane, and letting the control loop walk the fleet down while it watches the real load. Kubernetes bin-packing buys another ~20% on top.',
    rewardRp: 30,
  },
  {
    id: 'case-serverless',
    title: 'Spiky by design',
    client: 'thumbnailr — image API',
    brief:
      'Two requests per second all day — then a customer batch-uploads and it is eighty, for thirty seconds, several times an hour. A fleet sized for the bursts idles at 97%. A fleet sized for the average dies hourly. There is a third option.',
    teach: 'Serverless economics: pay per request, absorb the bursts.',
    aws: 'Lambda + API Gateway',
    cash: 700,
    research: ['gateway', 'serverless'],
    tiers: [2],
    baseRps: 6,
    nodes: [
      { kind: 'users', x: 60, y: 250 },
      { kind: 'apigw', x: 330, y: 250 },
      { kind: 'nginx', x: 600, y: 130 },
    ],
    edges: [
      { si: 0, sh: 'http-out', ti: 1, th: 'http-in' },
      { si: 1, sh: 'http-out', ti: 2, th: 'http-in' },
    ],
    events: [
      { at: 80, kind: 'spike', mult: 14, durSec: 30, label: 'batch upload' },
      { at: 180, kind: 'spike', mult: 14, durSec: 30, label: 'batch upload' },
      { at: 280, kind: 'spike', mult: 14, durSec: 30, label: 'batch upload' },
    ],
    objectives: [
      { id: 'drops', label: 'Under 1 drop/s through 3 bursts', metric: 'dropped', op: '<', value: 1, holdSec: 260 },
      { id: 'cost', label: 'Idle cost under $0.35/s', metric: 'cost', op: '<', value: 0.35, holdSec: 120 },
      { id: 'uptime', label: 'Uptime above 99%', metric: 'uptime', op: '>', value: 99, holdSec: 260 },
    ],
    timeLimitSec: 400,
    debrief:
      "The API Gateway sheds what Lambda can't absorb in the first seconds (429s beat timeouts), and Lambda's concurrency chases the burst — you watched the cold-start penalty shrink as it warmed. The economics are the point: per-invocation pricing costs nothing between bursts, where an always-on fleet for 80 rps would burn money 97% of the time. Real teams add provisioned concurrency for the first burst and fall back to EC2 the moment traffic becomes sustained — serverless is a shape, not a religion.",
    rewardRp: 30,
  },
  {
    id: 'case-fournines',
    title: 'Four nines',
    client: 'medvault — healthcare records',
    brief:
      'The enterprise contract promises 99.99% availability, and the audit window starts now. Fate has scheduled an availability-zone failure for the middle of it. Regions, redundancy policies and an orchestrator are on the table — one flat architecture is not going to survive this.',
    teach: 'Everything fails: N+1, blast radius, self-healing.',
    aws: 'Multi-AZ + ALB + EKS self-healing',
    cash: 2200,
    research: ['containers', 'autoscaling', 'orchestration', 'caching', 'mesh', 'multiregion'],
    tiers: [1, 3],
    baseRps: 50,
    nodes: [
      { kind: 'users', x: 60, y: 260 },
      { kind: 'lb', x: 320, y: 260 },
      {
        kind: 'zone',
        x: 580,
        y: 180,
        zone: { template: 'app', name: 'az-a-pool', w: 260, h: 170, min: 2, max: 10, instances: 4, targetUtil: 0.55 },
      },
      { kind: 'redis', x: 920, y: 180 },
      { kind: 'postgres', x: 1160, y: 180, level: 2 },
      { kind: 'k8s', x: 580, y: 440 },
    ],
    edges: [
      { si: 0, sh: 'http-out', ti: 1, th: 'http-in' },
      { si: 1, sh: 'http-out', ti: 2, th: 'http-in' },
      { si: 2, sh: 'data-out', ti: 3, th: 'data-in' },
      { si: 3, sh: 'data-out', ti: 4, th: 'data-in' },
    ],
    events: [{ at: 170, kind: 'outage', durSec: 30, label: 'az-a power event' }],
    objectives: [
      { id: 'nines', label: 'Uptime above 99.99%', metric: 'uptime', op: '>', value: 99.99, holdSec: 100 },
      { id: 'drops', label: 'Under 0.1 drops/s', metric: 'dropped', op: '<', value: 0.1, holdSec: 150 },
      { id: 'lat', label: 'p95 under 200ms', metric: 'p95', op: '<', value: 200, holdSec: 100 },
    ],
    timeLimitSec: 420,
    debrief:
      'Four nines is 4.3 minutes of downtime a month — one bad deploy, gone. Surviving the AZ failure took exactly what it takes in AWS: capacity split across zones (paint regions, apply N+1 redundancy), a second pool so the balancer has somewhere to send traffic, and an orchestrator rescheduling the fallen instances before a human notices. The lesson underneath: you were not paid for preventing the failure — you were paid for making it boring.',
    rewardRp: 40,
  },
];

export const caseById = new Map(CASES.map((c) => [c.id, c]));
