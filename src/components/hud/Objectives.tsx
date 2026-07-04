import { useState } from 'react';
import { MILESTONES } from '../../game/catalog/milestones';
import { useGame } from '../../game/state/store';

export default function Objectives() {
  const done = useGame((s) => s.milestones);
  const sandbox = useGame((s) => s.sandbox);
  const caseId = useGame((s) => s.caseId);
  const tool = useGame((s) => s.tool);
  const tutPulse = useGame((s) => s.tutorialStep === 5);
  const [collapsed, setCollapsed] = useState(false);

  if (sandbox || caseId) return null; // CaseHud owns this corner during cases
  const doneSet = new Set(done);
  const firstOpenIdx = MILESTONES.findIndex((m) => !doneSet.has(m.id));
  if (firstOpenIdx === -1) return null; // all objectives complete

  // Show the last completed one, the active one, and a peek at the next.
  const visible = MILESTONES.slice(Math.max(0, firstOpenIdx - 1), firstOpenIdx + 2);

  return (
    <div className={`objectives ${tool === 'zone' ? 'shift-down' : ''} ${tutPulse ? 'tut-pulse' : ''}`}>
      <div className="panel-head" style={{ cursor: 'pointer', borderBottom: collapsed ? 'none' : undefined }} onClick={() => setCollapsed(!collapsed)}>
        <span>
          Objectives {done.length}/{MILESTONES.length}
        </span>
        <span className="spacer" />
        <span>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed &&
        visible.map((m, i) => {
          const isDone = doneSet.has(m.id);
          const isActive = MILESTONES[firstOpenIdx].id === m.id;
          return (
            <div key={m.id} className={`obj-item ${isDone ? 'done' : ''} ${!isDone && !isActive ? 'upcoming' : ''}`}>
              <span className="obj-box">{isDone ? '✓' : ''}</span>
              <span className="obj-text">
                <b>{m.title}</b>
                <small>{isActive ? `${m.desc} — ${m.hint}` : m.desc}</small>
                {isActive && (m.rewardCash || m.rewardRp || m.unlocks) && (
                  <small style={{ color: 'var(--ok)', marginTop: 2 }}>
                    {[m.rewardCash ? `+$${m.rewardCash}` : null, m.rewardRp ? `+${m.rewardRp} RP` : null, m.unlocks ? `unlocks ${m.unlocks}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                )}
              </span>
            </div>
          );
        })}
    </div>
  );
}
