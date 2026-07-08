import { BAL, fmtMoney } from '../../game/engine/balance';
import { useGame } from '../../game/state/store';

// ---------------------------------------------------------------------------
// Incident Command: when something is actively burning, a command bar appears
// with real mitigations — surge capacity ($$, instant headroom), emergency
// load-shedding (fail cheap while you think), rollback (when the deploy was
// the cause). Mitigate first, diagnose later.
// ---------------------------------------------------------------------------

export default function IncidentBar() {
  const crisis = useGame((s) => s.live.crisis);
  const events = useGame((s) => s.live.events);
  const simTime = useGame((s) => s.simTime);
  const cash = useGame((s) => s.cash);
  const sandbox = useGame((s) => s.sandbox);
  const costPerSec = useGame((s) => s.live.gauges.costPerSec);
  const dropped = useGame((s) => s.live.gauges.dropped);
  const surgeUntil = useGame((s) => s.surgeUntil);
  const shedUntil = useGame((s) => s.shedUntil);
  const lastBadDeploy = useGame((s) => s.lastBadDeploy);
  const commandSurge = useGame((s) => s.commandSurge);
  const commandShed = useGame((s) => s.commandShed);
  const commandRollback = useGame((s) => s.commandRollback);
  const responder = useGame((s) => s.live.responder);

  if (!crisis) return null;

  const incident = events.find((e) => e.started && e.kind !== 'spike');
  const label = incident ? incident.label : lastBadDeploy ? 'bad deploy degrading a node' : 'drop storm';
  const surgeActive = surgeUntil > simTime;
  const shedActive = shedUntil > simTime;
  const canRollback = lastBadDeploy !== null && simTime - (lastBadDeploy?.at ?? 0) <= 90;
  const surgeCost = Math.max(BAL.surgeCostMin, Math.round(costPerSec * BAL.surgeCostFactor));

  return (
    <div className="incident-bar" role="alert" aria-label={`Incident: ${label}`}>
      <span className="ic-dot" aria-hidden />
      <span className="ic-label">
        <b>INCIDENT</b> {label}
        {dropped > 0.3 && <em> · losing {dropped < 10 ? dropped.toFixed(1) : Math.round(dropped)} req/s</em>}
        {responder && <span className="ic-responder"> · 📟 {responder} is on it</span>}
      </span>
      <span className="spacer" style={{ flex: 1 }} />
      <button
        className={surgeActive ? 'ic-btn active' : 'ic-btn'}
        disabled={surgeActive || (!sandbox && cash < surgeCost)}
        onClick={commandSurge}
        title={`Emergency capacity: +${Math.round((BAL.surgeCapMult - 1) * 100)}% everywhere for ${BAL.surgeDurSec}s. Costs ${fmtMoney(surgeCost)}.`}
      >
        {surgeActive ? `⚡ surging ${Math.ceil(surgeUntil - simTime)}s` : `⚡ Surge · ${fmtMoney(surgeCost)}`}
      </button>
      <button
        className={shedActive ? 'ic-btn active' : 'ic-btn'}
        disabled={shedActive}
        onClick={commandShed}
        title={`Emergency load-shedding: every node fails cheap (429s) instead of timing out, for ${BAL.cmdShedDurSec}s. Free — costs goodwill, not money.`}
      >
        {shedActive ? `⛨ shedding ${Math.ceil(shedUntil - simTime)}s` : '⛨ Shed load'}
      </button>
      {canRollback && (
        <button className="ic-btn rollback" onClick={commandRollback} title="Roll back the bad deploy: the node restarts healthy in 2s. You lose the shipped feature.">
          ↩ Roll back
        </button>
      )}
    </div>
  );
}
