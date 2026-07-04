import type { PlacedEdge, PlacedNode } from './types';

// One-click auto-layout: BFS layering from the traffic source, columns left to
// right, rows packed per column. Deliberately simple — clean diagrams, no deps.

const COL_W = 270;
const ROW_H = 140;

export function computeAutoLayout(nodes: PlacedNode[], edges: PlacedEdge[]): { id: string; x: number; y: number }[] {
  if (nodes.length === 0) return [];
  const depth = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.source)?.push(e.target);

  const source = nodes.find((n) => n.kind === 'users');
  const queue: string[] = [];
  if (source) {
    depth.set(source.id, 0);
    queue.push(source.id);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const next of adj.get(id) ?? []) {
      if (!depth.has(next) || depth.get(next)! < d + 1) {
        // longest-path layering reads better for pipelines; cap to avoid cycles
        if ((depth.get(next) ?? -1) >= d + 1 || d + 1 > nodes.length) continue;
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  // Orphans (observability singletons etc.) go to a parking column below-left.
  let parkRow = 0;
  const columns = new Map<number, PlacedNode[]>();
  const parked: PlacedNode[] = [];
  for (const n of nodes) {
    if (depth.has(n.id)) {
      const d = depth.get(n.id)!;
      if (!columns.has(d)) columns.set(d, []);
      columns.get(d)!.push(n);
    } else {
      parked.push(n);
    }
  }

  const moves: { id: string; x: number; y: number }[] = [];
  const baseX = 60;
  const baseY = 80;
  for (const [d, col] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    col.sort((a, b) => a.y - b.y);
    let y = baseY;
    for (const n of col) {
      moves.push({ id: n.id, x: baseX + d * COL_W, y });
      y += n.kind === 'zone' && n.zone ? Math.max(ROW_H, n.zone.h + 40) : ROW_H;
    }
  }
  for (const n of parked) {
    moves.push({ id: n.id, x: baseX, y: baseY + 3.2 * ROW_H + parkRow * 110 });
    parkRow++;
  }
  return moves;
}

/** Alignment guides while dragging: snap to other nodes' x/y within tolerance. */
export function alignmentGuides(
  draggedId: string,
  x: number,
  y: number,
  nodes: PlacedNode[],
  tol = 6,
): { v: number | null; h: number | null; snapX: number; snapY: number } {
  let v: number | null = null;
  let h: number | null = null;
  let snapX = x;
  let snapY = y;
  let bestDx = tol + 1;
  let bestDy = tol + 1;
  for (const n of nodes) {
    if (n.id === draggedId || n.kind === 'zone') continue;
    const dx = Math.abs(n.x - x);
    const dy = Math.abs(n.y - y);
    if (dx <= tol && dx < bestDx) {
      bestDx = dx;
      v = n.x;
      snapX = n.x;
    }
    if (dy <= tol && dy < bestDy) {
      bestDy = dy;
      h = n.y;
      snapY = n.y;
    }
  }
  return { v, h, snapX, snapY };
}
