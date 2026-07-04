import { BAL, fmtNum, latencyValueMult, masteryTier, MASTERY_NAMES, pendingSp, levelCapMult, levelOpCostMult } from './balance';
import { computeDemand, computeMods, roundIndex } from './economy';
import { DB_KINDS, specOf } from '../catalog/nodes';
import { resolveCase } from '../catalog/challenge';
import { rollContractOffers } from '../catalog/contracts';
import type {
  ActiveEvent,
  EdgeLive,
  Gauges,
  GlobalMods,
  LogEntry,
  LogSev,
  NodeKind,
  NodeLive,
  PortType,
  Postmortem,
  RegionRect,
} from './types';
import type { GameStats, GameStore, LiveState } from '../state/store';
import { emptyStats } from '../state/store';
import { EventSystem } from '../systems/events';
import { AutoscalerSystem } from '../systems/automation';
import { readyInstances, bootingInstances, zoneHasController } from '../systems/zoning';
import { startAutosave } from '../state/save';

// ============================================================================
// The flow simulation.
//
// Model: every edge is a one-tick pipe. During a tick each node (1) drains the
// flow its in-edges delivered last tick into a per-class backlog, (2) processes
// up to (capacity × dt) weighted requests from that backlog — serving classes
// it terminates, cache-hitting a fraction, forwarding the rest to out-edges of
// the matching port type — and (3) drops whatever overflows its queue or times
// out. Backpressure is therefore emergent: a slow node's backlog grows, its
// queue-wait latency rises (latency = base × (1 + K·util³) + backlog/capacity),
// and past queueLen requests spill on the floor as errors.
// ============================================================================

const NC = 5; // number of request classes: [static, api, read, write, job]
const JOB = 4;
// Async jobs aren't user-facing: they tolerate long queues (that's the point of Kafka).
const CLASS_TIMEOUT_MS = [5000, 5000, 5000, 5000, 600000];

interface SNode {
  id: string;
  kind: string;
  name: string; // display name for logs (player label > zone name > spec name)
  level: number;
  health: number;
  utilSm: number;
  inSm: number;
  servedEma: number; // for lambda ramp
  backlog: number[];
  backlogLat: number[];
  // computed each tick (pass A)
  effCap: number;
  ready: number;
  booting: number;
  offline: boolean;
  shedMode: boolean;
  regionCostMult: number;
  cacheBonus: number;
  wasBooting: boolean;
  lastHintAt: number;
  pendingHint: string | null; // set in pass A, applied when pass B builds the UI
  // per-tick UI outputs
  ui: NodeLive;
}

interface SEdge {
  id: string;
  source: string;
  target: string;
  sPort: PortType;
  tPort: PortType;
  rates: number[];
  lats: number[];
  nRates: number[];
  nLats: number[];
  rpsSm: number;
}

const zeros = () => [0, 0, 0, 0, 0];

function blankUi(): NodeLive {
  return {
    util: 0,
    inRps: 0,
    served: 0,
    drops: 0,
    latencyMs: 0,
    queue: 0,
    health: 1,
    instances: 1,
    booting: 0,
    costRate: 0,
    hitPct: -1,
    rpRate: 0,
    hint: null,
  };
}

// Log ids are React keys. Seed randomly so ids never collide with entries an
// earlier engine instance (pre-HMR, pre-load) already pushed into the store.
let logId = Math.floor(Math.random() * 2 ** 30);

export class Engine {
  private store: typeof import('../state/store').useGame;
  private nodes = new Map<string, SNode>();
  private edges = new Map<string, SEdge>();
  private inEdges = new Map<string, SEdge[]>();
  private outEdges = new Map<string, Map<PortType, SEdge[]>>();
  private regionOf = new Map<string, RegionRect>();
  private builtVersion = -1;

  private events = new EventSystem();
  private autoscaler = new AutoscalerSystem();

  simTime = 0;
  private runEpoch = 0;
  private acc = 0;
  private lastReal = 0;
  private timer: number | null = null;
  private worker: Worker | null = null;

  // gauges (EMAs)
  private offeredEma = 0;
  private servedEma = 0;
  private dropsEma = 0;
  private shedEma = 0;
  private revEma = 0;
  private costEma = 0;
  private uptime01 = 1;
  private p95Samples: { t: number; lat: number; w: number }[] = [];
  private p95 = 0;

  // milestone tracking
  private bottleneckArmed = false;
  private bottleneckPeak = 0;
  private bottleneckArmedAt = 0;
  private readHitEma = 0;

  // field-note (lesson) trigger latches — set in the flow pass, read at 1 Hz.
  // They never reset: each lesson fires once and the store de-dupes.
  private sawCongestion = false;
  private sawColdStart = false;
  private sawQueueBuffer = false;
  private sawDbHot = false;
  private sawCdnHit = false;

  // case-study runtime: which scripted events have been injected this run
  private caseInjected = new Set<string>();

  // live-ops runtime
  private insUntil = 0; // first-failure insurance window
  private drillArmed = false;
  private drillOffered = 0;
  private drillDropped = 0;
  private dropPath: string[] = []; // edge ids upstream of dropping nodes (1 Hz)
  private pmWatch = new Map<number, { kind: ActiveEvent['kind']; label: string; t0: number; drop0: number; rep0: number }>();
  private pmCounter = 1;
  private masteryKnown = new Map<string, number>();
  private lastPeakMark = 0;

  private stats!: GameStore['stats'];
  private lastPushedStats: GameStore['stats'] | null = null;
  private tickLogs: LogEntry[] = [];
  private secAcc = 0;

  constructor(store: typeof import('../state/store').useGame) {
    this.store = store;
    this.adoptStats(store.getState().stats);
    this.simTime = store.getState().simTime;
    this.runEpoch = store.getState().runEpoch;
  }

  /** Copy store stats, backfilling fields older saves don't have. */
  private adoptStats(s: GameStats) {
    this.stats = { ...emptyStats(), ...s, servedByKind: { ...(s.servedByKind ?? {}) } };
    this.lastPeakMark = this.stats.peakServed;
    this.masteryKnown.clear();
  }

  start() {
    if (this.timer !== null || this.worker !== null) return;
    this.lastReal = performance.now();
    // Drive ticks from a Web Worker: worker timers are exempt from the
    // browser's intensive throttling of hidden tabs, so the sim keeps running
    // (at real pace) while the player is on another tab. Fallback: setInterval.
    try {
      const src = 'setInterval(() => postMessage(0), 50)';
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.pump();
    } catch {
      this.timer = window.setInterval(() => this.pump(), 50);
    }
    startAutosave();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private pump() {
    const now = performance.now();
    let dtReal = (now - this.lastReal) / 1000;
    this.lastReal = now;
    dtReal = Math.min(dtReal, BAL.maxCatchupSec);
    const speed = this.store.getState().speed;
    if (speed === 0) return;
    this.acc += dtReal * speed;
    const step = 1 / BAL.tickHz;
    let ticks = 0;
    while (this.acc >= step && ticks < BAL.tickHz * BAL.maxCatchupSec) {
      this.acc -= step;
      this.tick(step);
      ticks++;
    }
  }

  log(sev: LogSev, msg: string) {
    this.tickLogs.push({ id: logId++, t: this.simTime, sev, msg });
  }

  // ------------------------------------------------------------------ build --
  private rebuild(st: GameStore) {
    const oldNodes = this.nodes;
    this.nodes = new Map();
    for (const n of st.nodes) {
      const prev = oldNodes.get(n.id);
      const sn: SNode = prev ?? {
        id: n.id,
        kind: n.kind,
        name: n.id,
        level: n.level,
        health: 1,
        utilSm: 0,
        inSm: 0,
        servedEma: 0,
        backlog: zeros(),
        backlogLat: zeros(),
        effCap: 0,
        ready: 1,
        booting: 0,
        offline: false,
        shedMode: false,
        regionCostMult: 1,
        cacheBonus: 0,
        wasBooting: false,
        lastHintAt: -999,
        pendingHint: null,
        ui: blankUi(),
      };
      sn.kind = n.kind;
      sn.level = n.level;
      this.nodes.set(n.id, sn);
    }
    this.edges = new Map(
      st.edges.map((e) => {
        const prev = this.edges.get(e.id);
        return [
          e.id,
          prev ?? {
            id: e.id,
            source: e.source,
            target: e.target,
            sPort: portType(e.sourceHandle),
            tPort: portType(e.targetHandle),
            rates: zeros(),
            lats: zeros(),
            nRates: zeros(),
            nLats: zeros(),
            rpsSm: 0,
          },
        ];
      }),
    );
    this.inEdges = new Map();
    this.outEdges = new Map();
    for (const e of this.edges.values()) {
      if (!this.inEdges.has(e.target)) this.inEdges.set(e.target, []);
      this.inEdges.get(e.target)!.push(e);
      if (!this.outEdges.has(e.source)) this.outEdges.set(e.source, new Map());
      const m = this.outEdges.get(e.source)!;
      if (!m.has(e.sPort)) m.set(e.sPort, []);
      m.get(e.sPort)!.push(e);
    }
    // region membership by node center
    this.regionOf = new Map();
    for (const n of st.nodes) {
      const cx = n.x + 90;
      const cy = n.y + 40;
      for (const r of st.regions) {
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
          this.regionOf.set(n.id, r);
          break;
        }
      }
    }
    this.builtVersion = st.graphVersion;
  }

  // ------------------------------------------------------------------- tick --
  private tick(dt: number) {
    const st = this.store.getState();
    if (st.graphVersion !== this.builtVersion) this.rebuild(st);
    if (st.stats !== this.lastPushedStats && this.lastPushedStats !== null) {
      // external change (prestige, load, milestone rewards touch cash only)
      this.adoptStats(st.stats);
    }
    if (st.runEpoch !== this.runEpoch) {
      // A save was loaded, or newGame/prestige rewound the clock. Adopt the
      // store's timeline and drop ALL time-anchored engine state — a stale
      // EventSystem would otherwise keep ghost events (e.g. a demand ×2 spike
      // whose endsAt is now in the "future") alive forever.
      this.runEpoch = st.runEpoch;
      this.simTime = st.simTime;
      this.offeredEma = this.servedEma = this.dropsEma = this.shedEma = 0;
      this.revEma = this.costEma = 0;
      this.uptime01 = 1;
      this.p95Samples = [];
      this.bottleneckArmed = false;
      this.readHitEma = 0;
      this.events = new EventSystem();
      this.autoscaler = new AutoscalerSystem();
      this.caseInjected = new Set();
      this.insUntil = 0;
      this.drillArmed = false;
      this.dropPath = [];
      this.pmWatch.clear();
      this.adoptStats(st.stats);
      // node ids restart per run — never let a new run inherit old backlogs
      this.nodes = new Map();
      this.edges = new Map();
      this.builtVersion = -1;
    }
    this.simTime += dt;

    const mods = computeMods(st);
    const logger = {
      log: (sev: LogSev, msg: string) => this.log(sev, msg),
      toast: (kind: 'event' | 'warn' | 'ok', title: string, body?: string) =>
        st.addToast(kind === 'ok' ? 'ok' : kind, title, body),
    };
    // case studies: inject scripted events as their time comes, no random ones
    const caseDef = st.caseId ? resolveCase(st.caseId, st.customCases) : undefined;
    if (caseDef) {
      caseDef.events.forEach((ev, i) => {
        const key = `${st.caseId}:${i}`;
        if (!this.caseInjected.has(key) && this.simTime >= ev.at) {
          this.caseInjected.add(key);
          this.events.injectScripted(ev, this.simTime, st, logger);
        }
      });
    }
    const fx = this.events.update(st, logger, Boolean(st.caseId));
    if (fx.badDeployZone) {
      const victim = this.nodes.get(fx.badDeployZone);
      if (victim) victim.health = Math.min(victim.health, BAL.badDeployHealth);
    }

    const demand = computeDemand(st, fx.demandMult, mods);
    const byId = new Map(st.nodes.map((n) => [n.id, n]));

    // ---- pass A: effective capacity, health, region modifiers ----
    for (const sn of this.nodes.values()) {
      const pn = byId.get(sn.id)!;
      const spec = specOf(pn.kind, pn.zone?.template);
      sn.name = pn.label ?? pn.zone?.name ?? spec.name.toLowerCase();
      const region = this.regionOf.get(sn.id);
      sn.regionCostMult =
        (region?.policies.redundancy ? BAL.regionRedundancyCostMult : 1) *
        (region?.policies.aggressiveScale ? BAL.regionAggressiveCostMult : 1) *
        (region?.policies.cacheTtl ? 1.05 : 1);
      sn.cacheBonus = region?.policies.cacheTtl && (spec.hitRate?.read || spec.hitRate?.static) ? BAL.regionCacheTtlHitBonus : 0;
      sn.shedMode = spec.special === 'apigw' || (region?.policies.rateLimit ?? false);

      if (pn.kind === 'zone' && pn.zone) {
        sn.ready = readyInstances(pn.zone, this.simTime);
        sn.booting = bootingInstances(pn.zone, this.simTime);
      } else {
        const booting = (pn.bootUntil ?? 0) > this.simTime;
        sn.ready = booting ? 0 : 1;
        sn.booting = booting ? 1 : 0;
        if (sn.wasBooting && !booting && pn.kind !== 'users') {
          sn.health = 1;
          this.log('deploy', `deploy: ${sn.name} online`);
        }
        sn.wasBooting = booting;
      }

      // healing: k8s-managed zones recover fast, everything else crawls back
      if (sn.health < 1) {
        const heal = pn.kind === 'zone' && zoneHasController(st, sn.id, 'k8s') ? BAL.k8sHealPerSec : 0.02;
        const wasSick = sn.health < 0.9;
        sn.health = Math.min(1, sn.health + heal * dt);
        if (wasSick && sn.health >= 0.9 && heal > 0.1) {
          this.log('ok', `k8s: ${pn.zone?.name ?? sn.id} pods rescheduled, health restored`);
          this.stats.autoScaleActions += 0; // no-op, keeps shape obvious
        }
      }

      sn.offline = Boolean(pn.disabled) || fx.disabledNodes.has(sn.id);
      let cap = spec.capacity * levelCapMult(pn.level) * Math.max(0, sn.ready) * sn.health * mods.capacityMult;
      // node mastery: veterans of a kind squeeze a little more out of the same box
      const mTier = masteryTier(this.stats.servedByKind[spec.kind] ?? 0);
      if (mTier > 0) cap *= 1 + BAL.masteryCapPerTier * mTier;
      if (DB_KINDS.has(pn.kind)) cap *= fx.dbCapMult;
      if (pn.kind === 'worker' && st.research.includes('mlpipe')) cap *= 1.5;
      const degraded = fx.degradedNodes.get(sn.id);
      if (degraded !== undefined) cap *= degraded;
      if (sn.offline) cap = 0;
      // lambda: elastic concurrency that follows recent throughput (cold starts)
      if (spec.special === 'lambda') cap = Math.min(cap, 6 + sn.servedEma * 1.6);
      // spot instances: reclaimed on a rolling per-node cycle — the discount's fine print.
      // Standalone boxes go fully dark; pools lose half (per-instance staggering).
      if (pn.kind === 'spot' || (pn.kind === 'zone' && pn.zone?.template === 'spot')) {
        const offset = (parseInt(sn.id.slice(1), 10) || 0) * 61;
        const phase = (this.simTime + offset) % BAL.spotCycleSec;
        if (phase < BAL.spotReclaimSec) {
          cap *= pn.kind === 'zone' ? 0.5 : 0;
          this.hintEarly(sn, 'Spot capacity reclaimed — back shortly');
        }
      }
      // replica without a storage link from a SQL primary barely functions
      if (pn.kind === 'replica') {
        const linked = (this.inEdges.get(sn.id) ?? []).some((e) => {
          const src = byId.get(e.source);
          return src && ['postgres', 'mysql', 'mssql'].includes(src.kind);
        });
        if (!linked) {
          cap *= 0.15;
          this.hintEarly(sn, 'Out of sync — wire a storage link from a SQL primary');
        }
      }
      sn.effCap = cap;
    }

    // ---- source emission + pass B: process every node ----
    let servedRate = 0;
    let dropRate = 0;
    let shedRate = 0;
    let revenue = 0; // $ this tick
    let perServeCosts = 0;
    let readServed = 0;
    let readHits = 0;
    let offeredRate = 0;

    for (const sn of this.nodes.values()) {
      const pn = byId.get(sn.id)!;
      const spec = specOf(pn.kind, pn.zone?.template);

      if (spec.special === 'source') {
        const outs = this.outEdges.get(sn.id)?.get('http') ?? [];
        // Users only reach targets that are actually up: while everything wired
        // to the Internet is still provisioning (or dead), the site simply
        // isn't launched — no traffic, no SLA damage.
        const live = outs.filter((e) => {
          const t = this.nodes.get(e.target);
          return t && !t.offline && t.effCap > 0;
        });
        sn.ui = blankUi();
        if (live.length === 0) {
          sn.ui.hint = outs.length === 0 ? 'Not launched — wire this to a server' : 'Waiting for upstream to come online…';
          sn.ui.inRps = 0;
          continue;
        }
        offeredRate = demand.offered;
        // DNS round-robin: the raw Internet splits evenly. Load balancers split smart.
        const weights = this.splitWeights(live, mods.smartSplitAll);
        for (let i = 0; i < live.length; i++) {
          for (let c = 0; c < NC; c++) {
            const r = demand.offered * demand.mix[c] * weights[i];
            if (r > 0) {
              live[i].nRates[c] += r;
              live[i].nLats[c] = 0;
            }
          }
        }
        sn.ui.inRps = demand.offered;
        sn.ui.served = demand.offered;
        sn.ui.util = 0;
        continue;
      }

      // -- intake: drain in-edge flow (written last tick) into the backlog --
      const ui = blankUi();
      let inRate = 0;
      const ins = this.inEdges.get(sn.id) ?? [];
      let intake = zeros();
      const intakeLat = zeros();
      for (const e of ins) {
        if (e.tPort === 'control') continue;
        for (let c = 0; c < NC; c++) {
          const r = e.rates[c];
          if (r <= 0) continue;
          const prev = intake[c];
          intake[c] += r;
          intakeLat[c] = prev + r > 0 ? (intakeLat[c] * prev + e.lats[c] * r) / (prev + r) : 0;
          inRate += r;
        }
      }
      sn.inSm += (inRate - sn.inSm) * BAL.utilSmoothing;

      // API gateway / rate-limit regions shed overload at the door as 429s.
      if (sn.shedMode && sn.effCap > 0) {
        const limit = sn.effCap * 1.15;
        if (inRate > limit) {
          const keep = limit / inRate;
          for (let c = 0; c < NC; c++) {
            shedRate += intake[c] * (1 - keep);
            intake[c] *= keep;
          }
        }
      }

      for (let c = 0; c < NC; c++) {
        const count = intake[c] * dt;
        if (count <= 0) continue;
        const prev = sn.backlog[c];
        sn.backlog[c] += count;
        sn.backlogLat[c] = (sn.backlogLat[c] * prev + intakeLat[c] * count) / (prev + count);
      }

      // -- overflow drops (weighted, timeout-aware) --
      // The queue may hold at most: (a) its configured length, and (b) however
      // much can drain before requests would time out anyway (85% of the
      // shortest class timeout). (b) prevents congestion collapse: an
      // overloaded node sheds the un-servable excess but keeps serving at max
      // throughput instead of black-holing everything into timeouts.
      const wOf = (c: number) => spec.capWeight?.[classAt(c)] ?? 1;
      const instancesForQueue = Math.max(1, sn.ready + sn.booting);
      let wBacklog = 0;
      let minTimeoutMs = Infinity;
      for (let c = 0; c < NC; c++) {
        if (sn.backlog[c] > 1e-9) {
          wBacklog += sn.backlog[c] * wOf(c);
          minTimeoutMs = Math.min(minTimeoutMs, CLASS_TIMEOUT_MS[c]);
        }
      }
      const wLimit = Math.min(
        spec.queueLen * instancesForQueue,
        sn.effCap > 0 && minTimeoutMs < Infinity ? sn.effCap * (minTimeoutMs / 1000) * 0.85 : spec.queueLen * instancesForQueue,
      );
      if (wBacklog > wLimit && wBacklog > 0) {
        const keep = wLimit / wBacklog;
        let droppedCount = 0;
        for (let c = 0; c < NC; c++) {
          droppedCount += sn.backlog[c] * (1 - keep);
          sn.backlog[c] *= keep;
        }
        dropRate += droppedCount / dt;
        ui.drops += droppedCount / dt;
        this.hint(sn, 'Overloaded — shedding requests');
      }
      let totalBacklog = sn.backlog.reduce((a, b) => a + b, 0);

      // observability nodes do no traffic work
      if (spec.capacity === 0) {
        ui.health = sn.health;
        ui.instances = sn.ready;
        ui.booting = sn.booting;
        ui.costRate = this.nodeCostRate(st, sn, byId, mods);
        if (spec.special === 'autoscaler') {
          const wired = (this.outEdges.get(sn.id)?.get('control') ?? []).length > 0;
          if (!wired) ui.hint = 'Wire the control port to a Zone';
        }
        sn.ui = ui;
        continue;
      }

      // -- processing --
      let eff = sn.effCap;
      if (spec.special === 'queue') {
        // Pull-based drain: a queue only forwards what consumers can take.
        const outs = this.outEdges.get(sn.id)?.get('jobs') ?? [];
        let pull = 0;
        for (const e of outs) {
          const t = this.nodes.get(e.target);
          if (t && !t.offline) pull += Math.max(0, t.effCap * (1.05 - Math.min(1, t.utilSm)));
        }
        eff = Math.min(eff, pull);
      }

      const w = (c: number) => spec.capWeight?.[classAt(c)] ?? 1;
      let wBack = 0;
      for (let c = 0; c < NC; c++) wBack += sn.backlog[c] * w(c);

      const wInRate = intake.reduce((acc, r, c) => acc + r * w(c), 0);
      const utilNow = sn.effCap > 0 ? wInRate / sn.effCap : inRate > 0 ? 2 : 0;
      sn.utilSm += (utilNow - sn.utilSm) * BAL.utilSmoothing;

      // Only backlog that WON'T clear this tick counts as queue wait — otherwise
      // tick quantization would charge every request ~100ms of phantom latency.
      const queueWaitMs = eff > 0 ? (Math.max(0, wBack - eff * dt) / eff) * 1000 : totalBacklog > 0 ? 99999 : 0;
      const congestion = 1 + BAL.latCongestionK * Math.pow(Math.min(1.5, Math.max(0, sn.utilSm)), BAL.latCongestionPow);
      let effLatMs = spec.baseLatencyMs * congestion + queueWaitMs;
      if (spec.special === 'lambda') {
        // cold-start penalty when demand outruns warm concurrency
        const shortfall = Math.max(0, sn.inSm - sn.effCap) / Math.max(1, sn.inSm);
        effLatMs += 260 * shortfall;
        if (shortfall > 0.2) this.sawColdStart = true;
      }

      // lesson latches
      if (congestion > 1.8 && sn.inSm > 1 && spec.baseLatencyMs > 0) this.sawCongestion = true;
      if (spec.special === 'queue' && totalBacklog > 100) this.sawQueueBuffer = true;
      if (DB_KINDS.has(pn.kind) && sn.utilSm > 0.9) this.sawDbHot = true;

      const budget = eff * dt;
      const drawFrac = wBack <= budget || wBack === 0 ? 1 : budget / wBack;

      let servedHere = 0;
      let hitsHere = 0;
      let missableReads = 0;
      for (let c = 0; c < NC; c++) {
        let take = sn.backlog[c] * drawFrac;
        if (take <= 1e-9) continue;
        sn.backlog[c] -= take;
        const cls = classAt(c);
        const reqLat = sn.backlogLat[c] + effLatMs + fx.latencyAddMs;

        // timeouts: users hang up; async jobs are patient
        if (reqLat > CLASS_TIMEOUT_MS[c]) {
          dropRate += take / dt;
          ui.drops += take / dt;
          this.hint(sn, spec.special === 'queue' ? 'Consumers too slow — jobs are expiring' : 'Requests timing out — add capacity upstream');
          continue;
        }

        let rest = take;
        let serveNow = 0;
        const hr = Math.min(0.97, (spec.hitRate?.[cls] ?? 0) + (spec.hitRate?.[cls] ? sn.cacheBonus : 0));
        if (hr > 0) {
          serveNow += take * hr;
          rest = take * (1 - hr);
          if (c === 2) {
            hitsHere += take * hr;
            missableReads += take;
          }
        }
        if (spec.serves.includes(cls)) {
          serveNow += rest;
          rest = 0;
        }
        if (rest > 1e-9) {
          const port = spec.forwards[cls];
          const outs = port ? (this.outEdges.get(sn.id)?.get(port) ?? []) : [];
          const liveOuts = outs.filter((e) => {
            const t = this.nodes.get(e.target);
            return t && !t.offline;
          });
          if (port && liveOuts.length > 0) {
            const smart = spec.smartSplit || mods.smartSplitAll;
            const weights = this.splitWeights(liveOuts, smart);
            for (let i = 0; i < liveOuts.length; i++) {
              const e = liveOuts[i];
              const addRate = (rest * weights[i]) / dt;
              if (addRate <= 0) continue;
              const prev = e.nRates[c];
              e.nRates[c] += addRate;
              e.nLats[c] = prev + addRate > 0 ? (e.nLats[c] * prev + reqLat * addRate) / (prev + addRate) : reqLat;
            }
          } else {
            // misconfiguration: nowhere to send this class
            dropRate += rest / dt;
            ui.drops += rest / dt;
            this.hint(sn, misconfigHint(spec.kind, cls));
          }
        }

        if (serveNow > 1e-9) {
          servedHere += serveNow;
          if (c === 2) readServed += serveNow;
          const latMult =
            c === JOB
              ? reqLat > 300000
                ? 0.6
                : 1
              : latencyValueMult(reqLat, demand.latSensitive);
          revenue += serveNow * demand.value[c] * latMult * mods.revenueMult;
          if (spec.perServeCost) perServeCosts += serveNow * spec.perServeCost;
          // p95 is user-facing: async jobs are latency-tolerant by design and
          // would otherwise drown the gauge in queue-wait seconds.
          if (c !== JOB) this.p95Samples.push({ t: this.simTime, lat: reqLat, w: serveNow });
        }
      }
      readHits += hitsHere;
      servedRate += servedHere / dt;
      sn.servedEma += (servedHere / dt - sn.servedEma) * 0.1;
      if (servedHere > 0) {
        this.stats.servedByKind[spec.kind] = (this.stats.servedByKind[spec.kind] ?? 0) + servedHere;
      }
      if (pn.kind === 'cdn' && servedHere > 0.01) this.sawCdnHit = true;

      ui.util = Math.max(0, sn.utilSm);
      ui.inRps = inRate;
      ui.served = servedHere / dt;
      ui.latencyMs = Math.min(9999, effLatMs);
      ui.queue = Math.round(sn.backlog.reduce((a, b) => a + b, 0));
      ui.health = sn.health;
      ui.instances = sn.ready;
      ui.booting = sn.booting;
      ui.costRate = this.nodeCostRate(st, sn, byId, mods);
      ui.hitPct = missableReads > 0.001 ? hitsHere / missableReads : spec.hitRate?.read || spec.hitRate?.static ? 0 : -1;
      if (sn.offline) ui.hint = 'OFFLINE';
      else if (sn.booting > 0 && sn.ready === 0) ui.hint = 'provisioning…';
      else if (!ui.hint && sn.pendingHint) ui.hint = sn.pendingHint;
      sn.pendingHint = null;
      sn.ui = ui;
    }

    // ---- swap edge buffers ----
    for (const e of this.edges.values()) {
      for (let c = 0; c < NC; c++) {
        e.rates[c] = e.nRates[c];
        e.lats[c] = e.nLats[c];
        e.nRates[c] = 0;
        e.nLats[c] = 0;
      }
      const total = e.rates.reduce((a, b) => a + b, 0);
      e.rpsSm += (total - e.rpsSm) * 0.25;
    }

    // ---- research points ----
    // Any 'metrics' node samples traffic; rpWeight lets managed observability
    // (Datadog) out-research self-hosted Prometheus — for a real $ bill.
    const metricsNodes = st.nodes.filter(
      (n) => n.kind !== 'zone' && specOf(n.kind).special === 'metrics' && !n.disabled && (n.bootUntil ?? 0) <= this.simTime,
    );
    let rpRate = 0;
    if (metricsNodes.length > 0) {
      const weights = metricsNodes.map((n) => specOf(n.kind).rpWeight ?? 1);
      const wSum = weights.reduce((a, b) => a + b, 0);
      const wLevels = metricsNodes.reduce((a, n, i) => a + n.level * weights[i], 0);
      rpRate = (BAL.rpBase * Math.sqrt(Math.max(0, this.servedEma)) * Math.sqrt(wSum) + BAL.rpPerPromLevel * wLevels) * mods.rpMult;
      for (let i = 0; i < metricsNodes.length; i++) {
        const sn = this.nodes.get(metricsNodes[i].id);
        if (sn) sn.ui.rpRate = (rpRate * weights[i]) / wSum;
      }
    }

    // ---- infra cost ----
    let costRate = 0;
    for (const sn of this.nodes.values()) costRate += sn.ui.costRate;
    costRate += perServeCosts / dt;

    // ---- money settlement ----
    let cash = st.cash;
    let ar = st.ar;
    if (mods.hasStripe) {
      cash += revenue;
    } else {
      ar += revenue;
      const drain = ar * BAL.arDrainPerSec * dt;
      ar -= drain;
      cash += drain;
    }
    cash -= costRate * dt;
    const lifetimeRev = st.lifetimeRev + revenue;
    const allTimeRev = st.allTimeRev + revenue;

    // ---- gauges ----
    const a = 1 - Math.exp(-dt / 1.2);
    this.offeredEma += (offeredRate - this.offeredEma) * a;
    this.servedEma += (servedRate - this.servedEma) * a;
    this.dropsEma += (dropRate - this.dropsEma) * a;
    this.shedEma += (shedRate - this.shedEma) * a;
    this.revEma += (revenue / dt - this.revEma) * a;
    this.costEma += (costRate - this.costEma) * a;

    const completed = this.servedEma + this.dropsEma + this.shedEma * BAL.repShedScale;
    if (completed > 0.05) {
      const ratio = this.servedEma / completed;
      const ua = 1 - Math.exp(-dt / BAL.uptimeEmaTau);
      this.uptime01 += (ratio - this.uptime01) * ua;
    }

    // p95 over a sliding window
    const cutoff = this.simTime - BAL.p95WindowSec;
    if (this.p95Samples.length > 4000) this.p95Samples.splice(0, this.p95Samples.length - 4000);
    this.p95Samples = this.p95Samples.filter((s) => s.t >= cutoff);
    this.p95 = weightedP95(this.p95Samples);

    // ---- first-failure insurance: the first bottleneck teaches, not scars ----
    if (
      !st.insuranceUsed &&
      !st.sandbox &&
      !st.caseId &&
      this.insUntil === 0 &&
      this.dropsEma > 1 &&
      this.servedEma > 1
    ) {
      this.insUntil = this.simTime + BAL.insuranceWindowSec;
      st.markInsuranceUsed();
    }
    const insured = this.simTime < this.insUntil;

    // ---- reputation ----
    // Rep drifts toward a target set by the uptime ratio: 90% uptime maps to
    // rep 0, 99.9%+ maps to 100. It bleeds fast during outages and heals slow —
    // a 30s outage costs real growth, a clean week earns it back.
    let rep = st.rep;
    const ratioNow = this.uptime01;
    const repTarget = ratioNow >= 0.999 ? 100 : Math.max(0, Math.min(100, ((ratioNow - 0.9) / 0.099) * 100));
    const bleedMult = st.mandate === 'ironclad' ? 1.75 : 1; // reliability pledge: drops hurt more
    const repRate = repTarget > rep ? BAL.repHealRate : insured ? 0 : BAL.repBleedRate * bleedMult;
    rep += (repTarget - rep) * repRate * dt;
    if (this.events.hasActiveIncident() && !insured) rep -= BAL.repIncidentDrain * bleedMult * dt;
    rep = Math.max(BAL.repMin, Math.min(BAL.repMax, rep));

    // ---- company growth (logistic toward the round's scale cap) ----
    const round = roundIndex(st.spTotal);
    const cap = BAL.scaleCaps[Math.min(round, BAL.scaleCaps.length - 1)];
    const growthMult = st.mandate === 'blitzscale' ? 1.5 : 1;
    let scale = st.scale;
    if (!st.sandbox && !st.caseId && this.servedEma > 0.5) {
      scale += BAL.growthRate * growthMult * BAL.repFactor(rep) * scale * (1 - scale / cap) * dt;
      scale = Math.min(scale, cap);
    }

    // ---- chaos drill accounting ----
    if (st.drill.activeUntil > this.simTime && this.drillArmed) {
      this.drillOffered += offeredRate * dt;
      this.drillDropped += dropRate * dt;
    }

    // ---- events accounting ----
    this.events.trackSpikeTick(offeredRate, dropRate, dt);

    // ---- stats ----
    this.stats.totalServed += servedRate * dt;
    this.stats.totalDropped += dropRate * dt;
    if (this.servedEma > this.stats.peakServed) this.stats.peakServed = this.servedEma;
    const profitNow = this.revEma - this.costEma;
    if (profitNow > this.stats.bestProfitPerSec) this.stats.bestProfitPerSec = profitNow;
    if (this.uptime01 >= 0.9999 && this.servedEma > 1) this.stats.fourNinesStreak += dt;
    else this.stats.fourNinesStreak = 0;

    // ---- 1 Hz systems: autoscaler, milestones, achievements, live-ops ----
    this.secAcc += dt;
    if (this.secAcc >= 1) {
      this.secAcc = 0;
      this.autoscaler.evaluate(
        this.store,
        (id) => this.nodes.get(id)?.utilSm ?? 0,
        (sev, msg) => this.log(sev, msg),
        () => {
          this.stats.autoScaleActions++;
          st.completeMilestone('hands-off');
          st.grantAchievement('automated');
          st.showLesson('autoscaling');
        },
      );
      if (!st.caseId) {
        this.checkMilestones(st, demand.atMarketCap, lifetimeRev);
        this.checkAchievements(st, byId, profitNow);
        this.evalContracts(st, rep);
        this.evalDrill(st);
        this.tickRival(st);
        this.recordMilestoneHistory(st);
      } else {
        this.evaluateCase(st, cash);
      }
      this.checkLessons(st, lifetimeRev);
      this.trackPostmortems(st, rep);
      this.checkMastery(st);
      this.computeDropPath();
      if (this.readHitShareTick(readHits, readServed) >= 0.3 && st.research.includes('caching')) {
        st.completeMilestone('first-cache');
      }
    } else {
      this.readHitShareTick(readHits, readServed);
    }

    if (this.events.spikeSurvivedFlag) {
      this.events.spikeSurvivedFlag = false;
      this.stats.spikesSurvived++;
      st.completeMilestone('spike-survivor');
      st.grantAchievement('hug-of-death');
    }

    // ---- push snapshot to the store ----
    const nodeStats: Record<string, NodeLive> = {};
    for (const sn of this.nodes.values()) nodeStats[sn.id] = sn.ui;
    const edgeStats: Record<string, EdgeLive> = {};
    for (const e of this.edges.values()) {
      const t = this.nodes.get(e.target);
      edgeStats[e.id] = { rps: e.rpsSm, util: Math.min(1.5, Math.max(t?.utilSm ?? 0, 0)) };
    }
    const live: LiveState = {
      gauges: {
        offered: this.offeredEma,
        served: this.servedEma,
        dropped: this.dropsEma,
        shed: this.shedEma,
        p95: this.p95,
        revenuePerSec: this.revEma,
        costPerSec: this.costEma,
        profitPerSec: profitNow,
        uptime: this.uptime01 * 100,
        rpPerSec: rpRate,
      },
      nodeStats,
      edgeStats,
      events: this.events.snapshot(),
      demandMult: fx.demandMult,
      dropPathEdges: this.dropPath,
    };
    const statsCopy = { ...this.stats };
    this.lastPushedStats = statsCopy;
    st.applyTick({
      simTime: this.simTime,
      cash,
      ar,
      rp: st.rp + rpRate * dt,
      rep,
      scale,
      lifetimeRev,
      allTimeRev,
      live,
      stats: statsCopy,
      logs: this.tickLogs.length > 0 ? this.tickLogs : undefined,
    });
    this.lastPushedStats = this.store.getState().stats;
    this.tickLogs = [];
  }

  // ----------------------------------------------------------- live-ops --

  private currentGauges(): Gauges {
    return {
      offered: this.offeredEma,
      served: this.servedEma,
      dropped: this.dropsEma,
      shed: this.shedEma,
      p95: this.p95 > 0 ? this.p95 : 9999,
      revenuePerSec: this.revEma,
      costPerSec: this.costEma,
      profitPerSec: this.revEma - this.costEma,
      uptime: this.uptime01 * 100,
      rpPerSec: 0,
    };
  }

  /** SLA contracts: roll the board on schedule; hold-evaluate the active one. */
  private evalContracts(st: GameStore, rep: number) {
    void rep;
    if (st.sandbox) return;
    if (st.milestones.includes('ten-rps') && this.simTime >= st.contractsRefreshAt) {
      st.setContractState({
        offers: rollContractOffers(this.currentGauges(), this.simTime),
        refreshAt: this.simTime + BAL.contractRefreshSec,
      });
    }
    const c = st.activeContract;
    if (!c) return;
    const g = this.currentGauges();
    const metrics: Record<string, number> = {
      p95: g.p95,
      uptime: g.uptime,
      dropped: g.dropped,
      cost: g.costPerSec,
      served: g.served,
      profit: g.profitPerSec,
    };
    const v = metrics[c.metric];
    const ok = c.op === '<' ? v < c.value : v > c.value;
    const held = ok ? c.held + 1 : 0;
    if (held >= c.holdSec) {
      st.completeContract();
      this.stats.contractsCompleted++;
      if (this.stats.contractsCompleted >= 10) st.grantAchievement('dealmaker');
      this.log('ok', `contract delivered: ${c.label}`);
    } else if (this.simTime > c.deadlineAt) {
      st.failContract();
      this.stats.contractsFailed++;
      this.log('err', `contract failed: ${c.label} — the client walks`);
    } else if (held !== c.held) {
      st.setContractState({ active: { ...c, held } });
    }
  }

  /** Chaos drill: arm + inject on start, grade on end (drop share). */
  private evalDrill(st: GameStore) {
    const active = st.drill.activeUntil > this.simTime;
    const logger = {
      log: (sev: LogSev, msg: string) => this.log(sev, msg),
      toast: (kind: 'event' | 'warn' | 'ok', title: string, body?: string) =>
        st.addToast(kind === 'ok' ? 'ok' : kind, title, body),
    };
    if (active && !this.drillArmed) {
      this.drillArmed = true;
      this.drillOffered = 0;
      this.drillDropped = 0;
      this.events.injectScripted({ kind: 'spike', mult: 2.6, durSec: 45, label: 'drill: synthetic surge' }, this.simTime, st, logger);
      this.events.injectScripted({ kind: 'db_slow', durSec: 35, label: 'drill: slow-query storm' }, this.simTime + 70, st, logger);
      this.events.injectScripted({ kind: 'outage', durSec: 22, label: 'drill: zone failure' }, this.simTime + 120, st, logger);
    } else if (!active && this.drillArmed) {
      this.drillArmed = false;
      const share = this.drillOffered > 1 ? this.drillDropped / this.drillOffered : 0;
      const passed = share < BAL.drillPassDropShare;
      if (passed) this.stats.drillsCompleted++;
      st.finishDrill(passed, share);
    }
  }

  /** The rival grows toward this round's cap; beat them at raise time for SP. */
  private tickRival(st: GameStore) {
    if (st.sandbox) return;
    const round = roundIndex(st.spTotal);
    const target = BAL.rpsCaps[Math.min(round, BAL.rpsCaps.length - 1)] * BAL.rivalTargetShare;
    let r = st.rival.rps;
    r += r * BAL.rivalGrowth * Math.max(0.05, 1 - r / target) + (Math.random() - 0.45) * 0.3;
    st.setRival(Math.max(1, Math.min(target, r)));
  }

  /** History entries for throughput records (survives via stats.peakServed). */
  private recordMilestoneHistory(st: GameStore) {
    for (const th of [100, 1000, 10000]) {
      if (this.servedEma >= th && this.lastPeakMark < th) {
        this.lastPeakMark = th;
        st.pushHistory('⚡', `First time serving ${fmtNum(th)} rps`);
      }
    }
  }

  /** Watch incidents from start to end and file a postmortem card. */
  private trackPostmortems(st: GameStore, rep: number) {
    const liveIncidents = this.events.active.filter(
      (e) => e.started && e.kind !== 'spike' && e.kind !== 'bad_deploy',
    );
    for (const ev of liveIncidents) {
      if (!this.pmWatch.has(ev.id)) {
        this.pmWatch.set(ev.id, {
          kind: ev.kind,
          label: ev.label,
          t0: this.simTime,
          drop0: this.stats.totalDropped,
          rep0: rep,
        });
      }
    }
    const liveIds = new Set(liveIncidents.map((e) => e.id));
    for (const [id, w] of this.pmWatch) {
      if (liveIds.has(id)) continue;
      this.pmWatch.delete(id);
      const dropped = Math.max(0, this.stats.totalDropped - w.drop0);
      const repLost = Math.max(0, w.rep0 - rep);
      const mitigations: string[] = [];
      const gaps: string[] = [];
      const hasRedundancy = st.regions.some((r) => r.policies.redundancy);
      const hasK8s = st.nodes.some((n) => n.kind === 'k8s' && !n.disabled);
      const shedding = this.shedEma > 0.2 || st.regions.some((r) => r.policies.rateLimit) || st.nodes.some((n) => n.kind === 'apigw' && !n.disabled);
      const caching = this.readHitEma > 0.25;
      (hasRedundancy ? mitigations : gaps).push(hasRedundancy ? 'N+1 redundancy degraded instead of dying' : 'N+1 redundancy (region policy) would degrade instead of die');
      (hasK8s ? mitigations : gaps).push(hasK8s ? 'k8s rescheduled the fallen instances' : 'an orchestrator would self-heal the fallen instances');
      if (w.kind === 'db_slow') (caching ? mitigations : gaps).push(caching ? 'caches kept absorbing reads' : 'a warmer cache tier would absorb the read load');
      if (shedding && dropped > 1) mitigations.push('load shedding failed cheap (429s beat timeouts)');
      const takeaways: Record<string, string> = {
        db_slow: 'Slow queries are a capacity event: whatever headroom the primary had is what you kept. Caches and replicas ARE the headroom.',
        outage: 'Zones fail as a unit. Blast radius is a design decision — regions, N+1 and an orchestrator make failures boring.',
        dep_failure: "Your p95 includes other people's outages. Keep your own hops fast enough to absorb a slow third party.",
      };
      st.pushPostmortem({
        id: this.pmCounter++,
        at: this.simTime,
        kind: w.kind,
        title: w.label,
        durSec: Math.round(this.simTime - w.t0),
        dropped: Math.round(dropped),
        repLost: Math.round(repLost * 10) / 10,
        mitigations: mitigations.slice(0, 3),
        gaps: gaps.slice(0, 2),
        takeaway: takeaways[w.kind] ?? 'Everything fails, always. The question is only how boring you made it.',
      });
      this.stats.incidentsSurvived++;
    }
  }

  /** Mastery tier-ups: toast when a kind crosses bronze/silver/gold. */
  private checkMastery(st: GameStore) {
    for (const [kind, served] of Object.entries(this.stats.servedByKind)) {
      const tier = masteryTier(served);
      const known = this.masteryKnown.get(kind);
      if (known === undefined) {
        this.masteryKnown.set(kind, tier);
        continue;
      }
      if (tier > known) {
        this.masteryKnown.set(kind, tier);
        const spec = specOf(kind as NodeKind);
        st.addToast(
          'achievement',
          `${spec.name} mastery: ${MASTERY_NAMES[tier]}`,
          `${fmtNum(served)} lifetime requests — every ${spec.name} now runs +${Math.round(BAL.masteryCapPerTier * tier * 100)}% capacity.`,
        );
      }
    }
  }

  /** Bottleneck breadcrumbs: edges on any path from the source to a dropping node. */
  private computeDropPath() {
    const dropping = [...this.nodes.values()].filter((sn) => sn.ui.drops > 0.3 && !sn.offline);
    if (dropping.length === 0) {
      if (this.dropPath.length > 0) this.dropPath = [];
      return;
    }
    const marked = new Set<string>();
    const visited = new Set<string>();
    for (const sn of dropping) {
      const stack = [sn.id];
      while (stack.length > 0 && marked.size < 300) {
        const cur = stack.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const e of this.inEdges.get(cur) ?? []) {
          if (e.tPort === 'control') continue;
          marked.add(e.id);
          if (!visited.has(e.source)) stack.push(e.source);
        }
      }
    }
    this.dropPath = [...marked];
  }

  // ------------------------------------------------------------- helpers --
  private splitWeights(edges: SEdge[], smart: boolean): number[] {
    if (edges.length === 1) return [1];
    if (!smart) return edges.map(() => 1 / edges.length);
    const raw = edges.map((e) => {
      const t = this.nodes.get(e.target);
      if (!t) return 0.02;
      return Math.max(0.02, t.effCap * (1.1 - Math.min(1, t.utilSm)));
    });
    const sum = raw.reduce((acc, v) => acc + v, 0);
    return raw.map((v) => v / sum);
  }

  private nodeCostRate(st: GameStore, sn: SNode, byId: Map<string, GameStore['nodes'][number]>, mods: GlobalMods): number {
    const pn = byId.get(sn.id)!;
    const spec = specOf(pn.kind, pn.zone?.template);
    if (spec.special === 'source') return 0;
    let instances = 1;
    let zoneK8s = 1;
    if (pn.kind === 'zone' && pn.zone) {
      instances = Math.max(0, pn.zone.instances);
      if (zoneHasController(st, pn.id, 'k8s')) zoneK8s = BAL.k8sZoneCostMult;
    }
    const idle = pn.disabled ? 0.15 : 1;
    return spec.opCost * levelOpCostMult(pn.level) * instances * sn.regionCostMult * zoneK8s * mods.costMult * idle;
  }

  private hint(sn: SNode, text: string) {
    sn.ui.hint = text;
    if (this.simTime - sn.lastHintAt > BAL.hintCooldownSec) {
      sn.lastHintAt = this.simTime;
      this.log('warn', `${sn.name}: ${text}`);
    }
  }

  /** Pass-A variant: pass B rebuilds the UI object, so stash the hint until then. */
  private hintEarly(sn: SNode, text: string) {
    sn.pendingHint = text;
    if (this.simTime - sn.lastHintAt > BAL.hintCooldownSec) {
      sn.lastHintAt = this.simTime;
      this.log('warn', `${sn.name}: ${text}`);
    }
  }

  private readHitShareTick(hits: number, reads: number): number {
    const share = reads + hits > 0.01 ? hits / (reads + 0.0001) : 0;
    this.readHitEma += (Math.min(1, share) - this.readHitEma) * 0.1;
    return this.readHitEma;
  }

  private checkMilestones(st: GameStore, atMarketCap: boolean, lifetimeRev: number) {
    const done = new Set(st.milestones);
    const complete = (id: string) => {
      if (!done.has(id)) st.completeMilestone(id);
    };
    if (this.stats.totalServed >= 1) complete('first-wire');
    if (Math.min(this.servedEma, this.offeredEma) >= 10) complete('ten-rps');
    // bottleneck recovery
    if (!done.has('first-bottleneck')) {
      if (!this.bottleneckArmed && this.dropsEma > 1 && this.servedEma > 2) {
        this.bottleneckArmed = true;
        this.bottleneckPeak = this.servedEma;
        this.bottleneckArmedAt = this.simTime;
      }
      if (
        this.bottleneckArmed &&
        this.simTime - this.bottleneckArmedAt > 10 &&
        this.dropsEma < 0.05 &&
        this.servedEma > this.bottleneckPeak * 1.02
      ) {
        complete('first-bottleneck');
      }
    }
    if (st.nodes.some((n) => n.kind !== 'zone' && specOf(n.kind).special === 'metrics' && !n.disabled)) complete('observability');
    if (st.tiers.includes(2)) complete('tier-two');
    if (st.nodes.some((n) => n.kind === 'stripe')) complete('auto-billing');
    if (pendingSp(lifetimeRev) >= BAL.prestigeMinSp) complete('series-ready');
    if (atMarketCap && Math.floor(this.simTime) % 60 === 0) {
      this.log('info', 'market cap reached for this funding round — raise a round to grow further');
    }
  }

  /** Case studies: hold each SLO continuously for its window; time and cash cut both ways. */
  private evaluateCase(st: GameStore, cash: number) {
    const def = st.caseId ? resolveCase(st.caseId, st.customCases) : undefined;
    if (!def || st.caseStatus !== 'running') return;

    let dbmax = 0;
    for (const sn of this.nodes.values()) {
      if (DB_KINDS.has(sn.kind as NodeKind)) dbmax = Math.max(dbmax, sn.utilSm);
    }
    const metrics: Record<string, number> = {
      p95: this.p95 > 0 ? this.p95 : 9999,
      uptime: this.uptime01 * 100,
      dropped: this.dropsEma,
      profit: this.revEma - this.costEma,
      cost: this.costEma,
      served: this.servedEma,
      dbmax,
    };

    const next: Record<string, { held: number; done: boolean }> = {};
    let allDone = true;
    for (const o of def.objectives) {
      const prev = st.caseObjectives[o.id] ?? { held: 0, done: false };
      if (prev.done) {
        next[o.id] = prev;
        continue;
      }
      const v = metrics[o.metric];
      const ok = o.op === '<' ? v < o.value : v > o.value;
      const held = ok ? prev.held + 1 : 0;
      const done = held >= o.holdSec;
      next[o.id] = { held, done };
      if (done) this.log('ok', `objective met: ${o.label}`);
      if (!done) allDone = false;
    }

    let status: 'running' | 'passed' | 'failed' = 'running';
    if (allDone) status = 'passed';
    else if (this.simTime > def.timeLimitSec) status = 'failed';
    else if (cash < (def.failCashBelow ?? -150)) status = 'failed';

    if (status === 'passed') this.log('ok', `CASE PASSED: ${def.title}`);
    if (status === 'failed') this.log('err', `CASE FAILED: ${def.title}`);
    st.setCaseProgress(next, status);
  }

  /** Fire a field note the first time the player experiences each phenomenon. */
  private checkLessons(st: GameStore, lifetimeRev: number) {
    const L = (id: string, cond: boolean) => {
      if (cond) st.showLesson(id);
    };
    L('first-request', this.stats.totalServed >= 1);
    L('bottleneck', this.bottleneckArmed || this.dropsEma > 1);
    L('latency-curve', this.sawCongestion);
    L('cache-aside', this.readHitEma > 0.03);
    L('db-contention', this.sawDbHot);
    L('queue-buffer', this.sawQueueBuffer);
    L('cold-start', this.sawColdStart);
    L('spike', this.events.active.some((e) => e.kind === 'spike' && e.warned));
    L('shed-load', this.shedEma > 0.5);
    L('sla-nines', this.simTime > 60 && this.uptime01 < 0.999 && this.servedEma > 3);
    L('p95', st.milestones.includes('observability'));
    L('redundancy', this.events.hasActiveIncident());
    L('cdn-edge', this.sawCdnHit);
    L('rearchitect', pendingSp(lifetimeRev) >= BAL.prestigeMinSp);
  }

  private checkAchievements(st: GameStore, byId: Map<string, GameStore['nodes'][number]>, profitNow: number) {
    const has = new Set(st.achievements);
    const grant = (id: string) => {
      if (!has.has(id)) st.grantAchievement(id);
    };
    if (st.lifetimeRev >= 1) grant('first-dollar');
    if (this.readHitEma > 0.05) grant('first-cache');
    for (const [id, outs] of this.outEdges) {
      const n = byId.get(id);
      if (n?.kind === 'lb') {
        const httpOuts = outs.get('http') ?? [];
        if (httpOuts.filter((e) => e.rpsSm > 0.5).length >= 2) {
          grant('balanced');
          break;
        }
      }
    }
    const kinds = new Set(st.nodes.filter((n) => !n.disabled).map((n) => n.kind));
    if (kinds.has('k8s') && kinds.has('cicd') && kinds.has('stripe') && kinds.has('autoscaler')) grant('self-driving');
    if (this.stats.fourNinesStreak >= 300) grant('four-nines');
    if (this.p95 > 0 && this.p95 < 50 && this.servedEma >= 100) grant('speed-demon');
    if (this.servedEma >= 1000) grant('kilo-rps');
    if (this.stats.prestiges >= 1) grant('exit-strategy');
    if (profitNow >= 100) grant('money-printer');

    // --- combo discoveries: reward architectures worth experimenting toward ---
    const hitting = (kind: string) =>
      [...this.nodes.values()].some((sn) => sn.kind === kind && sn.ui.hitPct > 0.05 && sn.ui.inRps > 0.5);
    if ((hitting('cdn') || hitting('fastly')) && hitting('varnish')) grant('layered-cache');
    if (hitting('redis') && hitting('memcached')) grant('cache-hierarchy');
    const spotCount = st.nodes.filter(
      (n) => !n.disabled && (n.kind === 'spot' || (n.kind === 'zone' && n.zone?.template === 'spot')),
    ).length;
    if (spotCount >= 3 && kinds.has('k8s') && this.uptime01 > 0.99 && this.servedEma > 5) grant('chaos-native');
    const dbServing = new Set(
      [...this.nodes.values()]
        .filter((sn) => ['postgres', 'mysql', 'mssql', 'mongo', 'elastic'].includes(sn.kind) && sn.ui.served > 0.1)
        .map((sn) => sn.kind),
    );
    if (dbServing.size >= 3) grant('polyglot');
  }
}

// ---------------------------------------------------------------------------

function classAt(i: number): 'static' | 'api' | 'read' | 'write' | 'job' {
  return (['static', 'api', 'read', 'write', 'job'] as const)[i];
}

function portType(handle: string): PortType {
  const prefix = handle.split('-')[0];
  if (prefix === 'ctl') return 'control';
  if (prefix === 'repl') return 'data'; // legacy handle ids from before the merge
  return prefix as PortType;
}

function misconfigHint(kind: string, cls: string): string {
  if (kind === 'nginx' || kind === 'lb' || kind === 'haproxy' || kind === 'apigw' || kind === 'cdn' || kind === 'fastly' || kind === 'varnish')
    return `No upstream for ${cls} traffic — wire the output onward`;
  if ((kind === 'app' || kind === 'spot') && (cls === 'read' || cls === 'write')) return 'No database connected — reads/writes failing';
  if ((kind === 'app' || kind === 'spot') && cls === 'job') return 'No queue connected — heavy jobs failing';
  if (kind === 'redis' || kind === 'memcached') return 'Cache misses have no database behind them';
  if (kind === 'replica' && cls === 'write') return 'Writes need a path back to the primary';
  if (kind === 'elastic' && cls === 'write') return 'Search indexes don\'t own writes — wire a database behind it';
  if (kind === 's3') return `S3 can't serve ${cls} traffic`;
  if (kind === 'worker') return `Workers only consume jobs — ${cls} has nowhere to go`;
  return `${cls} traffic has nowhere to go`;
}

function weightedP95(samples: { lat: number; w: number }[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a.lat - b.lat);
  const total = sorted.reduce((a, s) => a + s.w, 0);
  if (total <= 0) return 0;
  let acc = 0;
  for (const s of sorted) {
    acc += s.w;
    if (acc >= total * 0.95) return s.lat;
  }
  return sorted[sorted.length - 1].lat;
}

// ------------------------------- bootstrap ---------------------------------

let engine: Engine | null = null;
export function startEngine(store: typeof import('../state/store').useGame): Engine {
  const w = window as unknown as { __uptimeEngine?: Engine };
  if (w.__uptimeEngine) {
    w.__uptimeEngine.stop();
  }
  engine = new Engine(store);
  w.__uptimeEngine = engine;
  engine.start();
  return engine;
}
