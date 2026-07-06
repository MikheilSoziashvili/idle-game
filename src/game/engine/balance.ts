// ============================================================================
// balance.ts — single source of truth for every tunable number in UPTIME.
// If you're tuning the game, you should rarely need to leave this file.
// ============================================================================

export const BAL = {
  version: 1,

  // --- simulation loop -------------------------------------------------------
  tickHz: 10, // fixed timestep, ticks per sim-second
  maxCatchupSec: 4, // cap on wall-clock catch-up to avoid death spirals

  // --- starting state --------------------------------------------------------
  startCash: 250,
  startRep: 62,
  startScale: 1,

  // --- company growth --------------------------------------------------------
  // Company scale follows a logistic curve toward the current funding-round cap:
  //   scale' = growthRate * repFactor(rep) * scale * (1 - scale/scaleCap)
  // Traffic offered = scale * sum(launched tier baseRps), clamped by rpsCap.
  growthRate: 0.011, // per sim-second at repFactor 1 (early doubling ~90s)
  scaleCaps: [40, 150, 600, 2500, 10000, 50000, 200000, 800000], // per funding round index
  rpsCaps: [260, 900, 3200, 12000, 45000, 160000, 520000, 1600000], // hard market cap per round
  repFactor: (rep: number) => 0.22 + 1.28 * Math.pow(Math.max(0, rep) / 100, 1.4),

  // --- latency & backpressure ------------------------------------------------
  // Effective node latency = base * (1 + K * util^POW) + queueWaitMs.
  // Requests whose accumulated latency exceeds requestTimeoutMs are dropped.
  latCongestionK: 2.0,
  latCongestionPow: 3,
  requestTimeoutMs: 5000,
  utilSmoothing: 0.25, // EMA alpha per tick for node utilization
  p95WindowSec: 3,

  // Revenue decays with per-request latency: full value below knee, floor at zero-point.
  latValueKneeMs: 220,
  latValueZeroMs: 2600,
  latValueFloor: 0.3,
  latSensitiveKneeMs: 140, // knee when a latency-sensitive tier (realtime) is live
  slaTargetMs: 250, // dashboard target notch

  // --- uptime & reputation ---------------------------------------------------
  // Rep chases a target derived from uptime (90%→0 rep, 99.9%→100 rep).
  // Bleed is ~4x faster than heal: outages scar, recovery takes minutes.
  uptimeEmaTau: 22, // seconds, EMA half-ish window for served/offered ratio
  repHealRate: 0.022, // fraction of (target-rep) per second when recovering
  repBleedRate: 0.09, // when uptime target is below current rep
  repShedScale: 0.15, // shed (429) is 85% gentler than a hard drop
  repIncidentDrain: 0.12, // rep/s while an incident is active
  repMin: 4,
  repMax: 100,

  // --- economy ---------------------------------------------------------------
  arDrainPerSec: 0.028, // fraction of AR settling to cash per second (tau ~36s)
  stripeRevenueBonus: 1.02,
  refundRatio: 0.5,
  bulkUpgradeMax: 50,
  offlineEfficiency: 0.5,
  offlineCapHours: 8,
  offlineMinSec: 90,
  autosaveSec: 10,

  // --- research points -------------------------------------------------------
  // Metrics nodes sample traffic: rp/s = (base*sqrt(served)*sqrt(Σweight) + perLevel*Σ(level·weight)) * mults
  // Tuned scarce on purpose: the tree is wide, so every research is a real choice.
  rpBase: 0.075,
  rpPerPromLevel: 0.03,
  grafanaRpMult: 1.5,
  obs2RpMult: 1.4,
  datadogRpWeight: 2, // Datadog samples 2× better than self-hosted Prometheus — for a SaaS bill

  // --- upgrades --------------------------------------------------------------
  capPerLevel: 1.65, // capacity multiplier per level above 1
  opCostPerLevel: 1.45,
  upgCostBase: 0.8, // upgrade to level n+1 costs cost*base*growth^(n-1)
  upgCostGrowth: 2.1,
  maxLevel: 6,

  // --- zones & provisioning --------------------------------------------------
  zoneSpawnDiscount: 0.85, // instance cost vs. placing the node by hand
  bootTimeSec: 10,
  bootTimeCicdSec: 3,
  zoneUpCooldown: 8, // s between autoscale-up actions per zone
  zoneDownCooldown: 24,
  zoneDownGraceSec: 20, // must be under-utilized this long before scale-in
  aggressiveCooldownMult: 0.45,
  aggressiveOpCostMult: 1.1,

  // --- spot instances ----------------------------------------------------------
  // Spot boxes are ~60% cheaper but get reclaimed on a rolling cycle: each node
  // goes dark for reclaimSec once per cycleSec (offset by node id, so a fleet
  // never loses everything at once). N+1 spot capacity is the whole lesson.
  spotCycleSec: 210,
  spotReclaimSec: 12,

  // --- singleton node effects --------------------------------------------------
  k8sZoneCostMult: 0.8, // k8s bin-packing discount on attached zones
  k8sHealPerSec: 0.25, // health regen for attached zones after incidents
  k8sHealDelay: 4,
  meshCapacityMult: 1.05,
  cicdUpgradeDiscount: 0.88,

  // --- region policies ---------------------------------------------------------
  regionCacheTtlHitBonus: 0.08,
  regionRedundancyCostMult: 1.25,
  regionAggressiveCostMult: 1.1,

  // --- prestige ----------------------------------------------------------------
  // Scale Points pending = floor(sqrt(lifetimeRevenue / spDivisor))
  spDivisor: 2500,
  prestigeMinSp: 2,
  roundNames: ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E', 'IPO'],
  roundSpGate: [0, 2, 8, 20, 50, 120, 260, 550], // total SP banked to reach round i
  perkMaxLevel: 10,
  // Perk effect per level:
  perkThroughput: 0.08,
  perkRevenue: 0.08,
  perkEfficiency: 0.06, // opCost reduction
  perkMomentumCash: 750,
  perkMomentumDemand: 0.06,

  // --- events ------------------------------------------------------------------
  firstEventAt: 240, // scripted gentle spike
  eventMinGap: 160,
  eventMaxGap: 340,
  incidentsAfterRevenue: 1800, // negative events only after some lifetime revenue
  spikeWarnSec: 15,
  spikeMult: [2.2, 3.4] as [number, number],
  spikeDurSec: [45, 90] as [number, number],
  dbSlowCapMult: 0.45,
  dbSlowDurSec: 40,
  outageDurSec: 25,
  outageShare: 0.3, // share of nodes hit when no regions exist
  depFailLatencyMs: 90,
  depFailDurSec: 35,
  badDeployHealth: 0.25,

  // --- SLA contracts -----------------------------------------------------------
  contractRefreshSec: 300, // new offers roll onto the board
  contractOfferCount: 3,
  contractDeadlineSec: 420, // time to complete once accepted
  contractRepPenalty: 6,

  // --- daily chaos drill ---------------------------------------------------------
  drillDurSec: 180,
  drillPassDropShare: 0.03,
  drillBaseRp: 8,
  drillStreakRp: 4, // × min(streak, 15)

  // --- node mastery ---------------------------------------------------------------
  masteryThresholds: [1e3, 1e5, 1e7] as const, // bronze / silver / gold (lifetime served per kind)
  masteryCapPerTier: 0.02, // +2% capacity per tier for that kind

  // --- adaptive pressure -----------------------------------------------------------
  // Event pacing reads the player's state: struggling → longer gaps & gentler
  // spikes; cruising → shorter gaps. Invisible difficulty, visible fairness.
  pressureLowUptime: 97.5,
  pressureLowCash: 80,
  pressureHighUptime: 99.7,
  pressureHighCash: 2000,
  pressureEasyGapMult: 1.6,
  pressureHardGapMult: 0.72,
  pressureEasySpikeCap: 2.4,

  // --- realism layer -----------------------------------------------------------
  // Cold caches: a freshly booted cache serves a fraction of its nominal hit
  // rate and warms toward 100% while traffic flows (cache fill).
  cacheWarmSec: 40, // seconds of live traffic to fully warm
  cacheColdFloor: 0.25, // fraction of nominal hit rate when stone cold
  // Replication lag: pushing a primary's write utilization past the knee makes
  // its replicas fall behind; stale reads earn less (users see old data).
  replLagRiseUtil: 0.7, // primary util above which lag grows
  replLagRisePerSec: 0.5, // lag gained per second at util 1.0
  replLagDecayPerSec: 0.4, // lag shed per second when the primary is calm
  replLagMaxSec: 8,
  replLagStaleSec: 2, // above this, replica reads count as stale
  replStaleValueMult: 0.85,
  // Connection-pool pressure: every distinct client (app box / zone instance)
  // holds connections; databases degrade past their pool size. The 'pooling'
  // research (PgBouncer) removes the penalty.
  dbConnBase: 6, // clients a level-1 database tolerates
  dbConnPerLevel: 3, // extra tolerated clients per level
  dbConnLatK: 0.9, // latency multiplier per 1.0 over-fraction
  dbConnCapK: 0.35, // capacity lost per 1.0 over-fraction
  dbConnCapFloor: 0.55, // capacity never drops below this fraction
  // Retry storms: a timed-out user request comes BACK as a retry — overload
  // begets overload. Shedding at the door (429s) avoids timeouts entirely.
  retryEchoFactor: 0.3, // share of timed-out non-job requests that retry
  // Health checks: smart balancers pull targets below this health from rotation.
  // Round-robin splitters (DNS, HAProxy default) keep sending — that's the trade.
  healthCheckMin: 0.5,
  sparkLen: 48, // per-node served-rps history samples (1 Hz)

  // --- first-failure insurance -----------------------------------------------------
  insuranceWindowSec: 30,

  // --- rival ------------------------------------------------------------------------
  rivalGrowth: 0.0045, // logistic rate per second toward its round target
  rivalTargetShare: 0.9, // of the current round's rps cap
  rivalBeatSp: 2, // bonus SP when raising while ahead of the rival

  // --- misc UI ----------------------------------------------------------------
  logCap: 250,
  toastSec: 6,
  edgeMaxDots: 4,
  hintCooldownSec: 30,
} as const;

// --- derived helpers (import these rather than re-deriving) -------------------

export function levelCapMult(level: number): number {
  return Math.pow(BAL.capPerLevel, level - 1);
}
export function levelOpCostMult(level: number): number {
  return Math.pow(BAL.opCostPerLevel, level - 1);
}
/** Cash cost to go from `level` to `level+1` for a node with base cost `cost`. */
export function upgradeCost(baseCost: number, level: number, discount = 1): number {
  return Math.round(baseCost * BAL.upgCostBase * Math.pow(BAL.upgCostGrowth, level - 1) * discount);
}
/** Total sunk cost for refund purposes if bought at base and upgraded to `level`. */
export function totalSpentAtLevel(baseCost: number, level: number): number {
  let total = baseCost;
  for (let l = 1; l < level; l++) total += upgradeCost(baseCost, l);
  return total;
}
/** Revenue multiplier for a request served at `latencyMs`. */
export function latencyValueMult(latencyMs: number, sensitive: boolean): number {
  const knee = sensitive ? BAL.latSensitiveKneeMs : BAL.latValueKneeMs;
  if (latencyMs <= knee) return 1;
  const t = Math.min(1, (latencyMs - knee) / (BAL.latValueZeroMs - knee));
  return 1 - t * (1 - BAL.latValueFloor);
}
/** Pending scale points for a given lifetime revenue. */
export function pendingSp(lifetimeRevenue: number): number {
  return Math.floor(Math.sqrt(Math.max(0, lifetimeRevenue) / BAL.spDivisor));
}
/** Funding round index for a total banked SP. */
export function roundForSp(totalSp: number): number {
  let r = 0;
  for (let i = 0; i < BAL.roundSpGate.length; i++) if (totalSp >= BAL.roundSpGate[i]) r = i;
  return r;
}
export function perkCost(level: number): number {
  return level + 1; // 1, 2, 3 ... SP per level
}
/** Mastery tier (0-3) for a kind's lifetime served count. */
export function masteryTier(served: number): number {
  let t = 0;
  for (const th of BAL.masteryThresholds) if (served >= th) t++;
  return t;
}
export const MASTERY_NAMES = ['', 'bronze', 'silver', 'gold'] as const;

export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `$${(n / 1e3).toFixed(1)}k`;
  if (abs >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}
export function fmtNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (abs >= 100) return `${Math.round(n)}`;
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(1);
}
