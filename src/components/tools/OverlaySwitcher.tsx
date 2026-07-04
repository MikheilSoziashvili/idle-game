import { useShallow } from 'zustand/react/shallow';
import type { Overlay } from '../../game/engine/types';
import { unlockedOverlays, useGame } from '../../game/state/store';
import { OVERLAY_INFO } from '../../game/systems/overlays';

const ORDER: Overlay[] = ['none', 'load', 'latency', 'cost', 'errors', 'cache'];

export default function OverlaySwitcher() {
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const unlocked = useGame(useShallow(unlockedOverlays));

  if (unlocked.length <= 1) return null; // nothing unlocked yet — keep the canvas clean

  return (
    <div className="overlay-switch" role="group" aria-label="Observability overlays">
      {ORDER.map((o) => {
        const locked = !unlocked.includes(o);
        return (
          <button
            key={o}
            className={`${overlay === o ? 'on' : ''} ${locked ? 'locked' : ''}`}
            disabled={locked}
            onClick={() => setOverlay(o)}
            title={locked ? `${OVERLAY_INFO[o].label}: research Distributed Tracing` : OVERLAY_INFO[o].desc}
          >
            {OVERLAY_INFO[o].label}
          </button>
        );
      })}
    </div>
  );
}
