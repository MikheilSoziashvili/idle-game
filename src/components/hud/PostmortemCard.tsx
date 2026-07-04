import { useGame } from '../../game/state/store';

// Auto-postmortem: after every incident, what happened, what it cost, what
// softened it, and what would have. Cause → effect, made legible.

export default function PostmortemCard() {
  const pm = useGame((s) => s.activePostmortem);
  const dismiss = useGame((s) => s.dismissPostmortem);
  if (!pm) return null;

  return (
    <div className="lesson-card postmortem" role="note" aria-label={`Postmortem: ${pm.title}`}>
      <div className="lesson-head">
        <span className="lesson-icon">▣</span>
        <span className="lesson-kicker">post-incident report</span>
        <span className="lesson-tag">{pm.kind.replace('_', ' ')}</span>
      </div>
      <h3>{pm.title}</h3>
      <p className="mono" style={{ fontSize: 11 }}>
        {pm.durSec}s · {pm.dropped} requests lost · −{pm.repLost} reputation
      </p>
      {pm.mitigations.length > 0 && (
        <p style={{ margin: '4px 0' }}>
          <b style={{ color: 'var(--ok)' }}>Held because:</b> {pm.mitigations.join(' · ')}
        </p>
      )}
      {pm.gaps.length > 0 && (
        <p style={{ margin: '4px 0' }}>
          <b style={{ color: 'var(--amber, #b57700)' }}>Would have helped:</b> {pm.gaps.join(' · ')}
        </p>
      )}
      <p>{pm.takeaway}</p>
      <div className="lesson-foot">
        <span className="lesson-more">archived in Company history</span>
        <button className="primary" onClick={dismiss}>
          Filed
        </button>
      </div>
    </div>
  );
}
