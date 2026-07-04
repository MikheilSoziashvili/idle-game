import { BAL, fmtMoney, fmtNum, pendingSp } from '../../game/engine/balance';
import { roundIndex } from '../../game/engine/economy';
import { researchOpen, useGame } from '../../game/state/store';
import { rampColor } from '../../game/systems/overlays';

export default function Dashboard() {
  const g = useGame((s) => s.live.gauges);
  const cash = useGame((s) => s.cash);
  const ar = useGame((s) => s.ar);
  const rp = useGame((s) => s.rp);
  const sp = useGame((s) => s.sp);
  const spTotal = useGame((s) => s.spTotal);
  const rep = useGame((s) => s.rep);
  const lifetimeRev = useGame((s) => s.lifetimeRev);
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const openModal = useGame((s) => s.openModal);
  const collectAR = useGame((s) => s.collectAR);
  const hasStripe = useGame((s) => s.nodes.some((n) => n.kind === 'stripe'));
  const sandbox = useGame((s) => s.sandbox);
  const sandboxDemand = useGame((s) => s.sandboxDemand);
  const setSandboxDemand = useGame((s) => s.setSandboxDemand);
  const events = useGame((s) => s.live.events);
  const canResearch = useGame(researchOpen);
  const caseId = useGame((s) => s.caseId);

  const round = roundIndex(spTotal);
  const pending = pendingSp(lifetimeRev);
  const canRaise = pending >= BAL.prestigeMinSp;
  const dropShare = g.served + g.dropped > 0.1 ? g.dropped / (g.served + g.dropped) : 0;
  const profitPos = g.profitPerSec >= 0;
  const activeEvent = events.find((e) => e.started);

  return (
    <header className="dash">
      <div>
        <div className="dash-logo">
          UPTIME<b>_</b>
        </div>
        <div className="dash-round">{sandbox ? 'SANDBOX' : BAL.roundNames[round].toUpperCase()}</div>
      </div>

      <div className="money-block">
        <span className={`money-cash ${cash < 0 ? 'debt' : ''}`}>{sandbox ? '$∞' : fmtMoney(cash)}</span>
        <span className="money-sub">
          <span className={profitPos ? 'pos' : 'neg'}>
            {profitPos ? '+' : ''}
            {fmtMoney(g.profitPerSec)}/s
          </span>
          {!hasStripe && ar > 1 && !sandbox && (
            <button className="ar-chip" onClick={collectAR} title="Accounts receivable settle slowly on their own. Click to invoice now — or build Stripe Billing to automate it.">
              AR {fmtMoney(ar)} · invoice
            </button>
          )}
        </span>
      </div>

      <div className="gauges">
        <div
          className={`gauge ${dropShare > 0.02 ? 'glow-bad' : 'glow-ok'}`}
          title="Throughput: requests served per second vs. what the market offers. Drops are requests that failed — lost revenue, damaged reputation."
        >
          <div className="gauge-label">
            <span>RPS served</span>
            {g.dropped > 0.1 && <span style={{ color: 'var(--bad)' }}>−{fmtNum(g.dropped)} drop</span>}
          </div>
          <div className="gauge-value">
            {fmtNum(g.served)} <small>/ {fmtNum(Math.max(g.offered, g.served))}</small>
          </div>
          <div className="gauge-bar">
            <i
              style={{
                width: `${Math.min(100, (g.served / Math.max(1, Math.max(g.offered, g.served))) * 100)}%`,
                background: rampColor(dropShare * 3),
              }}
            />
          </div>
        </div>

        <div
          className={`gauge ${g.p95 <= BAL.slaTargetMs ? 'glow-ok' : g.p95 <= 700 ? 'glow-warn' : 'glow-bad'}`}
          title="95% of user-facing requests finish faster than this (async jobs excluded). Percentiles beat averages: the slowest requests belong to your angriest users. Latency also decays revenue past ~220ms."
        >
          <div className="gauge-label">
            <span>p95 latency</span>
            <span>slo {BAL.slaTargetMs}ms</span>
          </div>
          <div className="gauge-value">
            {fmtNum(g.p95)} <small>ms</small>
          </div>
          <div className="gauge-bar">
            <i
              style={{
                width: `${Math.min(100, (Math.log10(1 + g.p95) / Math.log10(3000)) * 100)}%`,
                background: rampColor(Math.min(1, g.p95 / 1200)),
              }}
            />
          </div>
        </div>

        <div
          className={`gauge ${profitPos ? 'glow-ok' : 'glow-bad'}`}
          title="Revenue from served requests minus infrastructure run cost. Over-provision and the bill eats you; under-provision and drops do."
        >
          <div className="gauge-label">
            <span>profit</span>
            <span>
              rev {fmtMoney(g.revenuePerSec)} · inf {fmtMoney(g.costPerSec)}
            </span>
          </div>
          <div className="gauge-value">
            {profitPos ? '+' : ''}
            {fmtMoney(g.profitPerSec)}
            <small>/s</small>
          </div>
          <div className="gauge-bar">
            <i
              style={{
                width: `${Math.min(100, Math.abs(g.profitPerSec) * 4)}%`,
                background: profitPos ? 'var(--ok)' : 'var(--bad)',
              }}
            />
          </div>
        </div>

        <div
          className={`gauge ${g.uptime >= 99.9 ? 'glow-ok' : g.uptime >= 99 ? 'glow-warn' : 'glow-bad'}`}
          title="Success ratio of completed requests, counted in nines: 99.9% still means 43 minutes of downtime a month. Reputation tracks this — and reputation is your growth rate."
        >
          <div className="gauge-label">
            <span>uptime</span>
            <span>SLA 99.9</span>
          </div>
          <div className="gauge-value">
            {g.uptime.toFixed(2)}
            <small>%</small>
          </div>
          <div className="gauge-bar">
            <i
              style={{
                width: `${Math.min(100, Math.max(0, (g.uptime - 98) / 0.02))}%`,
                background: rampColor(Math.min(1, Math.max(0, (99.95 - g.uptime) / 1))),
              }}
            />
          </div>
        </div>
      </div>

      {activeEvent && (
        <span className={`event-pill ${activeEvent.kind === 'spike' ? '' : 'incident'}`} style={{ position: 'static', animationDuration: '1.6s' }}>
          {activeEvent.kind === 'spike' ? '▲' : '✖'} {activeEvent.label}
        </span>
      )}

      <div className="dash-right">
        {sandbox && (
          <label className="sandbox-demand" title="Sandbox traffic control">
            rps
            <input
              type="range"
              min={1}
              max={2000}
              value={sandboxDemand}
              onChange={(e) => setSandboxDemand(+e.target.value)}
              style={{ width: 90 }}
            />
            <span className="mono">{sandboxDemand}</span>
          </label>
        )}
        <div className="res-chip" title={`Research Points — generated by Prometheus (${g.rpPerSec.toFixed(2)}/s)`}>
          <span className="v rp">{fmtNum(rp)}</span>
          <span className="k">RP {g.rpPerSec > 0 ? `+${g.rpPerSec.toFixed(1)}/s` : ''}</span>
        </div>
        <div className="res-chip" title="Reputation gates customer growth. Drops and incidents damage it.">
          <span className="v rep">{Math.round(rep)}</span>
          <span className="k">REP</span>
        </div>
        <div className="res-chip" title={`Scale Points — spend in the prestige panel. ${pending} pending from this run.`}>
          <span className="v sp">
            {sp}
            {pending > 0 ? `+${pending}` : ''}
          </span>
          <span className="k">SP</span>
        </div>

        <div className="sep-v" />
        <button
          onClick={() => openModal('tiers')}
          disabled={Boolean(caseId)}
          title={caseId ? 'Not during a case study' : 'Launch bigger product tiers — bigger workloads, bigger money'}
        >
          Products
        </button>
        <button
          onClick={() => openModal('research')}
          disabled={!canResearch && !caseId}
          title={canResearch || caseId ? 'Spend Research Points' : 'Deploy Prometheus first'}
        >
          Research
        </button>
        <button
          onClick={() => openModal('cases')}
          title="Case studies: consulting engagements teaching real AWS patterns"
        >
          Cases
        </button>
        <button
          className={canRaise && !caseId ? 'primary' : ''}
          onClick={() => openModal('prestige')}
          disabled={Boolean(caseId)}
          title={caseId ? 'Not during a case study' : 'Funding round: reset infra, bank permanent Scale Points'}
        >
          {canRaise ? `Raise (${pending} SP)` : 'Raise'}
        </button>

        <div className="sep-v" />
        <div className="speed-ctl" role="group" aria-label="Simulation speed">
          <button className={speed === 0 ? 'on' : ''} onClick={() => setSpeed(0)} title="Pause (Space)">
            ⏸
          </button>
          <button className={speed === 1 ? 'on' : ''} onClick={() => setSpeed(1)} title="1× (1)">
            1×
          </button>
          <button className={speed === 2 ? 'on' : ''} onClick={() => setSpeed(2)} title="2× (2)">
            2×
          </button>
          <button className={speed === 4 ? 'on' : ''} onClick={() => setSpeed(4)} title="4× (3)">
            4×
          </button>
        </div>
        <button className="ghost" onClick={() => openModal('help')} title="Help (?)" aria-label="Help">
          ?
        </button>
        <button className="ghost" onClick={() => openModal('settings')} title="Settings, save & sandbox" aria-label="Settings">
          ⚙
        </button>
      </div>
    </header>
  );
}
