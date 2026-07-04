import { BAL } from './balance';
import { TIERS } from '../catalog/tiers';
import { caseById } from '../catalog/casestudies';
import type { GameStore } from '../state/store';
import type { GlobalMods } from './types';

// Demand + value blending, and the global modifier computation.
// Each launched tier contributes (baseRps × company scale) of its own mix;
// the blended per-class $ value weights each tier by its share of that class.

export interface DemandProfile {
  offered: number; // total req/s entering the platform this tick
  mix: number[]; // per-class fractions
  value: number[]; // blended $ per served request per class
  latSensitive: boolean;
  atMarketCap: boolean;
}

export function computeDemand(st: GameStore, eventDemandMult: number, mods: GlobalMods): DemandProfile {
  const mix = [0, 0, 0, 0, 0];
  const valueWeighted = [0, 0, 0, 0, 0];
  let totalBase = 0;
  let latSensitive = false;
  for (const id of st.tiers) {
    const tier = TIERS[id - 1];
    if (!tier) continue;
    totalBase += tier.baseRps;
    if (tier.latencySensitive) latSensitive = true;
    for (let c = 0; c < 5; c++) {
      mix[c] += tier.baseRps * tier.mix[c];
      valueWeighted[c] += tier.baseRps * tier.mix[c] * tier.value[c];
    }
  }
  const value = [0, 0, 0, 0, 0];
  for (let c = 0; c < 5; c++) {
    value[c] = mix[c] > 0 ? valueWeighted[c] / mix[c] : 0;
    mix[c] = totalBase > 0 ? mix[c] / totalBase : 0;
  }

  // Case studies pin demand: fixed base rps, scripted spikes multiply it.
  if (st.caseId) {
    const def = caseById.get(st.caseId);
    if (def) {
      return { offered: def.baseRps * eventDemandMult, mix, value, latSensitive, atMarketCap: false };
    }
  }

  const round = Math.min(st.spTotal >= 0 ? roundIndex(st.spTotal) : 0, BAL.rpsCaps.length - 1);
  const rawOffered = st.sandbox
    ? st.sandboxDemand
    : st.scale * totalBase * mods.demandMult;
  const capped = Math.min(rawOffered * eventDemandMult, st.sandbox ? Infinity : BAL.rpsCaps[round] * eventDemandMult);
  return {
    offered: capped,
    mix,
    value,
    latSensitive,
    atMarketCap: !st.sandbox && rawOffered >= BAL.rpsCaps[round] * 0.98,
  };
}

export function roundIndex(spTotal: number): number {
  let r = 0;
  for (let i = 0; i < BAL.roundSpGate.length; i++) if (spTotal >= BAL.roundSpGate[i]) r = i;
  return r;
}

export function computeMods(st: GameStore): GlobalMods {
  const activeKinds = new Set(st.nodes.filter((n) => !n.disabled).map((n) => n.kind));
  const hasCicd = activeKinds.has('cicd');
  const hasK8s = activeKinds.has('k8s');
  const hasStripe = activeKinds.has('stripe');
  const hasGrafana = activeKinds.has('grafana');
  const mesh = st.research.includes('mesh');
  const obs2 = st.research.includes('obs2');
  return {
    capacityMult:
      (1 + BAL.perkThroughput * st.spSpentOn.throughput) * (mesh ? BAL.meshCapacityMult : 1),
    revenueMult: (1 + BAL.perkRevenue * st.spSpentOn.revenue) * (hasStripe ? BAL.stripeRevenueBonus : 1),
    costMult: Math.max(0.3, 1 - BAL.perkEfficiency * st.spSpentOn.efficiency),
    rpMult: (hasGrafana ? BAL.grafanaRpMult : 1) * (obs2 ? BAL.obs2RpMult : 1),
    bootTime: hasCicd ? BAL.bootTimeCicdSec : BAL.bootTimeSec,
    upgradeDiscount: hasCicd ? BAL.cicdUpgradeDiscount : 1,
    smartSplitAll: mesh,
    latencyMult: 1,
    demandMult: 1 + BAL.perkMomentumDemand * st.spSpentOn.momentum,
    hasCicd,
    hasK8s,
    hasStripe,
    hasGrafana,
  };
}
