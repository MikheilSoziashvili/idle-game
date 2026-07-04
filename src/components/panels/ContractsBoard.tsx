import { useState } from 'react';
import { fmtMoney } from '../../game/engine/balance';
import { useGame } from '../../game/state/store';

// The SLA contract board: rotating short-term deals under the Objectives
// panel. Always one near-term goal on screen — the idle loop's heartbeat.

export default function ContractsBoard() {
  const offers = useGame((s) => s.contractOffers);
  const active = useGame((s) => s.activeContract);
  const accept = useGame((s) => s.acceptContract);
  const simTime = useGame((s) => s.simTime);
  const sandbox = useGame((s) => s.sandbox);
  const caseId = useGame((s) => s.caseId);
  const unlocked = useGame((s) => s.milestones.includes('ten-rps'));
  const tool = useGame((s) => s.tool);
  const [collapsed, setCollapsed] = useState(false);

  if (sandbox || caseId || !unlocked) return null;
  if (!active && offers.length === 0) return null;

  return (
    <div className={`contracts ${tool === 'zone' ? 'shift-down' : ''}`}>
      <div
        className="panel-head"
        style={{ cursor: 'pointer', borderBottom: collapsed ? 'none' : undefined }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Contracts</span>
        <span className="spacer" />
        <span>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && active && (
        <div className="contract-row active">
          <div className="contract-main">
            <b>{active.label}</b>
            <small>{active.client}</small>
            <div className="contract-bar">
              <i style={{ width: `${Math.min(100, (active.held / active.holdSec) * 100)}%` }} />
            </div>
            <small className="mono">
              held {Math.floor(active.held)}/{active.holdSec}s · {Math.max(0, Math.round(active.deadlineAt - simTime))}s left ·
              +{fmtMoney(active.rewardCash)} +{active.rewardRp} RP
            </small>
          </div>
        </div>
      )}
      {!collapsed &&
        !active &&
        offers.map((c) => (
          <div key={c.id} className="contract-row">
            <div className="contract-main">
              <b>{c.label}</b>
              <small>
                {c.client} · +{fmtMoney(c.rewardCash)} · +{c.rewardRp} RP · fail −{c.repPenalty} rep
              </small>
            </div>
            <button className="primary" onClick={() => accept(c.id)}>
              Sign
            </button>
          </div>
        ))}
    </div>
  );
}
