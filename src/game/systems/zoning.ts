import type { NodeKind, PlacedNode, ZoneState } from '../engine/types';
import { SPECS } from '../catalog/nodes';
import { isKindUnlocked, type GameStore } from '../state/store';

// Declarative zoning helpers: a Zone is one canvas node whose capacity is
// (ready instances × unit capacity). Instances boot with a delay (bootQueue
// holds simTime stamps); autoscalers grow/shrink `instances` inside min/max.

export function zoneUnitKinds(
  s: Pick<GameStore, 'sandbox' | 'research' | 'allTimeRev' | 'lifetimeRev'>,
): Exclude<NodeKind, 'zone'>[] {
  return (Object.keys(SPECS) as Exclude<NodeKind, 'zone'>[]).filter(
    (k) => SPECS[k].zoneUnit && isKindUnlocked(s, k),
  );
}

/** Instances actually serving (provisioned minus still-booting). */
export function readyInstances(zone: ZoneState, simTime: number): number {
  const booting = zone.bootQueue.filter((t) => t > simTime).length;
  return Math.max(0, zone.instances - booting);
}

export function bootingInstances(zone: ZoneState, simTime: number): number {
  return Math.min(zone.instances, zone.bootQueue.filter((t) => t > simTime).length);
}

/** Cash cost to add `n` instances to a zone. */
export function zoneSpawnCost(zone: ZoneState, n: number, discountMult = 1): number {
  const unit = SPECS[zone.template].cost;
  return Math.round(unit * 0.85 * n * discountMult);
}

/** True if this node is a zone with an attached control edge from `kind`. */
export function zoneHasController(
  s: Pick<GameStore, 'nodes' | 'edges'>,
  zoneId: string,
  kind: 'autoscaler' | 'k8s',
): boolean {
  return s.edges.some((e) => {
    if (e.target !== zoneId || e.targetHandle !== 'ctl-in') return false;
    const src = s.nodes.find((n) => n.id === e.source);
    return src?.kind === kind && !src.disabled;
  });
}

export function zoneLabel(node: PlacedNode): string {
  if (!node.zone) return '';
  return node.zone.name;
}
