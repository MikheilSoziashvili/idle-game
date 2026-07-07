// Core shared types for the UPTIME engine, catalog, state and UI.

/** Request classes flowing through the graph. Index order matters everywhere. */
export const CLASSES = ['static', 'api', 'read', 'write', 'job'] as const;
export type RequestClass = (typeof CLASSES)[number];
export const CLASS_LABEL: Record<RequestClass, string> = {
  static: 'static',
  api: 'API',
  read: 'read',
  write: 'write',
  job: 'job',
};

/** Fixed accent per request class — class-mix strips, edge labels, legends. */
export const CLASS_COLORS: Record<RequestClass, string> = {
  static: '#58a6ff',
  api: '#f0a44b',
  read: '#a78bfa',
  write: '#e5534b',
  job: '#34d1bf',
};

/**
 * Typed ports. Edges only connect matching types. Three traffic flavors plus
 * control — deliberately small: web (http) carries requests between front-line
 * boxes, storage (data) carries reads/writes/replication, jobs carries async
 * work. ('repl' was merged into data; old saves are migrated on load.)
 */
export type PortType = 'http' | 'data' | 'jobs' | 'control';

/** Plain-English names for port types, used everywhere the player reads them. */
export const PORT_WORD: Record<PortType, string> = {
  http: 'web',
  data: 'storage',
  jobs: 'jobs',
  control: 'control',
};

export type NodeKind =
  | 'users'
  | 'ingress'
  | 'nginx'
  | 'lb'
  | 'haproxy'
  | 'apigw'
  | 'shardrouter'
  | 'cdn'
  | 'fastly'
  | 'varnish'
  | 's3'
  | 'app'
  | 'spot'
  | 'lambda'
  | 'redis'
  | 'memcached'
  | 'postgres'
  | 'mysql'
  | 'mssql'
  | 'mongo'
  | 'elastic'
  | 'replica'
  | 'queue'
  | 'rabbitmq'
  | 'sqs'
  | 'worker'
  | 'prometheus'
  | 'datadog'
  | 'grafana'
  | 'autoscaler'
  | 'k8s'
  | 'cicd'
  | 'stripe'
  | 'zone';

export type Category =
  | 'ingress'
  | 'compute'
  | 'data'
  | 'cache'
  | 'async'
  | 'observability'
  | 'automation';

export interface PortDef {
  id: string; // handle id, unique within node, e.g. 'http-in'
  type: PortType;
  dir: 'in' | 'out';
  label: string;
}

export interface NodeSpec {
  kind: Exclude<NodeKind, 'zone'>;
  name: string;
  short: string; // 2-3 letter monogram on the node card
  category: Category;
  blurb: string; // dry one-liner for palette/inspector
  docsUrl: string; // official real-world documentation for this technology
  cost: number;
  opCost: number; // $/s at level 1
  capacity: number; // req/s at level 1 (weighted units)
  baseLatencyMs: number;
  queueLen: number; // buffered requests before overflow drops
  ports: PortDef[];
  serves: RequestClass[]; // classes this node terminates
  forwards: Partial<Record<RequestClass, PortType>>; // class -> out port type
  capWeight?: Partial<Record<RequestClass, number>>; // e.g. postgres writes cost 3x
  hitRate?: Partial<Record<RequestClass, number>>; // cache-like partial serve fraction
  perServeCost?: number; // $ per served request (S3, Lambda)
  smartSplit?: boolean; // split output by target headroom (LB); mesh grants globally
  rpWeight?: number; // metrics nodes: RP contribution multiplier (default 1)
  zoneUnit?: boolean; // usable as a zone template
  research?: string; // research id gate
  revGate?: number; // lifetime revenue gate for the palette
  singleton?: boolean; // only one may exist (stripe, cicd, k8s, grafana)
  special?:
    | 'source'
    | 'ingress'
    | 'shard'
    | 'lb'
    | 'queue'
    | 'lambda'
    | 'apigw'
    | 'metrics'
    | 'grafana'
    | 'billing'
    | 'autoscaler'
    | 'k8s'
    | 'cicd';
}

export interface ZoneState {
  template: Exclude<NodeKind, 'zone'>;
  name: string;
  w: number;
  h: number;
  min: number;
  max: number;
  instances: number; // provisioned (some may still be booting)
  targetUtil: number; // 0..1 autoscale target
  auto: boolean; // requires an attached autoscaler control edge
  bootQueue: number[]; // simTime stamps when each pending instance becomes ready
}

export interface PlacedNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  level: number; // 1..maxLevel
  spent: number; // total cash sunk (for refunds)
  label?: string; // player-given name; ops console + card use it
  bootUntil?: number; // simTime when provisioning finishes
  disabled?: boolean;
  tier?: number; // product ingress: which launched tier's traffic it carries
  zone?: ZoneState;
}

export interface PlacedEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface RegionPolicies {
  aggressiveScale: boolean; // faster autoscaling, +10% opCost in region
  cacheTtl: boolean; // +8% cache hit, small staleness incident risk
  rateLimit: boolean; // shed overload gracefully instead of hard-dropping
  redundancy: boolean; // +25% opCost, outages degrade instead of kill
}

export interface RegionRect {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hue: number; // 0-360 accent hue
  policies: RegionPolicies;
}

export type Overlay = 'none' | 'load' | 'latency' | 'cost' | 'errors' | 'cache';
export type Tool = 'move' | 'select' | 'wire' | 'zone' | 'region' | 'stamp' | 'upgrade' | 'bulldoze';

export interface NodeLive {
  util: number; // 0..1+ smoothed
  inRps: number;
  served: number;
  drops: number; // drops/s
  latencyMs: number; // effective latency incl. queue wait
  queue: number; // backlog count
  health: number; // 0..1
  instances: number; // ready instances (zones)
  booting: number; // instances still provisioning
  costRate: number; // $/s
  hitPct: number; // cache hit share of reads, -1 if n/a
  rpRate: number; // research points/s (observability nodes)
  hint: string | null; // misconfiguration hint
  // realism layer — what this box is doing and how its dependencies feel it
  role: string; // live plain-English activity line ('' when idle)
  spark: number[]; // served-rps history, 1 Hz, newest last (shared ref, engine-owned)
  warm01: number; // cache warm-up 0..1, -1 if not a cache
  conns: number; // upstream client connections (databases), 0 if n/a
  connLimit: number; // tolerated connections before pool pressure, 0 if n/a
  replLagSec: number; // replication lag, -1 if not a replica
  classIn: number[]; // per-class in-rates [static, api, read, write, job]
  portIn: Partial<Record<PortType, number>>; // rps arriving per in-port type
  portOut: Partial<Record<PortType, number>>; // rps leaving per out-port type
}

export interface EdgeLive {
  rps: number;
  util: number; // saturation of the downstream target
  classRates: number[]; // per-class rps on this wire [static, api, read, write, job]
  breaker: 0 | 1 | 2; // circuit breaker: 0 closed, 1 OPEN (failing fast), 2 half-open (probing)
}

export interface Gauges {
  offered: number;
  served: number;
  dropped: number;
  shed: number;
  p95: number;
  p99: number; // the tail: where your angriest (biggest) users live
  revenuePerSec: number;
  costPerSec: number;
  profitPerSec: number;
  uptime: number; // 0..100
  rpPerSec: number;
}

/** Service-level objective state: the error budget is THE reliability currency. */
export interface SloLive {
  target: number; // e.g. 0.999 — success ratio promised this funding round
  budget01: number; // remaining error budget over the rolling window, 0..1
  burn: number; // current burn rate (1 = burning exactly the sustainable rate)
  frozen: boolean; // budget exhausted → release freeze
  windowSec: number;
}

export type LogSev = 'info' | 'ok' | 'warn' | 'err' | 'deploy' | 'scale';
export interface LogEntry {
  id: number;
  t: number; // sim time
  sev: LogSev;
  msg: string;
}

export interface ActiveEvent {
  id: number;
  kind: 'spike' | 'db_slow' | 'outage' | 'dep_failure' | 'bad_deploy';
  label: string;
  startsAt: number;
  endsAt: number;
  warned: boolean;
  started: boolean;
  regionId?: string;
  mult?: number;
}

export interface BlueprintNode {
  kind: NodeKind;
  dx: number;
  dy: number;
  level: number;
  zone?: Pick<ZoneState, 'template' | 'name' | 'w' | 'h' | 'min' | 'max' | 'targetUtil'>;
}
export interface BlueprintEdge {
  si: number; // index into nodes
  sh: string;
  ti: number;
  th: string;
}
export interface Blueprint {
  id: string;
  name: string;
  builtin?: boolean;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

export interface TierDef {
  id: number; // 1-6
  key: string;
  name: string;
  blurb: string;
  baseRps: number; // demand contribution per company-scale unit
  mix: number[]; // fractions per CLASSES index, sums to 1
  value: number[]; // $ per served request per class
  cost: number; // launch cost
  rpCost?: number;
  research?: string; // research gate
  roundGate?: number; // funding round index gate
  latencySensitive?: boolean;
}

export interface ResearchDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number; // research points
  deps: string[];
  grants: string[]; // human-readable effect lines
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export interface MilestoneDef {
  id: string;
  title: string;
  desc: string;
  hint: string;
  rewardCash?: number;
  rewardRp?: number;
  unlocks?: string; // human-readable unlock line
}

export type PerkId = 'throughput' | 'revenue' | 'efficiency' | 'momentum';

// ---------------------------------------------------------------------------
// Live-ops layer: contracts, drills, postmortems, mandates, history, rival.
// ---------------------------------------------------------------------------

export type ContractMetric = 'p95' | 'uptime' | 'dropped' | 'cost' | 'served' | 'profit';

/** A rolled SLA offer / active commitment. Evaluated like case objectives. */
export interface ContractInstance {
  id: string;
  key: string; // template key
  label: string;
  client: string;
  metric: ContractMetric;
  op: '<' | '>';
  value: number;
  holdSec: number; // must hold continuously
  deadlineAt: number; // simTime by which it must complete (once accepted)
  offerExpiresAt: number; // simTime the offer leaves the board
  rewardCash: number;
  rewardRp: number;
  repBonus: number;
  repPenalty: number; // on failure
  held: number; // live progress (active contract only)
}

/** Post-incident report card. */
export interface Postmortem {
  id: number;
  at: number; // simTime the incident ended
  kind: ActiveEvent['kind'];
  title: string;
  durSec: number;
  dropped: number; // requests lost during the window
  repLost: number;
  mitigations: string[]; // what softened it (already built)
  gaps: string[]; // what would have helped (not built)
  takeaway: string;
}

export interface HistoryEntry {
  at: number; // Date.now()
  icon: string;
  label: string;
}

export type MandateId = 'blitzscale' | 'ironclad' | 'shoestring';

export interface MandateDef {
  id: MandateId;
  name: string;
  desc: string; // effects, human-readable
  spBonus: number; // extra SP multiplier at the NEXT raise (0.4 = +40%)
}

export type RunConstraint = 'none' | 'serverless' | 'nocache' | 'frugal';

export interface RivalState {
  name: string;
  rps: number;
}

export interface DrillState {
  streak: number;
  lastDay: string; // YYYY-MM-DD (real time)
  activeUntil: number; // simTime; 0 = not running
}

/** Aggregate modifiers recomputed each tick from research/perks/singleton nodes. */
export interface GlobalMods {
  capacityMult: number;
  revenueMult: number;
  costMult: number;
  rpMult: number;
  bootTime: number;
  upgradeDiscount: number;
  smartSplitAll: boolean;
  latencyMult: number;
  demandMult: number;
  hasCicd: boolean;
  hasK8s: boolean;
  hasStripe: boolean;
  hasGrafana: boolean;
}
