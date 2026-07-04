import { BAL } from '../engine/balance';
import type { ContractInstance, Gauges } from '../engine/types';

// ---------------------------------------------------------------------------
// SLA contracts: rotating short-term deals evaluated against live gauges,
// exactly like case objectives (hold a metric continuously for holdSec).
// Offers scale off the player's CURRENT numbers so they're always "a stretch,
// not a fantasy". Accepting starts the deadline; failing costs reputation.
// ---------------------------------------------------------------------------

interface ContractTemplate {
  key: string;
  client: string;
  label: (v: number) => string;
  metric: ContractInstance['metric'];
  op: '<' | '>';
  // target value from current gauges (stretchy but reachable)
  value: (g: Gauges) => number;
  holdSec: number;
  // rewards scale with current revenue rate so they stay relevant all game
  rewardCash: (g: Gauges) => number;
  rewardRp: (g: Gauges) => number;
  repBonus: number;
  minServed?: number; // don't offer before this scale
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const money = (n: number) => Math.max(50, Math.round(n / 10) * 10);

const TEMPLATES: ContractTemplate[] = [
  {
    key: 'uptime-pilot',
    client: 'medledger — enterprise pilot',
    label: (v) => `Hold ≥ ${v}% uptime for 3 minutes`,
    metric: 'uptime',
    op: '>',
    value: (g) => (g.uptime >= 99.5 ? 99.9 : 99.5),
    holdSec: 180,
    rewardCash: (g) => money(240 + g.revenuePerSec * 45),
    rewardRp: () => 6,
    repBonus: 4,
  },
  {
    key: 'latency-sla',
    client: 'tradefloor — latency-sensitive API',
    label: (v) => `Keep p95 under ${v}ms for 2 minutes`,
    metric: 'p95',
    op: '<',
    value: (g) => round5(Math.max(60, Math.min(250, g.p95 * 0.8))),
    holdSec: 120,
    rewardCash: (g) => money(200 + g.revenuePerSec * 35),
    rewardRp: () => 8,
    repBonus: 3,
  },
  {
    key: 'load-test',
    client: 'presskit — launch load test',
    label: (v) => `Serve ≥ ${v} rps for 60s`,
    metric: 'served',
    op: '>',
    value: (g) => round5(Math.max(12, g.served * 1.25)),
    holdSec: 60,
    rewardCash: (g) => money(180 + g.revenuePerSec * 30),
    rewardRp: () => 10,
    repBonus: 3,
    minServed: 8,
  },
  {
    key: 'finops-audit',
    client: 'burnrate.vc — FinOps audit',
    label: (v) => `Run cost under $${v}/s for 90s`,
    metric: 'cost',
    op: '<',
    value: (g) => Math.max(0.3, Math.round(g.costPerSec * 0.85 * 10) / 10),
    holdSec: 90,
    rewardCash: (g) => money(160 + g.costPerSec * 120),
    rewardRp: () => 6,
    repBonus: 2,
    minServed: 5,
  },
  {
    key: 'zero-drop',
    client: 'cartel.shop — flash-sale window',
    label: () => 'Under 0.2 drops/s for 2 minutes',
    metric: 'dropped',
    op: '<',
    value: () => 0.2,
    holdSec: 120,
    rewardCash: (g) => money(220 + g.revenuePerSec * 40),
    rewardRp: () => 7,
    repBonus: 4,
    minServed: 6,
  },
  {
    key: 'margin-call',
    client: 'the board — margin review',
    label: (v) => `Hold profit above $${v}/s for 2 minutes`,
    metric: 'profit',
    op: '>',
    value: (g) => Math.max(1, Math.round(g.profitPerSec * 1.2)),
    holdSec: 120,
    rewardCash: (g) => money(200 + g.profitPerSec * 25),
    rewardRp: () => 8,
    repBonus: 2,
    minServed: 5,
  },
];

let contractCounter = 1;

/** Roll a fresh set of offers from the current gauges. */
export function rollContractOffers(g: Gauges, simTime: number): ContractInstance[] {
  const eligible = TEMPLATES.filter((t) => (t.minServed ?? 0) <= g.served);
  const pool = [...eligible];
  const offers: ContractInstance[] = [];
  while (offers.length < BAL.contractOfferCount && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    const t = pool.splice(i, 1)[0];
    const value = t.value(g);
    offers.push({
      id: `c${contractCounter++}-${Math.floor(simTime)}`,
      key: t.key,
      client: t.client,
      label: t.label(value),
      metric: t.metric,
      op: t.op,
      value,
      holdSec: t.holdSec,
      deadlineAt: 0, // set on accept
      offerExpiresAt: simTime + BAL.contractRefreshSec,
      rewardCash: t.rewardCash(g),
      rewardRp: t.rewardRp(g),
      repBonus: t.repBonus,
      repPenalty: BAL.contractRepPenalty,
      held: 0,
    });
  }
  return offers;
}
