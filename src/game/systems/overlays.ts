import type { NodeLive, Overlay } from '../engine/types';

// Observability overlays: map a node's live stats to a 0..1 heat value and a
// short readout. The canvas tints node cards with rampColor(value).

export function overlayValue(overlay: Overlay, live: NodeLive | undefined): { t: number; label: string } | null {
  if (!live || overlay === 'none') return null;
  switch (overlay) {
    case 'load':
      return { t: clamp01(live.util), label: `${Math.round(live.util * 100)}%` };
    case 'latency':
      return { t: clamp01(live.latencyMs / 600), label: `${Math.round(live.latencyMs)}ms` };
    case 'cost':
      return { t: clamp01(live.costRate / 1.2), label: `$${live.costRate.toFixed(2)}/s` };
    case 'errors': {
      const total = live.inRps + 0.001;
      return { t: clamp01((live.drops / total) * 4), label: live.drops > 0.05 ? `${live.drops.toFixed(1)}/s` : 'ok' };
    }
    case 'cache':
      if (live.hitPct < 0) return { t: 0, label: '—' };
      return { t: clamp01(1 - live.hitPct), label: `${Math.round(live.hitPct * 100)}% hit` };
    default:
      return null;
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Calm green → amber → red, tuned for the light canvas. */
export function rampColor(t: number): string {
  const c = clamp01(t);
  if (c < 0.5) {
    return lerpColor([24, 157, 90], [192, 138, 10], c * 2);
  }
  return lerpColor([192, 138, 10], [213, 69, 63], (c - 0.5) * 2);
}

function lerpColor(a: number[], b: number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export const OVERLAY_INFO: Record<Overlay, { label: string; desc: string }> = {
  none: { label: 'Off', desc: 'No overlay' },
  load: { label: 'Load', desc: 'Utilization per node — find the bottleneck' },
  latency: { label: 'Latency', desc: 'Effective latency incl. queue wait' },
  cost: { label: 'Cost', desc: 'Operating $/s per node' },
  errors: { label: 'Errors', desc: 'Drop rate / SLA violations' },
  cache: { label: 'Cache', desc: 'Cache hit ratio (cold = red)' },
};
