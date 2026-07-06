import { useEffect, useMemo, useState } from 'react';
import { ACHIEVEMENTS } from '../../game/catalog/achievements';
import { CONSULTING_CASES, PRODUCT_MISSIONS, type CaseDef, type CaseObjectiveDef } from '../../game/catalog/casestudies';
import { WEEKLY_CHALLENGE, encodeChallengeScore, resolveCase } from '../../game/catalog/challenge';
import { MANDATES } from '../../game/catalog/mandates';
import { GLOSSARY, LESSONS } from '../../game/catalog/lessons';
import { RESEARCH, researchDepth } from '../../game/catalog/research';
import { TIERS } from '../../game/catalog/tiers';
import { BAL, fmtMoney, fmtNum, pendingSp, perkCost } from '../../game/engine/balance';
import { roundIndex } from '../../game/engine/economy';
import type { MandateId, PerkId, RunConstraint } from '../../game/engine/types';
import { clearSave, exportCaseCode, exportSave, importCaseCode, importSave, saveNow } from '../../game/state/save';
import { diagnose } from '../../game/systems/doctor';
import { gradeBlurb, gradeRun } from '../../game/systems/grades';
import { useGame } from '../../game/state/store';

export default function Modals() {
  const modal = useGame((s) => s.modal);
  const confirm = useGame((s) => s.confirm);
  const openModal = useGame((s) => s.openModal);
  const resolveConfirm = useGame((s) => s.resolveConfirm);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (useGame.getState().confirm) resolveConfirm(false);
        else if (useGame.getState().modal) openModal(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openModal, resolveConfirm]);

  return (
    <>
      {modal === 'research' && (
        <Shell title="Research — spend RP earned by observability" onClose={() => openModal(null)}>
          <ResearchTree />
        </Shell>
      )}
      {modal === 'tiers' && (
        <Shell title="Product tiers — bigger workloads, bigger money" onClose={() => openModal(null)}>
          <TiersPanel />
        </Shell>
      )}
      {modal === 'prestige' && (
        <Shell title="Funding round — re-architect from scratch, keep the leverage" onClose={() => openModal(null)}>
          <PrestigePanel />
        </Shell>
      )}
      {modal === 'settings' && (
        <Shell title="Settings & save" onClose={() => openModal(null)} narrow>
          <SettingsPanel />
        </Shell>
      )}
      {modal === 'help' && (
        <Shell title="Field manual" onClose={() => openModal(null)}>
          <HelpPanel />
        </Shell>
      )}
      {modal === 'cases' && (
        <Shell title="Case studies — ship products, take engagements" onClose={() => openModal(null)}>
          <CasesPanel />
        </Shell>
      )}
      {modal === 'casedone' && (
        <Shell title="Engagement debrief" onClose={() => openModal(null)} narrow>
          <DebriefPanel />
        </Shell>
      )}
      {modal === 'doctor' && (
        <Shell title="Architecture review — a staff engineer looks at your graph" onClose={() => openModal(null)} narrow>
          <DoctorPanel />
        </Shell>
      )}
      {modal === 'history' && (
        <Shell title="Company history — the legend so far" onClose={() => openModal(null)}>
          <HistoryPanel />
        </Shell>
      )}
      {modal === 'caseeditor' && (
        <Shell title="Challenge editor — turn this canvas into a level" onClose={() => openModal(null)}>
          <CaseEditorPanel />
        </Shell>
      )}
      {confirm && (
        <div className="modal-backdrop" onClick={() => resolveConfirm(false)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <div className="modal-head">
              <h2>{confirm.title}</h2>
            </div>
            <div className="modal-body" style={{ color: 'var(--dim)', fontSize: 12.5 }}>
              {confirm.body}
            </div>
            <div className="modal-foot">
              <button onClick={() => resolveConfirm(false)} autoFocus>
                Cancel
              </button>
              <button className={confirm.danger ? 'danger' : 'primary'} onClick={() => resolveConfirm(true)}>
                {confirm.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Shell({ title, children, onClose, narrow }: { title: string; children: React.ReactNode; onClose: () => void; narrow?: boolean }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${narrow ? 'narrow' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕ esc
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- research --

function ResearchTree() {
  const rp = useGame((s) => s.rp);
  const owned = useGame((s) => s.research);
  const buy = useGame((s) => s.buyResearch);
  const sandbox = useGame((s) => s.sandbox);

  const cols = useMemo(() => {
    const byDepth = new Map<number, typeof RESEARCH>();
    for (const r of RESEARCH) {
      const d = researchDepth(r.id);
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(r);
    }
    return [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
  }, []);

  return (
    <>
      <div style={{ marginBottom: 10, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--cat-observability)' }}>
        {sandbox ? 'sandbox: everything unlocked' : `${rp.toFixed(1)} RP available`}
      </div>
      <div className="tree">
        {cols.map((col, i) => (
          <div className="tree-col" key={i}>
            {col.map((r) => {
              const isOwned = owned.includes(r.id);
              const depsMet = r.deps.every((d) => owned.includes(d));
              const affordable = sandbox || rp >= r.cost;
              return (
                <div key={r.id} className={`tech ${isOwned ? 'owned' : depsMet ? 'avail' : 'locked'}`}>
                  <div className="tech-head">
                    <span className="tech-icon">{r.icon}</span>
                    {r.name}
                  </div>
                  {r.deps.length > 0 && <div className="tech-deps">needs: {r.deps.join(', ')}</div>}
                  <p>{r.desc}</p>
                  <p style={{ color: 'var(--cat-observability)' }}>{r.grants.join(' · ')}</p>
                  {isOwned ? (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ok)' }}>✓ deployed</div>
                  ) : (
                    <button className={depsMet && affordable ? 'primary' : ''} disabled={!depsMet || !affordable} onClick={() => buy(r.id)}>
                      {depsMet ? `research · ${r.cost} RP` : 'locked'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ tiers --

function TiersPanel() {
  const launched = useGame((s) => s.tiers);
  const research = useGame((s) => s.research);
  const cash = useGame((s) => s.cash);
  const sandbox = useGame((s) => s.sandbox);
  const spTotal = useGame((s) => s.spTotal);
  const launch = useGame((s) => s.launchTier);
  const g = useGame((s) => s.live.gauges);
  const round = roundIndex(spTotal);

  return (
    <>
      <p style={{ marginTop: 0, color: 'var(--dim)', fontSize: 12 }}>
        Each launched product adds its own traffic mix — permanently. Launch when your architecture has headroom:
        currently serving {Math.round(g.served)} rps at {g.uptime.toFixed(2)}% uptime.
      </p>
      {TIERS.map((t) => {
        const live = launched.includes(t.id);
        const needsResearch = t.research && !research.includes(t.research) && !sandbox;
        const needsRound = t.roundGate !== undefined && round < t.roundGate && !sandbox;
        const affordable = sandbox || cash >= t.cost;
        const blocked = needsResearch || needsRound;
        return (
          <div key={t.id} className={`tier-row ${live ? 'live' : ''}`}>
            <span className="mono" style={{ color: 'var(--faint)', fontSize: 11 }}>
              T{t.id}
            </span>
            <div>
              <div className="tier-name">
                {t.name} {t.latencySensitive && <span className="chip">latency-critical</span>}
              </div>
              <div className="tier-blurb">{t.blurb}</div>
            </div>
            <span className="spacer" />
            {live ? (
              <span className="chip" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}>
                ● live
              </span>
            ) : blocked ? (
              <span className="chip">{needsResearch ? `research: ${t.research}` : `needs ${BAL.roundNames[t.roundGate!]}`}</span>
            ) : (
              <button className="primary" disabled={!affordable} onClick={() => launch(t.id)}>
                launch · {fmtMoney(t.cost)}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------ case studies --

function CaseCard({ c }: { c: CaseDef }) {
  const completed = useGame((s) => s.casesCompleted);
  const caseId = useGame((s) => s.caseId);
  const enterCase = useGame((s) => s.enterCase);
  const requestConfirm = useGame((s) => s.requestConfirm);

  const done = completed.includes(c.id);
  const locked = Boolean(c.requires && !completed.includes(c.requires));
  const prereq = c.requires ? resolveCase(c.requires) : undefined;

  return (
    <div className={`case-card ${done ? 'done-before' : ''} ${locked ? 'locked' : ''}`}>
      <div className="case-info">
        <div className="case-client">{c.client}</div>
        <h3>
          {done ? '✓ ' : locked ? '🔒 ' : ''}
          {c.title}
        </h3>
        <p className="case-brief">{locked ? `Ship "${prereq?.title ?? c.requires}" first — each product builds on the last.` : c.brief}</p>
        <div className="case-meta">
          <span className="chip aws-chip">{c.aws}</span>
          <span className="chip">{c.teach}</span>
          <span className="chip mono">
            {Math.round(c.timeLimitSec / 60)} min · ${c.cash} budget · +{c.rewardRp} RP
          </span>
        </div>
      </div>
      <button
        className="primary"
        disabled={Boolean(caseId) || locked}
        onClick={() =>
          requestConfirm({
            title: c.track === 'product' ? `Ship it: ${c.title}?` : `Take the engagement: ${c.title}?`,
            body: 'Your campaign is saved and will be restored when you finish or abort.',
            confirmLabel: 'Start',
            onYes: () => enterCase(c.id),
          })
        }
      >
        {locked ? 'Locked' : done ? 'Replay' : 'Start'}
      </button>
    </div>
  );
}

function CasesPanel() {
  const customCases = useGame((s) => s.customCases);
  const removeCustomCase = useGame((s) => s.removeCustomCase);
  const addToast = useGame((s) => s.addToast);
  const sandbox = useGame((s) => s.sandbox);
  const openModal = useGame((s) => s.openModal);
  const [importStr, setImportStr] = useState('');

  return (
    <>
      <h4 style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Weekly challenge — same seed for everyone
      </h4>
      <CaseCard c={WEEKLY_CHALLENGE} />

      <h4 style={{ margin: '18px 0 4px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Product builds — the campaign
      </h4>
      <p style={{ margin: '0 0 12px', color: 'var(--dim)', fontSize: 12, lineHeight: 1.5 }}>
        Ship {PRODUCT_MISSIONS.length} real products as levels — a URL shortener up to a streaming platform. Each level is a
        famous architecture in miniature and unlocks the next. Passing pays Research Points back to the company.
      </p>
      {PRODUCT_MISSIONS.map((c) => (
        <CaseCard key={c.id} c={c} />
      ))}

      <h4 style={{ margin: '18px 0 4px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Consulting engagements
      </h4>
      <p style={{ margin: '0 0 12px', color: 'var(--dim)', fontSize: 12, lineHeight: 1.5 }}>
        Client problems, each modeling a pattern you'd deploy on AWS. You get their half-built architecture, a budget,
        scripted traffic and incidents, and SLOs to hold. Your campaign is snapshotted and restored afterwards.
      </p>
      {CONSULTING_CASES.map((c) => (
        <CaseCard key={c.id} c={c} />
      ))}

      <h4 style={{ margin: '18px 0 4px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Community — player-designed challenges
      </h4>
      <p style={{ margin: '0 0 8px', color: 'var(--dim)', fontSize: 12, lineHeight: 1.5 }}>
        Paste a <span className="mono">UPCASE1.</span> code to import a challenge.
        {sandbox ? ' You are in sandbox — design your own with the editor:' : ' Design your own from the sandbox (Settings → Sandbox), then Challenge editor.'}
        {sandbox && (
          <button style={{ marginLeft: 8 }} onClick={() => openModal('caseeditor')}>
            Open challenge editor
          </button>
        )}
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          value={importStr}
          onChange={(e) => setImportStr(e.target.value)}
          placeholder="UPCASE1.…"
          style={{ flex: 1 }}
          aria-label="Challenge code"
        />
        <button
          disabled={!importStr.trim()}
          onClick={() => {
            if (importCaseCode(importStr)) setImportStr('');
            else addToast('warn', 'Import failed', 'That does not look like a valid challenge code.');
          }}
        >
          Import
        </button>
      </div>
      {customCases.map((c) => (
        <div key={c.id} style={{ position: 'relative' }}>
          <CaseCard c={c} />
          <button
            className="ghost"
            style={{ position: 'absolute', top: 8, right: 8 }}
            title="Remove this imported challenge"
            onClick={() => removeCustomCase(c.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </>
  );
}

function DebriefPanel() {
  const caseId = useGame((s) => s.caseId);
  const status = useGame((s) => s.caseStatus);
  const objectives = useGame((s) => s.caseObjectives);
  const exitCase = useGame((s) => s.exitCase);
  const retryCase = useGame((s) => s.retryCase);
  const customCases = useGame((s) => s.customCases);
  const gauges = useGame((s) => s.live.gauges);
  const cash = useGame((s) => s.cash);
  if (!caseId) return <p style={{ color: 'var(--dim)' }}>No engagement running.</p>;
  const def = resolveCase(caseId, customCases);
  if (!def) return null;
  const passed = status === 'passed';
  const weeklyScore =
    passed && def.track === 'challenge' ? encodeChallengeScore(def.id.replace('challenge-', ''), gauges.uptime, gauges.p95, cash) : null;

  return (
    <div>
      <div className={`debrief-banner ${passed ? 'pass' : 'fail'}`}>
        {passed
          ? `Engagement closed — ${def.client} renews. +${def.rewardRp} RP on exit.`
          : status === 'failed'
            ? 'Engagement failed — the client is unimpressed. Retry or head home.'
            : 'Engagement still running.'}
      </div>
      {weeklyScore && (
        <div style={{ margin: '0 0 10px' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>Your score string — paste it where the leaderboard lives:</div>
          <textarea readOnly value={weeklyScore} rows={2} style={{ width: '100%' }} onFocus={(e) => e.target.select()} aria-label="Weekly score" />
        </div>
      )}
      {def.objectives.map((o) => {
        const p = objectives[o.id];
        return (
          <div key={o.id} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0' }}>
            <span style={{ color: p?.done ? 'var(--ok)' : 'var(--bad)' }}>{p?.done ? '✓' : '✗'}</span>
            <span style={{ color: 'var(--dim)' }}>{o.label}</span>
          </div>
        );
      })}
      {passed && <div className="debrief-text">{def.debrief}</div>}
      {!passed && (
        <div className="debrief-text">
          {def.teach} Think about where the constraint actually was — the overlays ({`Load, Latency, Errors`}) point at
          it.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={{ flex: 1 }} onClick={retryCase}>
          Retry engagement
        </button>
        <button className="primary" style={{ flex: 1 }} onClick={() => exitCase(passed)}>
          {passed ? 'Collect & return' : 'Back to the company'}
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- prestige --

const PERKS: { id: PerkId; name: string; desc: string }[] = [
  { id: 'throughput', name: 'Platform team', desc: `+${Math.round(BAL.perkThroughput * 100)}% capacity everywhere / level` },
  { id: 'revenue', name: 'Sales team', desc: `+${Math.round(BAL.perkRevenue * 100)}% revenue / level` },
  { id: 'efficiency', name: 'FinOps', desc: `−${Math.round(BAL.perkEfficiency * 100)}% infra cost / level` },
  { id: 'momentum', name: 'Momentum', desc: `+$${BAL.perkMomentumCash} starting cash, +${Math.round(BAL.perkMomentumDemand * 100)}% base demand / level` },
];

function PrestigePanel() {
  const lifetimeRev = useGame((s) => s.lifetimeRev);
  const sp = useGame((s) => s.sp);
  const spTotal = useGame((s) => s.spTotal);
  const spSpentOn = useGame((s) => s.spSpentOn);
  const blueprints = useGame((s) => s.blueprints);
  const buyPerk = useGame((s) => s.buyPerk);
  const doPrestige = useGame((s) => s.doPrestige);
  const requestConfirm = useGame((s) => s.requestConfirm);
  const sandbox = useGame((s) => s.sandbox);
  const rival = useGame((s) => s.rival);
  const served = useGame((s) => s.live.gauges.served);
  const [nextMandate, setNextMandate] = useState<MandateId | null>(null);
  const grade = useMemo(() => gradeRun(useGame.getState()), []);

  const pending = pendingSp(lifetimeRev);
  const can = pending >= BAL.prestigeMinSp && !sandbox;
  const round = roundIndex(spTotal);
  const nextRound = roundIndex(spTotal + pending);
  const beatingRival = served > rival.rps;

  return (
    <div className="prestige-grid">
      <div className="prestige-box">
        <h4 style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          This run
        </h4>
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>lifetime revenue</div>
        <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
          {fmtMoney(lifetimeRev)}
        </div>
        <div style={{ margin: '12px 0 4px', fontSize: 12, color: 'var(--dim)' }}>scale points on raise</div>
        <div className="prestige-big">+{pending} SP</div>
        <div style={{ fontSize: 11, color: 'var(--faint)', margin: '6px 0 12px' }}>
          √(revenue / {BAL.spDivisor}) — need {BAL.prestigeMinSp}+ to raise. Currently {BAL.roundNames[round]}
          {nextRound > round ? ` → ${BAL.roundNames[nextRound]} (scale cap ×${Math.round(BAL.rpsCaps[nextRound] / BAL.rpsCaps[round])})` : ''}.
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 12 }}>
          Raising resets your canvas, cash, research and launched tiers. You keep: Scale Points & perks, achievements,
          unlocked tools, and <b style={{ color: 'var(--text)' }}>all blueprints</b>
          {blueprints.length === 0 ? ' — you have none saved. Select your architecture and save one first!' : ` (${blueprints.length} saved — stamp them to rebuild in seconds).`}
        </div>

        <div className="grade-box">
          <div style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Run report card
          </div>
          {(['cost', 'speed', 'resilience'] as const).map((axis) => (
            <div key={axis} className="grade-row">
              <span className="grade-axis">{axis === 'cost' ? '$ / req' : axis === 'speed' ? 'latency' : 'resilience'}</span>
              <div className="grade-bar">
                <i style={{ width: `${Math.round(grade[axis] * 100)}%` }} />
              </div>
              <b className="mono">{grade.letters[axis]}</b>
            </div>
          ))}
          <div style={{ fontSize: 11.5, marginTop: 4 }}>
            <b>{grade.title}</b>
            <span style={{ color: 'var(--faint)' }}> — {gradeBlurb(grade)}</span>
          </div>
          {beatingRival && (
            <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 4 }}>
              Out-serving {rival.name} — raising now banks +{BAL.rivalBeatSp} bonus SP.
            </div>
          )}
        </div>

        <div style={{ margin: '10px 0 4px', fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Board mandate for the next round (optional)
        </div>
        <div className="mandate-pick">
          <button className={nextMandate === null ? 'primary' : ''} onClick={() => setNextMandate(null)}>
            None
          </button>
          {MANDATES.map((m) => (
            <button
              key={m.id}
              className={nextMandate === m.id ? 'primary' : ''}
              title={m.desc}
              onClick={() => setNextMandate(nextMandate === m.id ? null : m.id)}
            >
              {m.name} <small style={{ color: 'var(--ok)' }}>+{Math.round(m.spBonus * 100)}% SP</small>
            </button>
          ))}
        </div>

        <button
          className={can ? 'primary' : ''}
          disabled={!can}
          onClick={() =>
            requestConfirm({
              title: `Close the ${BAL.roundNames[nextRound]} round?`,
              body: `The whole platform is decommissioned for +${pending}${beatingRival ? `+${BAL.rivalBeatSp}` : ''} SP${nextMandate ? `. Next round: ${MANDATES.find((m) => m.id === nextMandate)?.name}` : ''}. Blueprints survive. This is the point.`,
              danger: true,
              confirmLabel: `Raise ${BAL.roundNames[nextRound]}`,
              onYes: () => doPrestige(nextMandate),
            })
          }
          style={{ width: '100%', marginTop: 10 }}
        >
          {sandbox ? 'Not in sandbox' : can ? `Raise ${BAL.roundNames[nextRound]} · bank +${pending} SP` : `Need ${fmtMoney(BAL.spDivisor * BAL.prestigeMinSp ** 2)} lifetime revenue`}
        </button>
      </div>

      <div className="prestige-box">
        <h4 style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Spend scale points ({sp} unspent)
        </h4>
        {PERKS.map((p) => {
          const lvl = spSpentOn[p.id];
          const cost = perkCost(lvl);
          return (
            <div key={p.id} className="perk-row">
              <span className="perk-name">
                {p.name}
                <small>{p.desc}</small>
              </span>
              <span className="perk-lvl">L{lvl}</span>
              <button disabled={sp < cost || lvl >= BAL.perkMaxLevel} onClick={() => buyPerk(p.id)}>
                +1 · {cost} SP
              </button>
            </div>
          );
        })}
        <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 10 }}>
          Perks are permanent across all future runs. Funding rounds unlock at {BAL.roundSpGate.slice(1).join(' / ')} total SP.
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- settings --

function SettingsPanel() {
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const requestConfirm = useGame((s) => s.requestConfirm);
  const newGame = useGame((s) => s.newGame);
  const achievements = useGame((s) => s.achievements);
  const addToast = useGame((s) => s.addToast);
  const caseId = useGame((s) => s.caseId);
  const [exported, setExported] = useState('');
  const [importStr, setImportStr] = useState('');
  const [constraint, setConstraint] = useState<RunConstraint>('none');

  if (caseId) {
    return (
      <div>
        <p style={{ color: 'var(--dim)', fontSize: 12 }}>
          A case study is running — save management is locked so the campaign snapshot stays intact. Finish or abort the
          engagement first.
        </p>
        <div className="settings-row">
          <span>
            Field notes
            <small>Short lessons on the real engineering behind what just happened</small>
          </span>
          <span className="spacer" />
          <input type="checkbox" checked={settings.lessons !== false} onChange={(e) => setSettings({ lessons: e.target.checked })} />
        </div>
        <div className="settings-row" style={{ borderBottom: 'none' }}>
          <span>
            Reduced motion
            <small>auto follows your OS setting</small>
          </span>
          <span className="spacer" />
          <select value={settings.reducedMotion} onChange={(e) => setSettings({ reducedMotion: e.target.value as 'auto' | 'on' | 'off' })}>
            <option value="auto">auto</option>
            <option value="on">on</option>
            <option value="off">off</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="settings-row">
        <span>
          Autosave
          <small>Every {BAL.autosaveSec}s and on tab close</small>
        </span>
        <span className="spacer" />
        <input type="checkbox" checked={settings.autosave} onChange={(e) => setSettings({ autosave: e.target.checked })} />
      </div>
      <div className="settings-row">
        <span>
          Field notes
          <small>Short lessons on the real engineering behind what just happened</small>
        </span>
        <span className="spacer" />
        <input
          type="checkbox"
          checked={settings.lessons !== false}
          onChange={(e) => setSettings({ lessons: e.target.checked })}
        />
      </div>
      <div className="settings-row">
        <span>
          Reduced motion
          <small>auto follows your OS setting</small>
        </span>
        <span className="spacer" />
        <select value={settings.reducedMotion} onChange={(e) => setSettings({ reducedMotion: e.target.value as 'auto' | 'on' | 'off' })}>
          <option value="auto">auto</option>
          <option value="on">on</option>
          <option value="off">off</option>
        </select>
      </div>
      <div className="settings-row">
        <span>
          Tutorial
          <small>Replay the interactive walkthrough of the core loop</small>
        </span>
        <span className="spacer" />
        <button
          onClick={() => {
            useGame.getState().setTutorialStep(0);
            useGame.getState().openModal(null);
          }}
        >
          Replay tutorial
        </button>
      </div>
      <div className="settings-row">
        <span>
          Save now
          <small>Also exports below</small>
        </span>
        <span className="spacer" />
        <button
          onClick={() => {
            saveNow();
            setExported(exportSave());
            addToast('ok', 'Saved', 'Export string refreshed below.');
          }}
        >
          Save & export
        </button>
      </div>
      {exported && (
        <textarea
          readOnly
          value={exported}
          rows={3}
          style={{ width: '100%', margin: '8px 0' }}
          onFocus={(e) => e.target.select()}
          aria-label="Exported save"
        />
      )}
      <div className="settings-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
        <span>
          Import save
          <small>Paste an UPTIME1. string — replaces the current game</small>
        </span>
        <textarea value={importStr} onChange={(e) => setImportStr(e.target.value)} rows={2} style={{ width: '100%' }} aria-label="Import save" />
        <button
          disabled={!importStr.trim()}
          onClick={() =>
            requestConfirm({
              title: 'Import save?',
              body: 'Your current game will be overwritten by the pasted save.',
              danger: true,
              confirmLabel: 'Import',
              onYes: () => {
                if (importSave(importStr)) addToast('ok', 'Save imported');
                else addToast('warn', 'Import failed', 'That does not look like a valid UPTIME save string.');
              },
            })
          }
        >
          Import
        </button>
      </div>
      <div className="settings-row">
        <span>
          New game
          <small>Fresh campaign — current run is lost. Constraint runs earn achievements at your first raise.</small>
        </span>
        <span className="spacer" />
        <select value={constraint} onChange={(e) => setConstraint(e.target.value as RunConstraint)} aria-label="Run constraint">
          <option value="none">no constraint</option>
          <option value="serverless">serverless-only</option>
          <option value="nocache">no caches</option>
          <option value="frugal">no upgrades</option>
        </select>
        <button
          onClick={() =>
            requestConfirm({
              title: 'Start a new campaign?',
              body: `Progress, scale points and perks are wiped. Blueprints and achievements are kept.${constraint !== 'none' ? ` Constraint: ${constraint}.` : ''}`,
              danger: true,
              confirmLabel: 'New game',
              onYes: () => newGame(false, constraint),
            })
          }
        >
          New game
        </button>
      </div>
      <div className="settings-row">
        <span>
          Sandbox mode
          <small>Unlimited budget, everything unlocked, traffic slider</small>
        </span>
        <span className="spacer" />
        <button
          onClick={() =>
            requestConfirm({
              title: 'Enter sandbox?',
              body: 'A separate freeplay canvas replaces the current run (achievements & blueprints carry over).',
              confirmLabel: 'Sandbox',
              onYes: () => newGame(true),
            })
          }
        >
          Sandbox
        </button>
      </div>
      <div className="settings-row" style={{ borderBottom: 'none' }}>
        <span>
          Hard reset
          <small>Delete the save entirely</small>
        </span>
        <span className="spacer" />
        <button
          className="danger"
          onClick={() =>
            requestConfirm({
              title: 'Delete everything?',
              body: 'Save file, blueprints, achievements, scale points. All of it. Forever.',
              danger: true,
              confirmLabel: 'Wipe',
              onYes: () => {
                clearSave();
                window.location.reload();
              },
            })
          }
        >
          Wipe
        </button>
      </div>

      <h4 style={{ margin: '14px 0 2px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Achievements {achievements.length}/{ACHIEVEMENTS.length}
      </h4>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => (
          <span key={a.id} className={`ach ${achievements.includes(a.id) ? 'got' : ''}`} title={a.desc}>
            {a.icon} {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- help --

function HelpPanel() {
  const seen = useGame((s) => s.lessonsSeen);
  return (
    <>
    <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--dim)' }}>
      Want the full manual? Read the{' '}
      <a href="https://github.com/MikheilSoziashvili/idle-game/blob/main/HANDBOOK.md" target="_blank" rel="noopener noreferrer">
        Player's Handbook ↗
      </a>{' '}
      — the complete catalog with trade-offs, the realism mechanics, the scaling ladder, and a field manual of failure patterns.
    </p>
    <div className="help-grid">
      <div>
        <h4>The loop</h4>
        <ul>
          <li>Traffic flows Internet → your graph. Served requests earn $; drops burn reputation.</li>
          <li>Every node adds latency and has finite capacity. Backlogs build, then spill.</li>
          <li>Slow responses earn less. Watch p95.</li>
          <li>Growth follows reputation. Reputation follows uptime.</li>
        </ul>
      </div>
      <div>
        <h4>Tools</h4>
        <ul>
          <li><kbd>V</kbd> move · <kbd>S</kbd> select · <kbd>W</kbd> wire · <kbd>U</kbd> upgrade · <kbd>X</kbd> bulldoze</li>
          <li>Wire mode: drag from anywhere on a node to another — ports auto-match. Click a wire to remove it.</li>
          <li><kbd>Z</kbd> zone: paint a pool that scales itself (wire an Autoscaler to it)</li>
          <li><kbd>R</kbd> region: paint a boundary, apply policies to everything inside</li>
          <li><kbd>B</kbd> stamp blueprints · save any selection as a module</li>
          <li><kbd>F</kbd> fit view · <kbd>L</kbd> auto-layout · <kbd>Space</kbd> pause · <kbd>1/2/3</kbd> speed</li>
        </ul>
      </div>
      <div>
        <h4>Architecture cheatsheet</h4>
        <ul>
          <li>Four wire types: web, storage, jobs, control (see the palette legend). Like connects to like — wire mode matches ports for you.</li>
          <li>Redis in front of Postgres: 85% of reads never touch the DB.</li>
          <li>CDN + S3 serves static for pennies at the edge.</li>
          <li>Kafka + workers absorb spikes you'd otherwise provision for.</li>
          <li>Load balancers split by headroom; raw DNS (Internet fan-out) splits blindly.</li>
        </ul>
      </div>
      <div>
        <h4>Automate everything</h4>
        <ul>
          <li>Autoscaler + Zone ends manual server-buying.</li>
          <li>CI/CD: 3s provisioning, cheaper upgrades.</li>
          <li>Kubernetes: zones self-heal through incidents.</li>
          <li>Stripe: revenue settles itself (until then, invoice from the dashboard).</li>
          <li>Prometheus prints Research Points from served traffic; Grafana amplifies.</li>
        </ul>
      </div>
    </div>

    <h4 style={{ margin: '18px 0 8px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      Field notes — {seen.length}/{LESSONS.length} collected
    </h4>
    <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--faint)' }}>
      Each note unlocks the first time you experience the real phenomenon on your own canvas. This is the actual
      platform-engineering curriculum — saturation, caching, queueing theory, nines — taught by your own traffic.
    </p>
    {LESSONS.map((l) => {
      const got = seen.includes(l.id);
      return (
        <div key={l.id} className={`fm-note ${got ? '' : 'unseen'}`}>
          <div className="fm-head">
            <span>{got ? '✓' : '·'} {got ? l.title : '???'}</span>
            <span className="lesson-tag">{got ? l.tag : 'not yet experienced'}</span>
          </div>
          {got ? <p>{l.body}</p> : <p>Keep building — this one finds you.</p>}
        </div>
      );
    })}

    <h4 style={{ margin: '18px 0 4px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      Glossary
    </h4>
    <div className="glossary-grid">
      {GLOSSARY.map((g) => (
        <div key={g.term} className="gloss">
          <b>{g.term}</b>
          {g.def}
        </div>
      ))}
    </div>
    </>
  );
}

// ----------------------------------------------------------------- doctor --

function DoctorPanel() {
  const [tick, setTick] = useState(0);
  const findings = useMemo(() => diagnose(useGame.getState()), [tick]);
  const sevColor = { crit: 'var(--bad)', warn: 'var(--amber, #b57700)', tip: 'var(--cat-observability)' } as const;
  const sevLabel = { crit: 'CRITICAL', warn: 'WARN', tip: 'TIP' } as const;
  return (
    <div>
      <p style={{ margin: '0 0 10px', color: 'var(--dim)', fontSize: 12 }}>
        A rule-based review of the live graph — prioritized and costed. The doctor points; you operate.
      </p>
      {findings.map((f, i) => (
        <div key={i} className="finding" style={{ borderLeftColor: sevColor[f.severity] }}>
          <div className="finding-head">
            <span className="mono" style={{ color: sevColor[f.severity], fontSize: 9.5 }}>
              {sevLabel[f.severity]}
            </span>
            <b>{f.title}</b>
          </div>
          <p>{f.detail}</p>
          {f.fix && <p className="finding-fix">→ {f.fix}</p>}
        </div>
      ))}
      <button className="primary" style={{ marginTop: 8 }} onClick={() => setTick(tick + 1)}>
        Re-examine
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- history --

function HistoryPanel() {
  const history = useGame((s) => s.history);
  const stats = useGame((s) => s.stats);
  const postmortems = useGame((s) => s.postmortems);
  const allTimeRev = useGame((s) => s.allTimeRev);
  const lifetimeRev = useGame((s) => s.lifetimeRev);
  const drill = useGame((s) => s.drill);

  const statGrid: [string, string][] = [
    ['all-time revenue', fmtMoney(allTimeRev + lifetimeRev)],
    ['requests served', fmtNum(stats.totalServed)],
    ['requests dropped', fmtNum(stats.totalDropped)],
    ['peak throughput', `${fmtNum(stats.peakServed)} rps`],
    ['best profit', `${fmtMoney(stats.bestProfitPerSec)}/s`],
    ['rounds raised', String(stats.prestiges)],
    ['spikes survived', String(stats.spikesSurvived)],
    ['incidents survived', String(stats.incidentsSurvived)],
    ['contracts delivered', `${stats.contractsCompleted} (${stats.contractsFailed} failed)`],
    ['drills passed', `${stats.drillsCompleted} (streak ${drill.streak})`],
    ['autoscale actions', String(stats.autoScaleActions)],
  ];

  return (
    <div>
      <div className="hist-stats">
        {statGrid.map(([k, v]) => (
          <div key={k} className="hist-stat">
            <b className="mono">{v}</b>
            <small>{k}</small>
          </div>
        ))}
      </div>

      <h4 style={{ margin: '16px 0 6px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Timeline
      </h4>
      {history.length === 0 && <p style={{ color: 'var(--faint)', fontSize: 12 }}>Nothing yet — go make some history.</p>}
      {history.map((h) => (
        <div key={`${h.at}-${h.icon}-${h.label}`} className="hist-row">
          <span className="hist-icon">{h.icon}</span>
          <span className="hist-label">{h.label}</span>
          <span className="hist-when mono">{new Date(h.at).toLocaleDateString()} {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}

      {postmortems.length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 6px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Post-incident reports (this run)
          </h4>
          {postmortems.map((pm) => (
            <div key={pm.id} className="hist-row" title={pm.takeaway}>
              <span className="hist-icon">▣</span>
              <span className="hist-label">
                {pm.title} — {pm.durSec}s, {pm.dropped} lost, −{pm.repLost} rep
                {pm.mitigations.length > 0 ? ` · held: ${pm.mitigations[0]}` : ''}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ case editor --

const EDITOR_METRICS: { id: CaseObjectiveDef['metric']; label: string; op: '<' | '>'; hint: string }[] = [
  { id: 'uptime', label: 'Uptime above (%)', op: '>', hint: '99.5' },
  { id: 'p95', label: 'p95 under (ms)', op: '<', hint: '150' },
  { id: 'dropped', label: 'Drops under (/s)', op: '<', hint: '1' },
  { id: 'served', label: 'Serve at least (rps)', op: '>', hint: '100' },
  { id: 'cost', label: 'Cost under ($/s)', op: '<', hint: '2' },
  { id: 'profit', label: 'Profit above ($/s)', op: '>', hint: '5' },
];

function CaseEditorPanel() {
  const s = useGame;
  const [title, setTitle] = useState('My challenge');
  const [brief, setBrief] = useState('Beat my architecture problem.');
  const [cash, setCash] = useState(1500);
  const [baseRps, setBaseRps] = useState(80);
  const [timeLimit, setTimeLimit] = useState(420);
  const [objectives, setObjectives] = useState<{ metric: CaseObjectiveDef['metric']; value: number; holdSec: number; on: boolean }[]>([
    { metric: 'uptime', value: 99, holdSec: 90, on: true },
    { metric: 'p95', value: 150, holdSec: 60, on: false },
    { metric: 'dropped', value: 1, holdSec: 90, on: false },
  ]);
  const [spikeAt, setSpikeAt] = useState(120);
  const [spikeMult, setSpikeMult] = useState(2.5);
  const [code, setCode] = useState('');

  const build = (): CaseDef | null => {
    const st = s.getState();
    const nodes = st.nodes;
    if (nodes.length < 2) return null;
    const minX = Math.min(...nodes.map((n) => n.x)) - 60;
    const minY = Math.min(...nodes.map((n) => n.y)) - 60;
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const objs = objectives
      .filter((o) => o.on)
      .map((o, i) => {
        const meta = EDITOR_METRICS.find((m) => m.id === o.metric)!;
        return { id: `o${i}`, label: `${meta.label.replace(/\(.*\)/, '').trim()} ${o.value}`, metric: o.metric, op: meta.op, value: o.value, holdSec: Math.max(15, o.holdSec) };
      });
    if (objs.length === 0) return null;
    return {
      id: 'custom-pending',
      track: 'custom',
      title: title.slice(0, 60) || 'Community challenge',
      client: 'community — player-designed',
      brief: brief.slice(0, 400),
      teach: 'Player-designed scenario.',
      aws: 'community',
      cash,
      research: [...st.research],
      tiers: [...st.tiers],
      baseRps,
      nodes: nodes.map((n) => ({
        kind: n.kind,
        x: n.x - minX,
        y: n.y - minY,
        level: n.level,
        zone: n.zone
          ? { template: n.zone.template, name: n.zone.name, w: n.zone.w, h: n.zone.h, min: n.zone.min, max: n.zone.max, instances: n.zone.instances, targetUtil: n.zone.targetUtil }
          : undefined,
      })),
      edges: st.edges
        .filter((e) => idx.has(e.source) && idx.has(e.target))
        .map((e) => ({ si: idx.get(e.source)!, sh: e.sourceHandle, ti: idx.get(e.target)!, th: e.targetHandle })),
      events: spikeMult > 1 ? [{ at: spikeAt, kind: 'spike', mult: spikeMult, durSec: 60, label: 'designer surge' }] : [],
      objectives: objs,
      timeLimitSec: timeLimit,
      failCashBelow: -250,
      debrief: 'A community-designed scenario, survived. Export your own from the sandbox.',
      rewardRp: 20,
    };
  };

  const doExport = () => {
    const def = build();
    if (!def) {
      s.getState().addToast('warn', 'Cannot export', 'Need at least 2 nodes on the canvas and 1 enabled objective.');
      return;
    }
    setCode(exportCaseCode(def));
  };

  return (
    <div>
      <p style={{ margin: '0 0 10px', color: 'var(--dim)', fontSize: 12 }}>
        The current canvas becomes the starting architecture. Set the budget, traffic and SLOs, export the code, and
        anyone can play it from Cases → Community.
      </p>
      <div className="editor-grid">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
        </label>
        <label>
          Brief
          <input value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={200} />
        </label>
        <label>
          Budget ($)
          <input type="number" value={cash} min={100} max={50000} onChange={(e) => setCash(+e.target.value)} />
        </label>
        <label>
          Traffic (rps)
          <input type="number" value={baseRps} min={1} max={5000} onChange={(e) => setBaseRps(+e.target.value)} />
        </label>
        <label>
          Time limit (s)
          <input type="number" value={timeLimit} min={120} max={1200} onChange={(e) => setTimeLimit(+e.target.value)} />
        </label>
        <label>
          Spike ×{spikeMult.toFixed(1)} at {spikeAt}s
          <span style={{ display: 'flex', gap: 6 }}>
            <input type="range" min={1} max={5} step={0.1} value={spikeMult} onChange={(e) => setSpikeMult(+e.target.value)} />
            <input type="range" min={30} max={400} value={spikeAt} onChange={(e) => setSpikeAt(+e.target.value)} />
          </span>
        </label>
      </div>

      <h4 style={{ margin: '12px 0 6px', fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Objectives (hold continuously)
      </h4>
      {objectives.map((o, i) => (
        <div key={i} className="editor-obj">
          <input
            type="checkbox"
            checked={o.on}
            onChange={(e) => setObjectives(objectives.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
          />
          <select
            value={o.metric}
            onChange={(e) => setObjectives(objectives.map((x, j) => (j === i ? { ...x, metric: e.target.value as CaseObjectiveDef['metric'] } : x)))}
          >
            {EDITOR_METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={o.value}
            style={{ width: 80 }}
            onChange={(e) => setObjectives(objectives.map((x, j) => (j === i ? { ...x, value: +e.target.value } : x)))}
          />
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>hold</span>
          <input
            type="number"
            value={o.holdSec}
            style={{ width: 64 }}
            onChange={(e) => setObjectives(objectives.map((x, j) => (j === i ? { ...x, holdSec: +e.target.value } : x)))}
          />
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>s</span>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="primary" onClick={doExport}>
          Export challenge code
        </button>
      </div>
      {code && (
        <textarea readOnly value={code} rows={3} style={{ width: '100%', marginTop: 8 }} onFocus={(e) => e.target.select()} aria-label="Challenge code" />
      )}
    </div>
  );
}
