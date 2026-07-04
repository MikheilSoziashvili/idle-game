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

/** Typed ports. Edges only connect matching types. */
export type PortType = 'http' | 'data' | 'jobs' | 'repl' | 'control';

export type NodeKind =
  | 'users'
  | 'nginx'
  | 'lb'
  | 'apigw'
  | 'cdn'
  | 's3'
  | 'app'
  | 'lambda'
  | 'redis'
  | 'postgres'
  | 'replica'
  | 'queue'
  | 'worker'
  | 'prometheus'
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
  zoneUnit?: boolean; // usable as a zone template
  research?: string; // research id gate
  revGate?: number; // lifetime revenue gate for the palette
  singleton?: boolean; // only one may exist (stripe, cicd, k8s, grafana)
  special?:
    | 'source'
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
  bootUntil?: number; // simTime when provisioning finishes
  disabled?: boolean;
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
export type Tool = 'move' | 'wire' | 'zone' | 'region' | 'stamp' | 'upgrade' | 'bulldoze';

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
}

export interface EdgeLive {
  rps: number;
  util: number; // saturation of the downstream target
}

export interface Gauges {
  offered: number;
  served: number;
  dropped: number;
  shed: number;
  p95: number;
  revenuePerSec: number;
  costPerSec: number;
  profitPerSec: number;
  uptime: number; // 0..100
  rpPerSec: number;
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
