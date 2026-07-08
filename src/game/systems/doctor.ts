import { DB_KINDS, SPECS, specOf } from '../catalog/nodes';
import { BAL, fmtMoney, fmtNum } from '../engine/balance';
import type { GameStore } from '../state/store';

// ---------------------------------------------------------------------------
// The Architecture Doctor: a rule pass over the live graph that produces a
// short, prioritized, costed review — a staff engineer looking over your
// shoulder. Pure analysis, no mutations; the player still does the building.
// ---------------------------------------------------------------------------

export interface Finding {
  severity: 'crit' | 'warn' | 'tip';
  title: string;
  detail: string;
  fix?: string; // concrete suggestion with an estimated cost where possible
}

const nameOf = (n: { label?: string; kind: string; zone?: { template: string; name: string } | null }) =>
  n.label ?? (n.zone ? n.zone.name : SPECS[n.kind as keyof typeof SPECS]?.name ?? n.kind);

export function diagnose(st: GameStore): Finding[] {
  const f: Finding[] = [];
  const live = st.live;
  const nodes = st.nodes;
  const stats = (id: string) => live.nodeStats[id];

  // --- saturation & drops ---------------------------------------------------
  for (const n of nodes) {
    const s = stats(n.id);
    if (!s) continue;
    const spec = specOf(n.kind, n.zone?.template);
    if (spec.capacity === 0 || spec.special === 'source') continue;
    if (s.drops > 0.5) {
      f.push({
        severity: 'crit',
        title: `${nameOf(n)} is dropping ${fmtNum(s.drops)} req/s`,
        detail: s.hint ?? 'Sustained overflow: its queue fills faster than it drains.',
        fix:
          n.kind === 'zone'
            ? 'Raise the pool max / wire an Autoscaler to it.'
            : `Upgrade it (~${fmtMoney(Math.round(spec.cost * 0.8))}) or add a second one behind a Load Balancer.`,
      });
    } else if (s.util > 0.85) {
      const isDb = DB_KINDS.has(n.kind);
      f.push({
        severity: 'warn',
        title: `${nameOf(n)} at ${Math.round(s.util * 100)}% — the latency knee is near`,
        detail: 'Past ~85% utilization queue wait explodes (util³). Real teams scale at 60–75%.',
        fix: isDb
          ? `Shield it: a cache absorbs ~85% of reads (Redis ${fmtMoney(SPECS.redis.cost)}), replicas fan the rest out.`
          : 'Add capacity now, while it is cheap boredom instead of an incident.',
      });
    }
  }

  // --- database without cache ------------------------------------------------
  const dbs = nodes.filter((n) => DB_KINDS.has(n.kind) && n.kind !== 'replica');
  const caches = nodes.filter((n) => ['redis', 'memcached'].includes(n.kind) && !n.disabled);
  const hotDb = dbs.find((n) => (stats(n.id)?.util ?? 0) > 0.6);
  if (hotDb && caches.length === 0 && st.research.includes('caching')) {
    f.push({
      severity: 'warn',
      title: `${nameOf(hotDb)} takes every read raw`,
      detail: 'Most database load is usually cacheable reads — the cheapest capacity you can buy.',
      fix: `App → Redis → ${nameOf(hotDb)}: ~85% of reads never touch the primary (${fmtMoney(SPECS.redis.cost)}).`,
    });
  }

  // --- cache too cold ---------------------------------------------------------
  for (const c of caches) {
    const s = stats(c.id);
    if (s && s.hitPct >= 0 && s.hitPct < 0.35 && s.inRps > 2) {
      // warming up is expected, not a defect — call it what it is
      if (s.warm01 >= 0 && s.warm01 < 0.9) {
        f.push({
          severity: 'tip',
          title: `${nameOf(c)} is still warming (${Math.round(s.warm01 * 100)}%)`,
          detail: 'A freshly deployed cache starts empty; hit rate climbs as traffic fills it.',
          fix: 'Nothing to fix — but note the origin eats the misses until it warms. Provision for cold starts.',
        });
      } else {
        f.push({
          severity: 'tip',
          title: `${nameOf(c)} hit rate is only ${Math.round(s.hitPct * 100)}%`,
          detail: 'A cold or undersized cache passes misses straight through.',
          fix: 'Upgrade the cache, or check that reads actually route through it.',
        });
      }
    }
  }

  // --- connection-pool pressure --------------------------------------------------
  if (!st.research.includes('pooling')) {
    for (const n of nodes) {
      const s = stats(n.id);
      if (s && s.connLimit > 0 && s.conns > s.connLimit) {
        f.push({
          severity: 'warn',
          title: `${nameOf(n)} is over-subscribed: ${s.conns} clients / pool of ${s.connLimit}`,
          detail: 'Each wired client (× its instances) holds connections; past the pool they cost latency and capacity.',
          fix: 'Research Connection Pooling (PgBouncer), add a read replica, or upgrade the database.',
        });
      }
    }
  }

  // --- single-primary write ceiling → sharding --------------------------------------
  for (const n of nodes) {
    if (!['postgres', 'mysql', 'mssql', 'mongo'].includes(n.kind) || n.disabled) continue;
    const s = stats(n.id);
    if (!s || s.util < 0.88 || (s.classIn?.[3] ?? 0) < 2) continue;
    if (nodes.some((x) => x.kind === 'shardrouter' && !x.disabled)) continue;
    f.push({
      severity: 'warn',
      title: `${nameOf(n)} is write-bound — the last scaling wall`,
      detail: 'Caches and replicas only absorb reads; every write still lands on this single primary.',
      fix: st.research.includes('sharding')
        ? `Wire App → Shard Router → 2+ primaries to split the write stream (${fmtMoney(SPECS.shardrouter.cost)}).`
        : 'Research Sharding to split writes across multiple primaries.',
    });
    break; // one warning covers the pattern
  }

  // --- replication lag -------------------------------------------------------------
  for (const n of nodes) {
    const s = stats(n.id);
    if (s && s.replLagSec > BAL.replLagStaleSec) {
      f.push({
        severity: 'warn',
        title: `${nameOf(n)} lags ${s.replLagSec.toFixed(1)}s behind its primary`,
        detail: 'The primary is writing faster than the replica can replay — reads here return stale data (worth less).',
        fix: 'Ease write pressure on the primary: queue the bursts, or upgrade it.',
      });
    }
  }

  // --- single ingress bottleneck ----------------------------------------------
  const src = nodes.find((n) => n.kind === 'users');
  if (src) {
    const firstHops = st.edges.filter((e) => e.source === src.id).map((e) => e.target);
    if (firstHops.length === 1) {
      const hop = nodes.find((n) => n.id === firstHops[0]);
      const s = hop && stats(hop.id);
      if (hop && s && s.util > 0.6 && hop.kind !== 'lb' && hop.kind !== 'haproxy' && hop.kind !== 'cdn' && hop.kind !== 'apigw') {
        f.push({
          severity: 'warn',
          title: `Everything enters through one ${nameOf(hop)}`,
          detail: 'A single warm front door is a single point of failure and a scaling ceiling.',
          fix: `Put a Load Balancer (${fmtMoney(SPECS.lb.cost)}) or HAProxy (${fmtMoney(SPECS.haproxy.cost)}) in front and add a sibling.`,
        });
      }
    }
  }

  // --- storage physics: data has gravity ------------------------------------------
  for (const n of nodes.filter((x) => DB_KINDS.has(x.kind) && x.kind !== 'replica')) {
    const s = stats(n.id);
    if (!s || s.dataGb < 0 || s.diskGb <= 0) continue;
    const fill = s.dataGb / s.diskGb;
    if (fill > 0.7) {
      f.push({
        severity: fill > 0.9 ? 'crit' : 'warn',
        title: `${nameOf(n)} is ${Math.round(fill * 100)}% full (${Math.round(s.dataGb)}/${Math.round(s.diskGb)} GB)`,
        detail: fill > 0.9 ? 'At 100% the disk refuses writes outright — that is a full outage for anything that saves data.' : 'Queries are already slowing as the data outgrows the box.',
        fix: 'Upgrade it (bigger disk + more comfort), or shard — a Shard Router splits the GROWTH itself, not just the queries.',
      });
      break; // the worst one is enough
    }
  }

  // --- observability ------------------------------------------------------------
  if (!nodes.some((n) => n.kind !== 'zone' && specOf(n.kind).special === 'metrics' && !n.disabled)) {
    f.push({
      severity: 'warn',
      title: 'No metrics node deployed',
      detail: 'You cannot fix what you cannot see — and you are earning zero Research Points.',
      fix: `Prometheus (${fmtMoney(SPECS.prometheus.cost)}) turns served traffic into RP and unlocks overlays.`,
    });
  }

  // --- money leaks ---------------------------------------------------------------
  const idle = nodes.filter((n) => {
    const s = stats(n.id);
    const spec = specOf(n.kind, n.zone?.template);
    return s && spec.capacity > 0 && spec.opCost > 0.04 && s.util < 0.05 && s.inRps < 0.2 && !n.disabled;
  });
  if (idle.length > 0) {
    const burn = idle.reduce((a, n) => a + (stats(n.id)?.costRate ?? 0), 0);
    f.push({
      severity: 'tip',
      title: `${idle.length} node(s) idling — ${fmtMoney(burn)}/s of pure burn`,
      detail: `${idle.slice(0, 3).map(nameOf).join(', ')}${idle.length > 3 ? '…' : ''} serve almost nothing.`,
      fix: 'Power them off (idle nodes cost 15%), bulldoze for salvage, or route traffic through them.',
    });
  }
  if (st.ar > 400 && !nodes.some((n) => n.kind === 'stripe')) {
    f.push({
      severity: 'tip',
      title: `${fmtMoney(st.ar)} stuck in accounts receivable`,
      detail: 'Without automated billing, revenue settles slowly.',
      fix: `Invoice from the dashboard — or deploy Stripe Billing (${fmtMoney(SPECS.stripe.cost)}) and never click again.`,
    });
  }

  // --- automation gaps -------------------------------------------------------------
  for (const z of nodes.filter((n) => n.kind === 'zone')) {
    const wired = st.edges.some((e) => e.target === z.id && e.targetHandle === 'ctl-in');
    if (!wired && st.research.includes('autoscaling')) {
      f.push({
        severity: 'tip',
        title: `${z.zone?.name ?? 'A zone'} scales by hand`,
        detail: 'Manual pools miss spikes and hoard instances at 3am.',
        fix: `Wire an Autoscaler's control port to it (${fmtMoney(SPECS.autoscaler.cost)}).`,
      });
      break; // one is enough
    }
  }
  const unwiredAuto = nodes.find(
    (n) => n.kind === 'autoscaler' && !st.edges.some((e) => e.source === n.id),
  );
  if (unwiredAuto) {
    f.push({
      severity: 'warn',
      title: 'An Autoscaler is wired to nothing',
      detail: `${nameOf(unwiredAuto)} bills ${fmtMoney(specOf('autoscaler').opCost)}/s to scale... nothing.`,
      fix: 'Drag from it onto a Zone (wire mode auto-matches the control port).',
    });
  }

  // --- spot without headroom ----------------------------------------------------------
  const spotCompute = nodes.filter((n) => n.kind === 'spot' || (n.kind === 'zone' && n.zone?.template === 'spot'));
  const steadyCompute = nodes.filter((n) => ['app', 'lambda'].includes(n.kind) || (n.kind === 'zone' && n.zone?.template === 'app'));
  if (spotCompute.length > 0 && steadyCompute.length === 0) {
    f.push({
      severity: 'warn',
      title: 'The whole compute tier is Spot',
      detail: `Spot capacity gets reclaimed for ~${BAL.spotReclaimSec}s every few minutes — with no on-demand floor, that window is an outage.`,
      fix: 'Keep at least one on-demand App Server (or N+1 spot headroom) so reclaims are boring.',
    });
  }

  // --- latency budget --------------------------------------------------------------------
  if (live.gauges.p95 > BAL.slaTargetMs && live.gauges.served > 2) {
    const worst = nodes
      .filter((n) => (stats(n.id)?.latencyMs ?? 0) > 40 && (stats(n.id)?.inRps ?? 0) > 0.5)
      .sort((a, b) => (stats(b.id)?.latencyMs ?? 0) - (stats(a.id)?.latencyMs ?? 0))[0];
    if (worst) {
      f.push({
        severity: live.gauges.p95 > 700 ? 'crit' : 'warn',
        title: `p95 is ${fmtNum(live.gauges.p95)}ms — revenue is decaying`,
        detail: `Biggest contributor right now: ${nameOf(worst)} at ${fmtNum(stats(worst.id)!.latencyMs)}ms (mostly queue wait).`,
        fix: 'Add capacity at the slow hop, or serve that class earlier (cache/edge).',
      });
    }
  }

  if (f.length === 0) {
    f.push({
      severity: 'tip',
      title: 'Clean bill of health',
      detail: 'No saturation, no leaks, no misconfigurations the review could find.',
      fix: 'Stress it: launch a bigger tier, take a contract, or run a chaos drill.',
    });
  }

  const order = { crit: 0, warn: 1, tip: 2 } as const;
  return f.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 6);
}
