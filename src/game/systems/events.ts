import { BAL } from '../engine/balance';
import type { ActiveEvent, LogEntry, LogSev, PlacedNode, RegionRect } from '../engine/types';
import type { GameStore } from '../state/store';

// Events replace "random clicking" with resilience tests. Positive spikes reward
// headroom + autoscaling; incidents reward redundancy + auto-healing. Everything
// is logged to the ops console; spikes get a forewarning so the player can react.

export interface EventEffects {
  demandMult: number;
  dbCapMult: number; // postgres/replica capacity multiplier
  latencyAddMs: number; // added to every serve (dependency failure)
  disabledNodes: Set<string>;
  degradedNodes: Map<string, number>; // node id -> capacity mult (redundant outage)
  badDeployZone: string | null; // set for exactly one tick when a bad deploy fires
  // phase-2 physics
  hotKeyTarget: string | null; // shard edge target pinned by a celebrity key
  grayNode: string | null; // slow-but-healthy victim (invisible by design)
  stampedeCache: string | null; // one tick: cache that just mass-expired
  degradedKinds: Map<string, number>; // kind -> capacity mult (correlated failure)
  botShare: number; // 0..1 of current traffic that pays nothing
}

interface EventLogger {
  log: (sev: LogSev, msg: string) => void;
  toast: (kind: 'event' | 'warn' | 'ok', title: string, body?: string) => void;
}

let eventCounter = 1;

export class EventSystem {
  active: ActiveEvent[] = [];
  nextAt: number = BAL.firstEventAt;
  firedScripted = false;
  private easedOnce = false;
  // spike survival tracking
  spikeOffered = 0;
  spikeDropped = 0;
  spikeSurvivedFlag = false; // consumed by the engine for milestone/achievement

  update(
    st: Pick<GameStore, 'simTime' | 'lifetimeRev' | 'regions' | 'nodes' | 'research' | 'sandbox' | 'live' | 'cash' | 'mandate'>,
    logger: EventLogger,
    noRandom = false,
  ): EventEffects {
    const t = st.simTime;
    const fx: EventEffects = {
      demandMult: 1,
      dbCapMult: 1,
      latencyAddMs: 0,
      disabledNodes: new Set(),
      degradedNodes: new Map(),
      badDeployZone: null,
      hotKeyTarget: null,
      grayNode: null,
      stampedeCache: null,
      degradedKinds: new Map(),
      botShare: 0,
    };

    // Schedule (random events pause in sandbox and during case studies).
    // Adaptive pressure: the market reads the room — struggling players get
    // longer gaps and gentler spikes, cruising players get less slack.
    if (t >= this.nextAt && !st.sandbox && !noRandom) {
      const uptime = st.live.gauges.uptime;
      const struggling = uptime < BAL.pressureLowUptime || st.cash < BAL.pressureLowCash;
      const thriving = uptime > BAL.pressureHighUptime && st.cash > BAL.pressureHighCash;
      let gapMult = struggling ? BAL.pressureEasyGapMult : thriving ? BAL.pressureHardGapMult : 1;
      if (st.mandate === 'blitzscale') gapMult *= 0.65;
      if (struggling && !this.easedOnce) {
        this.easedOnce = true;
        logger.log('info', 'the market senses weakness — and, mercifully, looks away for a while');
      }
      this.spawn(st, logger, struggling);
      this.nextAt = t + (BAL.eventMinGap + Math.random() * (BAL.eventMaxGap - BAL.eventMinGap)) * gapMult;
    }

    // Warnings + starts + effects + expiry
    const still: ActiveEvent[] = [];
    for (const ev of this.active) {
      if (!ev.warned && ev.kind === 'spike' && t >= ev.startsAt - BAL.spikeWarnSec) {
        ev.warned = true;
        logger.log('warn', `heads-up: ${ev.label} expected in ${BAL.spikeWarnSec}s — traffic ×${ev.mult?.toFixed(1)}`);
        logger.toast('event', `Incoming: ${ev.label}`, `Traffic ×${ev.mult?.toFixed(1)} in ${BAL.spikeWarnSec}s. Got headroom?`);
      }
      if (!ev.started && t >= ev.startsAt) {
        ev.started = true;
        this.onStart(ev, st, logger, fx);
      }
      if (ev.started && t < ev.endsAt) {
        this.applyEffect(ev, st, fx);
        still.push(ev);
      } else if (!ev.started) {
        still.push(ev);
      } else {
        this.onEnd(ev, logger);
      }
    }
    this.active = still;
    return fx;
  }

  private spawn(
    st: Pick<GameStore, 'simTime' | 'lifetimeRev' | 'regions' | 'nodes' | 'research' | 'sandbox'>,
    logger: EventLogger,
    gentleBias = false,
  ) {
    const t = st.simTime;
    const incidentsUnlocked = st.lifetimeRev >= BAL.incidentsAfterRevenue;
    const pool: ActiveEvent['kind'][] = ['spike'];
    if (incidentsUnlocked) {
      pool.push('db_slow', 'dep_failure', 'spike', 'bot_flood');
      if (st.regions.length > 0 || st.nodes.length > 6) pool.push('outage');
      if (st.nodes.some((n) => n.kind === 'zone')) pool.push('bad_deploy');
      if (st.nodes.length > 5) pool.push('gray');
      // correlated failure needs 2+ active nodes of a capacity-bearing kind
      if (this.corrCandidate(st.nodes)) pool.push('corr_failure');
      // stampedes need a cache that's actually carrying traffic (engine can't
      // be read from here, so gate on existence — the start handler re-checks)
      if (st.nodes.some((n) => ['redis', 'memcached', 'varnish', 'cdn', 'fastly'].includes(n.kind) && !n.disabled)) pool.push('stampede');
      // hot keys need a shard router with 2+ shards behind it
      if (st.nodes.some((n) => n.kind === 'shardrouter' && !n.disabled)) pool.push('hot_key');
    }
    // The first event is always a gentle scripted spike.
    const kind = this.firedScripted ? pool[Math.floor(Math.random() * pool.length)] : 'spike';
    const gentle = !this.firedScripted;
    this.firedScripted = true;

    const id = eventCounter++;
    switch (kind) {
      case 'spike': {
        let mult = gentle
          ? 2.0
          : BAL.spikeMult[0] + Math.random() * (BAL.spikeMult[1] - BAL.spikeMult[0]);
        if (gentleBias) mult = Math.min(mult, BAL.pressureEasySpikeCap);
        const dur = BAL.spikeDurSec[0] + Math.random() * (BAL.spikeDurSec[1] - BAL.spikeDurSec[0]);
        const labels = ['Product Hunt launch', 'Hacker News frontpage', 'viral tweet', 'influencer shout-out'];
        this.active.push({
          id,
          kind,
          label: labels[Math.floor(Math.random() * labels.length)],
          startsAt: t + BAL.spikeWarnSec,
          endsAt: t + BAL.spikeWarnSec + dur,
          warned: false,
          started: false,
          mult,
        });
        break;
      }
      case 'db_slow':
        this.active.push({
          id,
          kind,
          label: 'slow query storm',
          startsAt: t,
          endsAt: t + BAL.dbSlowDurSec,
          warned: true,
          started: false,
        });
        break;
      case 'dep_failure':
        this.active.push({
          id,
          kind,
          label: 'third-party API degraded',
          startsAt: t,
          endsAt: t + BAL.depFailDurSec,
          warned: true,
          started: false,
        });
        break;
      case 'outage': {
        const region = st.regions.length > 0 ? st.regions[Math.floor(Math.random() * st.regions.length)] : undefined;
        this.active.push({
          id,
          kind,
          label: region ? `${region.name} availability zone outage` : 'availability zone outage',
          startsAt: t,
          endsAt: t + BAL.outageDurSec,
          warned: true,
          started: false,
          regionId: region?.id,
        });
        break;
      }
      case 'bad_deploy':
        this.active.push({
          id,
          kind,
          label: 'bad deploy',
          startsAt: t,
          endsAt: t + 1,
          warned: true,
          started: false,
        });
        break;
      case 'gray': {
        const candidates = st.nodes.filter((n) => !n.disabled && n.kind !== 'users' && n.kind !== 'ingress' && n.kind !== 'zone');
        if (candidates.length === 0) break;
        const victim = candidates[Math.floor(Math.random() * candidates.length)];
        this.active.push({
          id,
          kind,
          label: 'something feels slow…', // the whole point: monitoring can't name it
          startsAt: t,
          endsAt: t + BAL.grayDurSec,
          warned: true,
          started: false,
          targetId: victim.id,
        });
        break;
      }
      case 'corr_failure': {
        const victimKind = this.corrCandidate(st.nodes);
        if (!victimKind) break;
        this.active.push({
          id,
          kind,
          label: `shared-dependency incident — every ${victimKind} degraded`,
          startsAt: t,
          endsAt: t + BAL.corrDurSec,
          warned: true,
          started: false,
          targetKind: victimKind,
        });
        break;
      }
      case 'stampede': {
        const caches = st.nodes.filter((n) => ['redis', 'memcached', 'varnish', 'cdn', 'fastly'].includes(n.kind) && !n.disabled);
        if (caches.length === 0) break;
        const victim = caches[Math.floor(Math.random() * caches.length)];
        this.active.push({
          id,
          kind,
          label: 'mass cache expiry — thundering herd',
          startsAt: t,
          endsAt: t + 1, // instantaneous: the warmth dump is the event
          warned: true,
          started: false,
          targetId: victim.id,
        });
        break;
      }
      case 'hot_key': {
        const routers = st.nodes.filter((n) => n.kind === 'shardrouter' && !n.disabled);
        if (routers.length === 0) break;
        const router = routers[Math.floor(Math.random() * routers.length)];
        this.active.push({
          id,
          kind,
          label: 'celebrity key — one shard is on fire',
          startsAt: t,
          endsAt: t + BAL.hotKeyDurSec,
          warned: true,
          started: false,
          targetId: router.id, // engine resolves which SHARD gets pinned
        });
        break;
      }
      case 'bot_flood': {
        const mult = BAL.botFloodMult[0] + Math.random() * (BAL.botFloodMult[1] - BAL.botFloodMult[0]);
        const dur = BAL.botFloodDurSec[0] + Math.random() * (BAL.botFloodDurSec[1] - BAL.botFloodDurSec[0]);
        this.active.push({
          id,
          kind,
          label: 'scraper botnet',
          startsAt: t,
          endsAt: t + dur,
          warned: true,
          started: false,
          mult,
        });
        break;
      }
    }
  }

  /** Most numerous capacity-bearing kind with 2+ active nodes, or null. */
  private corrCandidate(nodes: Pick<GameStore, 'nodes'>['nodes']): string | null {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      if (n.disabled || n.kind === 'users' || n.kind === 'zone' || n.kind === 'ingress') continue;
      counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 1;
    for (const [k, c] of counts) {
      if (c > bestN) {
        best = k;
        bestN = c;
      }
    }
    return best;
  }

  private onStart(ev: ActiveEvent, st: Pick<GameStore, 'nodes' | 'regions'>, logger: EventLogger, fx: EventEffects) {
    switch (ev.kind) {
      case 'spike':
        this.spikeOffered = 0;
        this.spikeDropped = 0;
        logger.log('warn', `SPIKE ${ev.label} — traffic ×${ev.mult?.toFixed(1)} for ${Math.round(ev.endsAt - ev.startsAt)}s`);
        break;
      case 'db_slow':
        logger.log('err', 'INCIDENT slow query storm — database capacity −55%');
        logger.toast('warn', 'Incident: slow query storm', 'Database capacity −55%. Caches and replicas soften the blow.');
        break;
      case 'dep_failure':
        logger.log('err', `INCIDENT ${ev.label} — +${BAL.depFailLatencyMs}ms on every response`);
        logger.toast('warn', 'Incident: dependency degraded', `+${BAL.depFailLatencyMs}ms latency platform-wide.`);
        break;
      case 'outage': {
        // Freeze the victim list at start so nodes can't dodge by moving.
        const victims = this.outageVictims(ev, st);
        (ev as ActiveEvent & { data?: string[] }).data = victims;
        logger.log('err', `INCIDENT ${ev.label} — ${victims.length} node(s) affected`);
        logger.toast('warn', `Incident: ${ev.label}`, 'Redundancy policies and multi-region soften outages.');
        break;
      }
      case 'bad_deploy': {
        const zones = st.nodes.filter((n) => n.kind === 'zone');
        if (zones.length > 0) {
          const victim = zones[Math.floor(Math.random() * zones.length)];
          fx.badDeployZone = victim.id;
          logger.log('err', `INCIDENT bad deploy in ${victim.zone?.name ?? victim.id} — instance health degraded (k8s auto-heals)`);
        }
        break;
      }
      case 'gray':
        // deliberately quiet: no toast, a vague log line. The tail will tell.
        logger.log('warn', 'latency alert: p99 drifting — no failing health checks found');
        break;
      case 'corr_failure':
        logger.log('err', `INCIDENT ${ev.label}`);
        logger.toast('warn', 'Correlated failure', `${ev.targetKind} nodes share a dependency — and now they share an incident. Diversity is the hedge.`);
        break;
      case 'stampede':
        fx.stampedeCache = ev.targetId ?? null;
        logger.log('err', `INCIDENT ${ev.label}`);
        logger.toast('warn', 'Cache stampede', 'A hot TTL expired everywhere at once. Misses are hammering the origin while the cache re-warms.');
        break;
      case 'hot_key':
        logger.log('err', `INCIDENT ${ev.label}`);
        logger.toast('warn', 'Hot partition', `${Math.round(BAL.hotKeyShare * 100)}% of routed traffic is pinned to ONE shard. More shards won't help — a cache in front will.`);
        break;
      case 'bot_flood':
        logger.log('warn', `ABUSE ${ev.label} — traffic ×${ev.mult?.toFixed(1)}, none of it pays`);
        logger.toast('warn', 'Bot flood', 'Load is up, revenue is not. Rate limiting at the gateway sheds it cheaply.');
        break;
    }
  }

  private outageVictims(ev: ActiveEvent, st: Pick<GameStore, 'nodes' | 'regions'>): string[] {
    if (ev.regionId) {
      const region = st.regions.find((r) => r.id === ev.regionId);
      if (region) return st.nodes.filter((n) => n.kind !== 'users' && inRect(n, region)).map((n) => n.id);
    }
    const candidates = st.nodes.filter((n) => n.kind !== 'users');
    return candidates.filter(() => Math.random() < BAL.outageShare).map((n) => n.id);
  }

  private applyEffect(ev: ActiveEvent, st: Pick<GameStore, 'regions' | 'research'>, fx: EventEffects) {
    switch (ev.kind) {
      case 'spike':
        fx.demandMult *= ev.mult ?? 2;
        break;
      case 'db_slow':
        fx.dbCapMult = Math.min(fx.dbCapMult, BAL.dbSlowCapMult);
        break;
      case 'dep_failure':
        fx.latencyAddMs += BAL.depFailLatencyMs;
        break;
      case 'outage': {
        const victims = ((ev as ActiveEvent & { data?: string[] }).data ?? []) as string[];
        const region = st.regions.find((r) => r.id === ev.regionId);
        const redundant = region?.policies.redundancy ?? false;
        const multiregion = st.research.includes('multiregion');
        for (const id of victims) {
          if (redundant && multiregion) fx.degradedNodes.set(id, 0.8);
          else if (redundant) fx.degradedNodes.set(id, 0.5);
          else fx.disabledNodes.add(id);
        }
        break;
      }
      case 'bad_deploy':
        break;
      case 'gray':
        fx.grayNode = ev.targetId ?? null;
        break;
      case 'corr_failure':
        if (ev.targetKind) fx.degradedKinds.set(ev.targetKind, BAL.corrCapMult);
        break;
      case 'stampede':
        break; // one-shot at start
      case 'hot_key':
        fx.hotKeyTarget = ev.targetId ?? null;
        break;
      case 'bot_flood': {
        const m = ev.mult ?? 2;
        fx.demandMult *= m;
        // the flood's share of TOTAL traffic pays nothing
        fx.botShare = Math.max(fx.botShare, (m - 1) / m);
        break;
      }
    }
  }

  private onEnd(ev: ActiveEvent, logger: EventLogger) {
    if (ev.kind === 'spike') {
      const dropShare = this.spikeOffered > 0 ? this.spikeDropped / this.spikeOffered : 0;
      if (dropShare < 0.02) {
        this.spikeSurvivedFlag = true;
        logger.log('ok', `spike over — served ${Math.round((1 - dropShare) * 100)}% through ${ev.label}. Reputation soars.`);
        logger.toast('ok', 'Spike survived', `${(dropShare * 100).toFixed(1)}% dropped. The architecture held.`);
      } else {
        logger.log('warn', `spike over — dropped ${(dropShare * 100).toFixed(1)}% during ${ev.label}.`);
      }
    } else if (ev.kind !== 'bad_deploy') {
      logger.log('ok', `resolved: ${ev.label}`);
    }
  }

  /** Case studies inject scripted events at fixed times. */
  injectScripted(
    def: { kind: 'spike' | 'db_slow' | 'outage' | 'dep_failure'; mult?: number; durSec?: number; label?: string },
    simTime: number,
    st: Pick<GameStore, 'regions'>,
    logger: EventLogger,
  ) {
    const id = eventCounter++;
    switch (def.kind) {
      case 'spike':
        this.active.push({
          id,
          kind: 'spike',
          label: def.label ?? 'scripted traffic surge',
          startsAt: simTime + BAL.spikeWarnSec,
          endsAt: simTime + BAL.spikeWarnSec + (def.durSec ?? 60),
          warned: false,
          started: false,
          mult: def.mult ?? 2.5,
        });
        break;
      case 'db_slow':
        this.active.push({
          id,
          kind: 'db_slow',
          label: def.label ?? 'slow query storm',
          startsAt: simTime,
          endsAt: simTime + (def.durSec ?? BAL.dbSlowDurSec),
          warned: true,
          started: false,
        });
        break;
      case 'dep_failure':
        this.active.push({
          id,
          kind: 'dep_failure',
          label: def.label ?? 'third-party API degraded',
          startsAt: simTime,
          endsAt: simTime + (def.durSec ?? BAL.depFailDurSec),
          warned: true,
          started: false,
        });
        break;
      case 'outage': {
        const region = st.regions.length > 0 ? st.regions[Math.floor(Math.random() * st.regions.length)] : undefined;
        this.active.push({
          id,
          kind: 'outage',
          label: def.label ?? (region ? `${region.name} availability zone outage` : 'availability zone outage'),
          startsAt: simTime,
          endsAt: simTime + (def.durSec ?? BAL.outageDurSec),
          warned: true,
          started: false,
          regionId: region?.id,
        });
        break;
      }
    }
    logger.log('warn', `scheduled: ${def.label ?? def.kind}`);
  }

  /** Engine feeds spike accounting each tick while a spike is active. */
  trackSpikeTick(offered: number, dropped: number, dt: number) {
    if (this.active.some((e) => e.kind === 'spike' && e.started)) {
      this.spikeOffered += offered * dt;
      this.spikeDropped += dropped * dt;
    }
  }

  hasActiveIncident(): boolean {
    // spikes are opportunities and bot floods are abuse (drops already hurt);
    // neither should passively drain reputation like a real incident does
    return this.active.some((e) => e.started && e.kind !== 'spike' && e.kind !== 'bot_flood');
  }

  snapshot(): ActiveEvent[] {
    return this.active.map((e) => ({ ...e }));
  }
}

function inRect(n: PlacedNode, r: RegionRect): boolean {
  const cx = n.x + 90;
  const cy = n.y + 40;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

export type { LogEntry };
