import { useMemo } from 'react';
import { CATEGORY_INFO, PALETTE_ORDER, SPECS } from '../../game/catalog/nodes';
import { NODE_LEARN } from '../../game/catalog/lessons';
import { researchById } from '../../game/catalog/research';
import BrandIcon from '../BrandIcon';
import type { NodeKind, NodeSpec } from '../../game/engine/types';
import { constraintBlocks, isKindUnlocked, useGame } from '../../game/state/store';
import { fmtMoney, masteryTier } from '../../game/engine/balance';

const MEDALS = ['', '🥉', '🥈', '🥇'];

export default function NodePalette() {
  const open = useGame((s) => s.paletteOpen);
  const toggle = useGame((s) => s.togglePalette);
  const cash = useGame((s) => s.cash);
  const sandbox = useGame((s) => s.sandbox);
  const research = useGame((s) => s.research);
  const revProgress = useGame((s) => s.allTimeRev + s.lifetimeRev);
  const nodes = useGame((s) => s.nodes);
  const runConstraint = useGame((s) => s.runConstraint);
  const servedByKind = useGame((s) => s.stats.servedByKind);
  const setDragKind = useGame((s) => s.setDragKind);
  const tutPulseNginx = useGame((s) => s.tutorialStep === 1);

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
        <div className="port-legend" title="Wires connect like to like. In wire mode (W), dragging card to card picks the right ports for you.">
          <span><i className="dot dot-http" />web</span>
          <span><i className="dot dot-data" />storage</span>
          <span><i className="dot dot-jobs" />jobs</span>
          <span><i className="dot dot-control" />control</span>
        </div>
      )}
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
                  const constrained = constraintBlocks(runConstraint, spec.kind);
                  const affordable = sandbox || cash >= spec.cost;
                  const mastery = masteryTier(servedByKind?.[spec.kind] ?? 0);
                  const lockReason = constrained
                    ? constrained
                    : !unlocked
                      ? spec.research
                        ? `Research: ${researchById.get(spec.research)?.name ?? spec.research}`
                        : spec.revGate
                          ? `Unlocks at ${fmtMoney(spec.revGate)} lifetime revenue (${Math.min(100, Math.round((revProgress / spec.revGate) * 100))}%)`
                          : 'Locked'
                      : singleton
                        ? 'Already deployed (singleton)'
                        : null;
                  const usable = unlocked && !singleton && !constrained;
                  return (
                    <div
                      key={spec.kind}
                      className={`pal-item ${!usable ? 'locked' : ''} ${!affordable ? 'unaffordable' : ''} ${tutPulseNginx && spec.kind === 'nginx' ? 'tut-pulse' : ''}`}
                      draggable={usable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/uptime', spec.kind);
                        e.dataTransfer.effectAllowed = 'copy';
                        setDragKind(spec.kind);
                      }}
                      onDragEnd={() => setDragKind(null)}
                      onDoubleClick={() => {
                        if (usable) placeAtCenter(spec.kind);
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
                        <b>
                          {spec.name}
                          {mastery > 0 && <span title={`mastery: +${2 * mastery}% capacity`}> {MEDALS[mastery]}</span>}
                        </b>
                        <small>{lockReason ?? spec.blurb}</small>
                      </span>
                      <span className="pal-cost">{spec.cost > 0 ? fmtMoney(spec.cost) : 'free'}</span>
                      <a
                        className="pal-docs"
                        href={spec.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Official ${spec.name} documentation`}
                        draggable={false}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        ↗
                      </a>
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
