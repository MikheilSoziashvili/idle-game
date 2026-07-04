import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame } from '../../game/state/store';

// ---------------------------------------------------------------------------
// The interactive tutorial. Steps advance by WATCHING the game state (placed a
// server → wired it → served a request → scaled), not by "Next" alone — the
// player learns the loop by doing it. Skippable at every step; replayable from
// Settings. tutorialStep: -2 never offered, -1 done, >=0 active.
// ---------------------------------------------------------------------------

interface TutStep {
  title: string;
  body: string;
  hint?: string; // small mono line under the body
  cta?: string; // if set, a button advances; otherwise the game does
  /** auto-advance condition, evaluated against watched state */
  done?: (w: Watched) => boolean;
  waitLabel?: string; // shown while waiting on `done`
}

interface Watched {
  placed: number; // non-internet nodes
  wires: number;
  served: number;
  scaled: boolean; // upgraded any node OR placed a second server
}

export const TUTORIAL_STEPS: TutStep[] = [
  {
    title: 'You are the platform team now',
    body:
      'Everything here is real infrastructure with real behavior: Nginx, Postgres, Redis, Kafka. Users send requests; served requests pay; dropped requests burn your reputation — and reputation is your growth rate. Your job: keep the site up while traffic grows.',
    cta: "Let's build",
  },
  {
    title: 'Deploy your first server',
    body:
      'Drag Nginx from the Infrastructure palette (bottom-left) anywhere onto the canvas. Double-clicking the palette entry works too. It costs $60 and takes a few seconds to boot — provisioning is never instant, even here.',
    hint: 'palette → drag Nginx onto the canvas',
    done: (w) => w.placed >= 1,
    waitLabel: 'waiting for a server…',
  },
  {
    title: 'Wire it to the internet',
    body:
      'Nothing flows until you connect it. Press W for the Wire tool, then drag from anywhere on the Internet card onto your Nginx — compatible ports match automatically. Esc puts you back on Move.',
    hint: 'W → drag Internet → Nginx',
    done: (w) => w.wires >= 1,
    waitLabel: 'waiting for a connection…',
  },
  {
    title: 'You are live',
    body:
      'Those moving dots are requests, and every served one pays. The top bar is your cockpit: RPS served, p95 latency, profit, uptime. Click any gauge to see exactly why the number is what it is.',
    hint: 'serve your first requests (the server may still be booting)',
    done: (w) => w.served >= 1,
    waitLabel: 'waiting for traffic…',
  },
  {
    title: 'Scale before it hurts',
    body:
      'Traffic grows while your uptime holds, and every node has finite capacity — watch the little utilization bar fill. Past ~85% latency explodes, then requests drop. Head it off: select your Nginx and Upgrade it, or place a second server.',
    hint: 'upgrade a node (select it → Upgrade) — or place another server',
    done: (w) => w.scaled,
    waitLabel: 'waiting for capacity…',
  },
  {
    title: 'Your quest log',
    body:
      'Objectives (top-left) pay cash and unlock tools — they are the tour of everything else. At $150 lifetime revenue, deploy Prometheus: it turns traffic into Research Points for the tech tree. At 10 rps, SLA contracts start appearing under the objectives.',
    cta: 'Got it',
  },
  {
    title: 'The rest, incidents will teach you',
    body:
      'Products launches bigger workloads. Cases are real architectures as playable levels — a URL shortener up to Netflix. Every node links to its real documentation in the Inspector. When something breaks (it will), you get a postmortem explaining what held and what would have helped. Good luck.',
    cta: 'Finish',
  },
];

export default function TutorialCard() {
  const step = useGame((s) => s.tutorialStep);
  const caseId = useGame((s) => s.caseId);
  const sandbox = useGame((s) => s.sandbox);
  const setStep = useGame((s) => s.setTutorialStep);
  const watched = useGame(
    useShallow((s): Watched => ({
      placed: s.nodes.filter((n) => n.kind !== 'users').length,
      wires: s.edges.length,
      served: s.live.gauges.served,
      scaled: s.nodes.some((n) => n.level >= 2) || s.nodes.filter((n) => n.kind !== 'users').length >= 2,
    })),
  );

  const active = step >= 0 && step < TUTORIAL_STEPS.length && !caseId && !sandbox;
  const def = active ? TUTORIAL_STEPS[step] : null;

  // Condition-driven advancement. Synchronous on purpose: `watched` changes
  // every engine tick, so a delayed timeout would be cleared before firing.
  useEffect(() => {
    if (!active || !def?.done) return;
    if (def.done(watched)) setStep(step + 1 >= TUTORIAL_STEPS.length ? -1 : step + 1);
  }, [active, def, watched, step, setStep]);

  if (!active || !def) return null;
  const last = step === TUTORIAL_STEPS.length - 1;

  return (
    <div className="lesson-card tutorial" role="note" aria-label={`Tutorial: ${def.title}`}>
      <div className="lesson-head">
        <span className="lesson-icon">◈</span>
        <span className="lesson-kicker">tutorial</span>
        <span className="tut-dots" aria-label={`step ${step + 1} of ${TUTORIAL_STEPS.length}`}>
          {TUTORIAL_STEPS.map((_, i) => (
            <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />
          ))}
        </span>
      </div>
      <h3>{def.title}</h3>
      <p>{def.body}</p>
      {def.hint && <p className="tut-hint mono">→ {def.hint}</p>}
      <div className="lesson-foot">
        <button className="ghost tut-skip" onClick={() => setStep(-1)}>
          skip tutorial
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        {def.cta ? (
          <button className="primary" onClick={() => setStep(last ? -1 : step + 1)}>
            {def.cta}
          </button>
        ) : (
          <span className="lesson-more tut-wait">{def.waitLabel ?? 'waiting…'}</span>
        )}
      </div>
    </div>
  );
}
