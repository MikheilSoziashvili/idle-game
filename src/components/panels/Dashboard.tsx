import { useState } from 'react';
import { BAL, fmtMoney, fmtNum, pendingSp } from '../../game/engine/balance';
import { roundIndex } from '../../game/engine/economy';
import { mandateById } from '../../game/catalog/mandates';
import { researchOpen, useGame } from '../../game/state/store';
import { rampColor } from '../../game/systems/overlays';

// Click-to-explain popovers: every gauge can answer "why is this number what
// it is?" with the actual formula and its live inputs.
function whyText(key: string, g: ReturnType<typeof useGame.getState>['live']['gauges'], rep: number): string[] {
  switch (key) {
    case 'rps':
      return [
        `The market offers ${fmtNum(g.offered)} rps; you serve ${fmtNum(g.served)}.`,
        `Drops (${fmtNum(g.dropped)}/s) are requests that overflowed a queue or timed out — lost revenue, damaged reputation.`,
        'Offered demand = company scale × launched tiers, capped by the funding round.',
      ];
    case 'p95':
      return [
        '95% of user-facing requests finish faster than this (async jobs excluded).',
        `Each hop adds base latency × congestion (1 + 2·util³) + queue wait.`,
        `Revenue decays past ${BAL.latValueKneeMs}ms and bottoms out at ${Math.round(BAL.latValueFloor * 100)}% by ${BAL.latValueZeroMs}ms.`,
      ];
    case 'profit':
      return [
        `Revenue ${fmtMoney(g.revenuePerSec)}/s − infrastructure ${fmtMoney(g.costPerSec)}/s.`,
        'Served requests pay per class (writes > reads > static), scaled down by latency.',
        'Without Stripe, revenue lands in AR first and settles ~3%/s.',
      ];
    case 'uptime':
      return [
        'Success ratio of completed requests (shed 429s count 15% as bad).',
        `Reputation (${Math.round(rep)}) chases a target set by uptime: 90% → 0 rep, 99.9%+ → 100.`,
        `Rep bleeds ~4× faster than it heals — and growth rate follows reputation.`,
      ];
    case 'rp':
      return [
        `Metrics nodes sample served traffic: rp/s = ${BAL.rpBase}·√served·√Σweight + ${BAL.rpPerPromLevel}·Σ(level·weight).`,
        'Datadog samples at 2× weight; Grafana ×1.5, Distributed Tracing ×1.4 on top.',
        'Contracts, drills, missions and milestones pay lump sums.',
      ];
    default:
      return [];
  }
}

export default function Dashboard() {
  const [why, setWhy] = useState<string | null>(null);
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

  const rival = useGame((s) => s.rival);
  const mandate = useGame((s) => s.mandate);
  const runConstraint = useGame((s) => s.runConstraint);
  const drill = useGame((s) => s.drill);
  const startDrill = useGame((s) => s.startDrill);
  const simTime = useGame((s) => s.simTime);

  const round = roundIndex(spTotal);
  const pending = pendingSp(lifetimeRev);
  const canRaise = pending >= BAL.prestigeMinSp;
  const dropShare = g.served + g.dropped > 0.1 ? g.dropped / (g.served + g.dropped) : 0;
  const profitPos = g.profitPerSec >= 0;
  const activeEvent = events.find((e) => e.started);

  const today = new Date().toISOString().slice(0, 10);
  const drillRunning = drill.activeUntil > simTime;
  const drillAvailable = !sandbox && !caseId && !drillRunning && drill.lastDay !== today;
  const tutGauges = useGame((s) => s.tutorialStep === 3);

  const gaugeWhy = (key: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setWhy(why === key ? null : key);
  };
  const Why = ({ k }: { k: string }) =>
    why === k ? (
      <div className="why-pop" onClick={(e) => e.stopPropagation()}>
        {whyText(k, g, rep).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    ) : null;

  return (
    <header className="dash" onClick={() => why && setWhy(null)}>
      <div>
        <div className="dash-logo">
          UPTIME<b>_</b>
        </div>
        <div className="dash-round">
          {sandbox ? 'SANDBOX' : BAL.roundNames[round].toUpperCase()}
          {mandate && !sandbox && (
            <span className="mandate-chip" title={mandateById.get(mandate)?.desc}>
              {mandateById.get(mandate)?.name}
            </span>
          )}
          {runConstraint !== 'none' && !sandbox && (
            <span className="mandate-chip constraint" title="Run constraint — raise a round under it for an achievement">
              {runConstraint === 'serverless' ? 'serverless-only' : runConstraint === 'nocache' ? 'no caches' : 'no upgrades'}
            </span>
          )}
        </div>
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

      <div className={`gauges ${tutGauges ? 'tut-pulse' : ''}`}>
        <div
          className={`gauge ${dropShare > 0.02 ? 'glow-bad' : 'glow-ok'}`}
          title="Throughput. Click for the why."
          onClick={gaugeWhy('rps')}
        >
          <Why k="rps" />
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
          title="95th-percentile latency. Click for the why."
          onClick={gaugeWhy('p95')}
        >
          <Why k="p95" />
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
          title="Profit. Click for the why."
          onClick={gaugeWhy('profit')}
        >
          <Why k="profit" />
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
          title="Uptime. Click for the why."
          onClick={gaugeWhy('uptime')}
        >
          <Why k="uptime" />
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
        {!sandbox && !caseId && (
          <div
            className="res-chip rival-chip"
            title={`${rival.name} — your rival. Out-serve them when you raise for +${BAL.rivalBeatSp} SP.`}
            style={{ color: g.served >= rival.rps ? 'var(--ok)' : 'var(--bad)' }}
          >
            <span className="v">{fmtNum(rival.rps)}</span>
            <span className="k">{rival.name.slice(0, 10)}</span>
          </div>
        )}
        <div
          className="res-chip"
          title="Research Points. Click for the why."
          onClick={gaugeWhy('rp')}
          style={{ position: 'relative', cursor: 'pointer' }}
        >
          <Why k="rp" />
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
          onClick={() => openModal('doctor')}
          title="Architecture Doctor: a staff-engineer review of the live graph — prioritized, costed findings"
        >
          🩺
        </button>
        <button onClick={() => openModal('history')} title="Company history: timeline, records, postmortems" aria-label="History">
          🕘
        </button>
        {!sandbox && !caseId && (
          <button
            onClick={startDrill}
            disabled={!drillAvailable}
            className={drillAvailable ? 'primary' : ''}
            title={
              drillRunning
                ? 'Drill in progress — keep drops under 3%'
                : drillAvailable
                  ? `Daily chaos drill: 3 minutes of scripted failure. Streak: ${drill.streak}`
                  : `Drill done for today. Streak: ${drill.streak} — come back tomorrow.`
            }
          >
            🔥{drill.streak > 0 ? drill.streak : ''}
          </button>
        )}
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
