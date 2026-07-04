import { caseById, type CaseDef, type CaseEventDef } from './casestudies';

// ---------------------------------------------------------------------------
// The weekly challenge: one seeded scenario per ISO week — same budget, same
// scripted events for everyone. Scores serialize to a short shareable string
// (no backend: paste-in-Discord leaderboards).
// Also home of resolveCase(): the one lookup that sees static cases, the
// weekly challenge AND player-imported custom cases.
// ---------------------------------------------------------------------------

/** Deterministic PRNG so every player gets the identical week. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isoWeekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function seedFromWeek(week: string): number {
  let h = 2166136261;
  for (let i = 0; i < week.length; i++) {
    h ^= week.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildWeeklyChallenge(week: string): CaseDef {
  const rand = mulberry32(seedFromWeek(week));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const baseRps = 60 + Math.floor(rand() * 6) * 20; // 60..160
  const cash = 1400 + Math.floor(rand() * 5) * 300; // 1400..2600
  const tiers = pick([[1, 3], [2, 3], [1, 4], [3], [2, 5]]);
  const research = ['caching', 'queues', 'gateway', 'autoscaling', 'containers', 'replicas', 'cdn'].filter(() => rand() > 0.35);
  if (!research.includes('caching')) research.push('caching');
  if (research.includes('autoscaling') && !research.includes('containers')) research.push('containers');

  const events: CaseEventDef[] = [];
  const n = 2 + Math.floor(rand() * 2);
  const kinds: CaseEventDef['kind'][] = ['spike', 'db_slow', 'dep_failure', 'outage', 'spike'];
  for (let i = 0; i < n; i++) {
    const kind = pick(kinds);
    events.push({
      at: 70 + i * 110 + Math.floor(rand() * 40),
      kind,
      mult: kind === 'spike' ? 2 + rand() * 1.8 : undefined,
      durSec: kind === 'spike' ? 45 + Math.floor(rand() * 45) : undefined,
      label: kind === 'spike' ? 'scheduled surge' : undefined,
    });
  }

  const p95Target = pick([120, 150, 180]);
  const uptimeTarget = pick([99, 99.5, 99.9]);

  return {
    id: `challenge-${week}`,
    track: 'challenge',
    title: `Weekly challenge · ${week}`,
    client: 'the community — same seed for everyone',
    brief: `This week's board: ${baseRps} rps of mixed traffic, $${cash} budget, ${n} scripted events. Identical for every player — build it better than the internet does.`,
    teach: 'Same constraints, different architectures. Compare notes.',
    aws: `seed ${week}`,
    cash,
    research,
    tiers,
    baseRps,
    nodes: [
      { kind: 'users', x: 60, y: 250 },
      { kind: 'nginx', x: 360, y: 250, level: 2 },
    ],
    edges: [{ si: 0, sh: 'http-out', ti: 1, th: 'http-in' }],
    events,
    objectives: [
      { id: 'up', label: `Uptime above ${uptimeTarget}%`, metric: 'uptime', op: '>', value: uptimeTarget, holdSec: 150 },
      { id: 'lat', label: `p95 under ${p95Target}ms`, metric: 'p95', op: '<', value: p95Target, holdSec: 90 },
      { id: 'profit', label: 'Profitable ($3+/s)', metric: 'profit', op: '>', value: 3, holdSec: 60 },
    ],
    timeLimitSec: 480,
    failCashBelow: -250,
    debrief:
      'Same seed, same storms — the only variable was the architecture. Encode your score below and compare: the interesting question is never "did you pass", it is what the OTHER passing builds look like.',
    rewardRp: 25,
  };
}

export const CURRENT_WEEK = isoWeekOf(new Date());
export const WEEKLY_CHALLENGE = buildWeeklyChallenge(CURRENT_WEEK);

/** Score string for a finished weekly run: shareable, lightly checksummed. */
export function encodeChallengeScore(week: string, uptime: number, p95: number, cashLeft: number): string {
  const score = Math.max(0, Math.round(uptime * 100) + Math.round(Math.max(0, 400 - p95)) + Math.round(cashLeft / 10));
  const payload = `${week}:${score}`;
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum = (sum + payload.charCodeAt(i) * (i + 7)) % 9973;
  return `UPWK1.${payload}:${sum.toString(36)}`;
}

/** Resolve any case id: static catalog, this week's challenge, or an imported custom case. */
export function resolveCase(id: string | null | undefined, custom?: CaseDef[]): CaseDef | undefined {
  if (!id) return undefined;
  return caseById.get(id) ?? (id === WEEKLY_CHALLENGE.id ? WEEKLY_CHALLENGE : undefined) ?? custom?.find((c) => c.id === id);
}
