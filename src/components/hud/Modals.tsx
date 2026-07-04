import { useEffect, useMemo, useState } from 'react';
import { ACHIEVEMENTS } from '../../game/catalog/achievements';
import { CASES, caseById } from '../../game/catalog/casestudies';
import { GLOSSARY, LESSONS } from '../../game/catalog/lessons';
import { RESEARCH, researchDepth } from '../../game/catalog/research';
import { TIERS } from '../../game/catalog/tiers';
import { BAL, fmtMoney, pendingSp, perkCost } from '../../game/engine/balance';
import { roundIndex } from '../../game/engine/economy';
import type { PerkId } from '../../game/engine/types';
import { clearSave, exportSave, importSave, saveNow } from '../../game/state/save';
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
        <Shell title="Case studies — consulting engagements for real-world patterns" onClose={() => openModal(null)}>
          <CasesPanel />
        </Shell>
      )}
      {modal === 'casedone' && (
        <Shell title="Engagement debrief" onClose={() => openModal(null)} narrow>
          <DebriefPanel />
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

function CasesPanel() {
  const completed = useGame((s) => s.casesCompleted);
  const caseId = useGame((s) => s.caseId);
  const enterCase = useGame((s) => s.enterCase);
  const requestConfirm = useGame((s) => s.requestConfirm);

  return (
    <>
      <p style={{ margin: '0 0 12px', color: 'var(--dim)', fontSize: 12, lineHeight: 1.5 }}>
        Six client engagements, each modeling a pattern you'd deploy on AWS. You get their half-built architecture, a
        budget, scripted traffic and incidents, and SLOs to hold. Your campaign is snapshotted and restored afterwards;
        passing pays Research Points back to the company.
      </p>
      {CASES.map((c) => {
        const done = completed.includes(c.id);
        return (
          <div key={c.id} className={`case-card ${done ? 'done-before' : ''}`}>
            <div className="case-info">
              <div className="case-client">{c.client}</div>
              <h3>
                {done ? '✓ ' : ''}
                {c.title}
              </h3>
              <p className="case-brief">{c.brief}</p>
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
              disabled={Boolean(caseId)}
              onClick={() =>
                requestConfirm({
                  title: `Take the engagement: ${c.title}?`,
                  body: 'Your campaign is saved and will be restored when you finish or abort.',
                  confirmLabel: 'Start',
                  onYes: () => enterCase(c.id),
                })
              }
            >
              {done ? 'Replay' : 'Start'}
            </button>
          </div>
        );
      })}
    </>
  );
}

function DebriefPanel() {
  const caseId = useGame((s) => s.caseId);
  const status = useGame((s) => s.caseStatus);
  const objectives = useGame((s) => s.caseObjectives);
  const exitCase = useGame((s) => s.exitCase);
  const retryCase = useGame((s) => s.retryCase);
  if (!caseId) return <p style={{ color: 'var(--dim)' }}>No engagement running.</p>;
  const def = caseById.get(caseId);
  if (!def) return null;
  const passed = status === 'passed';

  return (
    <div>
      <div className={`debrief-banner ${passed ? 'pass' : 'fail'}`}>
        {passed
          ? `Engagement closed — ${def.client} renews. +${def.rewardRp} RP on exit.`
          : status === 'failed'
            ? 'Engagement failed — the client is unimpressed. Retry or head home.'
            : 'Engagement still running.'}
      </div>
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

  const pending = pendingSp(lifetimeRev);
  const can = pending >= BAL.prestigeMinSp && !sandbox;
  const round = roundIndex(spTotal);
  const nextRound = roundIndex(spTotal + pending);

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
        <button
          className={can ? 'primary' : ''}
          disabled={!can}
          onClick={() =>
            requestConfirm({
              title: `Close the ${BAL.roundNames[nextRound]} round?`,
              body: `The whole platform is decommissioned for +${pending} SP. Blueprints survive. This is the point.`,
              danger: true,
              confirmLabel: `Raise ${BAL.roundNames[nextRound]}`,
              onYes: doPrestige,
            })
          }
          style={{ width: '100%' }}
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
          <small>Fresh campaign — current run is lost</small>
        </span>
        <span className="spacer" />
        <button
          onClick={() =>
            requestConfirm({
              title: 'Start a new campaign?',
              body: 'Progress, scale points and perks are wiped. Blueprints and achievements are kept.',
              danger: true,
              confirmLabel: 'New game',
              onYes: () => newGame(false),
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
          <li><kbd>V</kbd> move · <kbd>W</kbd> wire · <kbd>U</kbd> upgrade · <kbd>X</kbd> bulldoze</li>
          <li><kbd>Z</kbd> zone: paint a pool that scales itself (wire an Autoscaler to it)</li>
          <li><kbd>R</kbd> region: paint a boundary, apply policies to everything inside</li>
          <li><kbd>B</kbd> stamp blueprints · save any selection as a module</li>
          <li><kbd>F</kbd> fit view · <kbd>L</kbd> auto-layout · <kbd>Space</kbd> pause · <kbd>1/2/3</kbd> speed</li>
        </ul>
      </div>
      <div>
        <h4>Architecture cheatsheet</h4>
        <ul>
          <li>Ports are typed by color: http, data, jobs, control. Like connects to like.</li>
          <li>Redis in front of Postgres: 80% of reads never touch the DB.</li>
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
