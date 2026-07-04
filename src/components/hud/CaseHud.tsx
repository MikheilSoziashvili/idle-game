import { caseById } from '../../game/catalog/casestudies';
import { useGame } from '../../game/state/store';

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Replaces the campaign objectives panel while a case study is running. */
export default function CaseHud() {
  const caseId = useGame((s) => s.caseId);
  const status = useGame((s) => s.caseStatus);
  const objectives = useGame((s) => s.caseObjectives);
  const simTime = useGame((s) => s.simTime);
  const requestConfirm = useGame((s) => s.requestConfirm);
  const exitCase = useGame((s) => s.exitCase);
  const openModal = useGame((s) => s.openModal);

  if (!caseId) return null;
  const def = caseById.get(caseId);
  if (!def) return null;

  const remaining = def.timeLimitSec - simTime;

  return (
    <div className="case-hud">
      <div className="case-head">
        <div className="case-kicker">
          <span>case study</span>
          <span className={`case-timer ${remaining < 45 ? 'low' : ''}`}>{fmtClock(remaining)}</span>
        </div>
        <div className="case-title">{def.title}</div>
      </div>
      {def.objectives.map((o) => {
        const p = objectives[o.id] ?? { held: 0, done: false };
        return (
          <div key={o.id} className={`case-obj ${p.done ? 'done' : ''}`}>
            <span className="obj-box">{p.done ? '✓' : ''}</span>
            <span className="case-obj-text">
              {o.label}
              {!p.done && (
                <span style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 9.5 }}>
                  {' '}
                  · hold {fmtClock(o.holdSec)}
                </span>
              )}
              {!p.done && (
                <span className="case-hold">
                  <i style={{ width: `${Math.min(100, (p.held / o.holdSec) * 100)}%` }} />
                </span>
              )}
            </span>
          </div>
        );
      })}
      <div className="case-actions">
        {status !== 'running' ? (
          <button className="primary" style={{ flex: 1 }} onClick={() => openModal('casedone')}>
            View debrief
          </button>
        ) : (
          <button
            style={{ flex: 1 }}
            onClick={() =>
              requestConfirm({
                title: 'Abort the case study?',
                body: 'Your campaign is restored exactly as you left it. No reward for unfinished consulting.',
                danger: true,
                confirmLabel: 'Abort',
                onYes: () => exitCase(false),
              })
            }
          >
            Abort case
          </button>
        )}
      </div>
    </div>
  );
}
