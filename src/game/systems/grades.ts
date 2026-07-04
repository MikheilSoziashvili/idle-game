import { BAL } from '../engine/balance';
import type { GameStore } from '../state/store';

// Run report card: three axes scored 0..1, letter-graded, plus a title drawn
// from the strongest axis. Shown in the prestige panel so different players
// can chase different identities on the same sandbox.

export interface RunGrade {
  cost: number; // $ efficiency
  speed: number; // latency
  resilience: number; // uptime discipline
  letters: { cost: string; speed: string; resilience: string };
  title: string;
}

const letter = (x: number) => (x >= 0.9 ? 'S' : x >= 0.75 ? 'A' : x >= 0.5 ? 'B' : x >= 0.25 ? 'C' : 'D');

const TITLES: Record<string, [string, string]> = {
  cost: ['The FinOps Surgeon', 'Runs lean. The CFO sends holiday cards.'],
  speed: ['The Speed Demon', 'p95 so low the packets apologize for the detour.'],
  resilience: ['The Nine-Nines Monk', 'Outages arrive, bore themselves, and leave.'],
};

export function gradeRun(st: GameStore): RunGrade {
  const g = st.live.gauges;

  // cost: profit margin (profit / revenue), 60%+ margin = perfect
  const margin = g.revenuePerSec > 0.5 ? Math.max(0, g.profitPerSec / g.revenuePerSec) : 0;
  const cost = Math.min(1, margin / 0.6);

  // speed: p95 against the SLA notch (250ms) — 60ms or less = perfect
  const speed = g.served > 1 ? Math.min(1, Math.max(0, (BAL.slaTargetMs - g.p95) / (BAL.slaTargetMs - 60))) : 0;

  // resilience: uptime mapped 99→0, 99.99→1, sweetened by streaks/spikes survived
  const up = Math.min(1, Math.max(0, (g.uptime - 99) / 0.99));
  const bonus = Math.min(0.15, st.stats.spikesSurvived * 0.03 + (st.stats.fourNinesStreak > 120 ? 0.06 : 0));
  const resilience = Math.min(1, up + bonus);

  const axes = { cost, speed, resilience };
  const best = (Object.keys(axes) as (keyof typeof axes)[]).sort((a, b) => axes[b] - axes[a])[0];
  const allWeak = Math.max(cost, speed, resilience) < 0.35;

  return {
    ...axes,
    letters: { cost: letter(cost), speed: letter(speed), resilience: letter(resilience) },
    title: allWeak ? 'The Intern With Root Access' : TITLES[best][0],
  };
}

export function gradeBlurb(grade: RunGrade): string {
  if (grade.title === 'The Intern With Root Access') return 'Everything is on fire, but you have learned so much.';
  const best = grade.title === TITLES.cost[0] ? 'cost' : grade.title === TITLES.speed[0] ? 'speed' : 'resilience';
  return TITLES[best][1];
}
