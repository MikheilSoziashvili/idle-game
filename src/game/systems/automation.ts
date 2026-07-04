import { BAL } from '../engine/balance';
import type { LogSev } from '../engine/types';
import type { GameStore } from '../state/store';
import { readyInstances, zoneHasController, zoneSpawnCost } from './zoning';

// The Autoscaler: the anti-grind mechanic. Evaluated once per sim-second.
// A zone with an attached (wired) autoscaler tracks targetUtil by adding
// instances (paid, with boot delay) and removing them after a sustained lull.

interface ZoneRuntime {
  lastUpAt: number;
  lastDownAt: number;
  underSince: number; // simTime when the zone first dipped under the scale-in band
}

export class AutoscalerSystem {
  private runtime = new Map<string, ZoneRuntime>();

  evaluate(
    store: { getState: () => GameStore },
    utilOf: (nodeId: string) => number,
    log: (sev: LogSev, msg: string) => void,
    onAction: () => void,
  ) {
    const s = store.getState();
    const t = s.simTime;
    const bootTime = s.nodes.some((n) => n.kind === 'cicd' && !n.disabled) ? BAL.bootTimeCicdSec : BAL.bootTimeSec;

    for (const node of s.nodes) {
      if (node.kind !== 'zone' || !node.zone || node.disabled) continue;
      if (!zoneHasController(s, node.id, 'autoscaler')) continue;
      const zone = node.zone;
      const util = utilOf(node.id);
      const rt = this.runtime.get(node.id) ?? { lastUpAt: -999, lastDownAt: -999, underSince: -1 };

      const region = s.regions.find(
        (r) => node.x + 90 >= r.x && node.x + 90 <= r.x + r.w && node.y + 40 >= r.y && node.y + 40 <= r.y + r.h,
      );
      const aggro = region?.policies.aggressiveScale ?? false;
      const upCd = BAL.zoneUpCooldown * (aggro ? BAL.aggressiveCooldownMult : 1);
      const downCd = BAL.zoneDownCooldown * (aggro ? BAL.aggressiveCooldownMult : 1);

      // Scale OUT: past target band, cooldown elapsed, cash available.
      if (util > zone.targetUtil + 0.1 && zone.instances < zone.max && t - rt.lastUpAt > upCd) {
        const overload = util / Math.max(0.05, zone.targetUtil);
        const want = Math.min(zone.max - zone.instances, Math.max(1, Math.ceil((overload - 1) * zone.instances * 0.7)));
        const cost = zoneSpawnCost(zone, want);
        if (s.sandbox || s.cash >= cost) {
          const stamps = Array.from({ length: want }, () => t + bootTime);
          // prune stale boot stamps while we're here
          const freshQueue = zone.bootQueue.filter((b) => b > t);
          s.patchZone(node.id, { instances: zone.instances + want, bootQueue: [...freshQueue, ...stamps] }, { payFor: s.sandbox ? 0 : cost });
          rt.lastUpAt = t;
          rt.underSince = -1;
          log('scale', `autoscaler: ${zone.name} scale-out +${want} → ${zone.instances + want} (util ${Math.round(util * 100)}%, $${cost})`);
          onAction();
        } else {
          log('warn', `autoscaler: ${zone.name} wants +${want} instance(s) but cash is short ($${cost})`);
          rt.lastUpAt = t; // don't spam every second
        }
      }

      // Scale IN: sustained lull below the band.
      const lullBand = zone.targetUtil - 0.2;
      if (util < lullBand && zone.instances > zone.min) {
        if (rt.underSince < 0) rt.underSince = t;
        if (t - rt.underSince > BAL.zoneDownGraceSec && t - rt.lastDownAt > downCd) {
          const freshQueue = zone.bootQueue.filter((b) => b > t);
          // Prefer cancelling a booting instance; otherwise retire a live one.
          const newQueue = freshQueue.length > 0 ? freshQueue.slice(0, -1) : freshQueue;
          s.patchZone(node.id, { instances: zone.instances - 1, bootQueue: newQueue });
          rt.lastDownAt = t;
          log('scale', `autoscaler: ${zone.name} scale-in −1 → ${zone.instances - 1} (util ${Math.round(util * 100)}%)`);
          onAction();
        }
      } else {
        rt.underSince = -1;
      }

      this.runtime.set(node.id, rt);
    }
  }

  /** K8s auto-heal: regen health on zones with an attached cluster. */
  static healRate(s: GameStore, zoneId: string): number {
    return zoneHasController(s, zoneId, 'k8s') ? BAL.k8sHealPerSec : 0;
  }
}

export { readyInstances };
