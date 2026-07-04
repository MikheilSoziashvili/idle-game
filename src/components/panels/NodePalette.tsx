import { useMemo } from 'react';
import { CATEGORY_INFO, PALETTE_ORDER, SPECS } from '../../game/catalog/nodes';
import { NODE_LEARN } from '../../game/catalog/lessons';
import { researchById } from '../../game/catalog/research';
import BrandIcon from '../BrandIcon';
import type { NodeKind, NodeSpec } from '../../game/engine/types';
import { isKindUnlocked, useGame } from '../../game/state/store';
import { fmtMoney } from '../../game/engine/balance';

export default function NodePalette() {
  const open = useGame((s) => s.paletteOpen);
  const toggle = useGame((s) => s.togglePalette);
  const cash = useGame((s) => s.cash);
  const sandbox = useGame((s) => s.sandbox);
  const research = useGame((s) => s.research);
  const revProgress = useGame((s) => s.allTimeRev + s.lifetimeRev);
  const nodes = useGame((s) => s.nodes);

  const grouped = useMemo(() => {
    const byCat = new Map<string, NodeSpec[]>();
    for (const cat of PALETTE_ORDER) byCat.set(cat, []);
    for (const spec of Object.values(SPECS)) {
      if (spec.special === 'source') continue;
      byCat.get(spec.category)?.push(spec);
    }
    return byCat;
  }, []);

  const revProgressState = { sandbox, research, allTimeRev: revProgress, lifetimeRev: 0 };

  return (
    <aside className={`palette ${open ? '' : 'closed'}`}>
      <div className="panel-head">
        <span>Infrastructure</span>
        <span className="spacer" />
        <button className="ghost" onClick={toggle} aria-label={open ? 'Collapse palette' : 'Expand palette'}>
          {open ? '▾' : '▴'}
        </button>
      </div>
      {open && (
        <div className="palette-scroll">
          {PALETTE_ORDER.map((cat) => {
            const specs = grouped.get(cat) ?? [];
            if (specs.length === 0) return null;
            return (
              <div key={cat}>
                <div className="pal-cat">
                  <i style={{ background: CATEGORY_INFO[cat].color }} />
                  {CATEGORY_INFO[cat].label}
                </div>
                {specs.map((spec) => {
                  const unlocked = isKindUnlocked(revProgressState, spec.kind);
                  const singleton = spec.singleton && nodes.some((n) => n.kind === spec.kind);
                  const affordable = sandbox || cash >= spec.cost;
                  const lockReason = !unlocked
                    ? spec.research
                      ? `Research: ${researchById.get(spec.research)?.name ?? spec.research}`
                      : spec.revGate
                        ? `Unlocks at ${fmtMoney(spec.revGate)} lifetime revenue (${Math.min(100, Math.round((revProgress / spec.revGate) * 100))}%)`
                        : 'Locked'
                    : singleton
                      ? 'Already deployed (singleton)'
                      : null;
                  return (
                    <div
                      key={spec.kind}
                      className={`pal-item ${!unlocked || singleton ? 'locked' : ''} ${!affordable ? 'unaffordable' : ''}`}
                      draggable={unlocked && !singleton}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/uptime', spec.kind);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onDoubleClick={() => {
                        if (unlocked && !singleton) placeAtCenter(spec.kind);
                      }}
                      title={
                        lockReason ??
                        `${spec.blurb}\n\n${NODE_LEARN[spec.kind]}\n\nDrag onto the canvas (or double-click). ${spec.opCost > 0 ? `Runs at $${spec.opCost}/s.` : ''}`
                      }
                    >
                      <span className="node-logo">
                        <BrandIcon kind={spec.kind} size={17} />
                      </span>
                      <span className="pal-name">
                        <b>{spec.name}</b>
                        <small>{lockReason ?? spec.blurb}</small>
                      </span>
                      <span className="pal-cost">{spec.cost > 0 ? fmtMoney(spec.cost) : 'free'}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function placeAtCenter(kind: Exclude<NodeKind, 'zone'>) {
  const s = useGame.getState();
  // drop near the rightmost existing node so it lands in view after fit
  const maxX = Math.max(...s.nodes.map((n) => n.x), 0);
  const avgY = s.nodes.reduce((a, n) => a + n.y, 0) / Math.max(1, s.nodes.length);
  s.placeNode(kind, maxX + 240, avgY + (Math.random() * 120 - 60));
  s.requestFit();
}
