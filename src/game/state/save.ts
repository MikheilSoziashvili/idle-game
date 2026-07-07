import { BAL } from '../engine/balance';
import type { Blueprint, PlacedEdge } from '../engine/types';
import type { CaseDef } from '../catalog/casestudies';
import type { GameStore } from './store';
import { emptyStats, useGame } from './store';

// localStorage persistence. Saves are small JSON blobs; every operation is
// wrapped so a storage failure can never crash the game.

const KEY = 'uptime.save.v1';
const EXPORT_PREFIX = 'UPTIME1.';

const SAVED_FIELDS = [
  'nodes',
  'edges',
  'regions',
  'idCounter',
  'cash',
  'ar',
  'rp',
  'sp',
  'spTotal',
  'spSpentOn',
  'rep',
  'lifetimeRev',
  'allTimeRev',
  'tiers',
  'research',
  'milestones',
  'achievements',
  'scale',
  'simTime',
  'sandbox',
  'sandboxDemand',
  'stats',
  'settings',
  'lessonsSeen',
  'tutorialStep',
  'casesCompleted',
  // live-ops layer (all absent in old saves → defaults survive)
  'customCases',
  'contractOffers',
  'activeContract',
  'contractsRefreshAt',
  'postmortems',
  'drill',
  'history',
  'mandate',
  'rival',
  'runConstraint',
  'insuranceUsed',
  'featureLevel',
  'releaseReadyAt',
] as const;

interface SaveBlob {
  v: number;
  savedAt: number;
  profitPerSec: number;
  blueprints: GameStore['blueprints'];
  data: Record<string, unknown>;
}

function buildBlob(): SaveBlob {
  const s = useGame.getState();
  const data: Record<string, unknown> = {};
  for (const f of SAVED_FIELDS) data[f] = s[f];
  return {
    v: BAL.version,
    savedAt: Date.now(),
    profitPerSec: Math.max(0, s.live.gauges.profitPerSec),
    blueprints: s.blueprints.filter((b) => !b.builtin),
    data,
  };
}

let wiped = false; // set by clearSave: block re-saving on the way out

export function saveNow(): boolean {
  if (wiped) return false;
  // Never overwrite the campaign snapshot with in-case state: the main key
  // holds the campaign for the whole duration of a case study.
  if (useGame.getState().caseId) return false;
  try {
    const blob = buildBlob();
    localStorage.setItem(KEY, JSON.stringify(blob));
    useGame.getState().markSaved(blob.savedAt);
    return true;
  } catch {
    return false; // storage full / private mode — keep playing, never crash
  }
}

export interface LoadResult {
  loaded: boolean;
  offlineEarnings: number;
  awaySec: number;
}

export function tryLoad(): LoadResult {
  const none: LoadResult = { loaded: false, offlineEarnings: 0, awaySec: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return none;
    const blob = JSON.parse(raw) as SaveBlob;
    if (!blob || typeof blob !== 'object' || !blob.data) return none;
    applyBlob(blob);
    // Offline progress: accrue capped revenue for time away at reduced efficiency.
    const awaySec = Math.max(0, (Date.now() - blob.savedAt) / 1000);
    let offlineEarnings = 0;
    if (awaySec >= BAL.offlineMinSec && blob.profitPerSec > 0) {
      const effSec = Math.min(awaySec, BAL.offlineCapHours * 3600);
      offlineEarnings = Math.round(blob.profitPerSec * effSec * BAL.offlineEfficiency);
      const s = useGame.getState();
      useGame.setState({ cash: s.cash + offlineEarnings, allTimeRev: s.allTimeRev + offlineEarnings, lifetimeRev: s.lifetimeRev + offlineEarnings });
    }
    return { loaded: true, offlineEarnings, awaySec };
  } catch {
    return none;
  }
}

function applyBlob(blob: SaveBlob) {
  const partial: Partial<GameStore> = {};
  for (const f of SAVED_FIELDS) {
    if (f in blob.data) (partial as Record<string, unknown>)[f] = blob.data[f];
  }
  // stats gained fields over time — old saves get the missing shape backfilled
  partial.stats = { ...emptyStats(), ...(partial.stats ?? {}) };
  partial.blueprints = Array.isArray(blob.blueprints) ? blob.blueprints : [];
  // migrate pre-merge saves: the replica's dedicated 'repl-in' port became 'data-in'
  if (Array.isArray(partial.edges)) {
    partial.edges = (partial.edges as PlacedEdge[]).map((e) =>
      e.targetHandle === 'repl-in' ? { ...e, targetHandle: 'data-in' } : e,
    );
  }
  partial.blueprints = partial.blueprints.map((bp) => ({
    ...bp,
    edges: bp.edges.map((be) => (be.th === 'repl-in' ? { ...be, th: 'data-in' } : be)),
  }));
  partial.lastSaved = blob.savedAt;
  useGame.getState().loadState(partial);
}

export function exportSave(): string {
  try {
    const json = JSON.stringify(buildBlob());
    return EXPORT_PREFIX + btoa(unescape(encodeURIComponent(json)));
  } catch {
    return '';
  }
}

export function importSave(str: string): boolean {
  try {
    const trimmed = str.trim();
    if (!trimmed.startsWith(EXPORT_PREFIX)) return false;
    const json = decodeURIComponent(escape(atob(trimmed.slice(EXPORT_PREFIX.length))));
    const blob = JSON.parse(json) as SaveBlob;
    if (!blob || !blob.data || typeof blob.data !== 'object') return false;
    applyBlob(blob);
    saveNow();
    return true;
  } catch {
    return false;
  }
}

/** Re-apply the campaign snapshot after a case study (no offline accrual). */
export function restoreCampaign(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    applyBlob(JSON.parse(raw) as SaveBlob);
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  wiped = true; // beforeunload/autosave must not resurrect the save
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// ------------------------------ share codes ---------------------------------
// Blueprints and player-authored challenges travel as short base64 strings —
// paste them in a Discord and the community does the content design.

const BP_PREFIX = 'UPBP1.';
const CASE_PREFIX = 'UPCASE1.';

const enc = (obj: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
const dec = <T,>(prefix: string, str: string): T | null => {
  try {
    const trimmed = str.trim();
    if (!trimmed.startsWith(prefix)) return null;
    return JSON.parse(decodeURIComponent(escape(atob(trimmed.slice(prefix.length))))) as T;
  } catch {
    return null;
  }
};

export function exportBlueprintCode(bp: Blueprint): string {
  try {
    return BP_PREFIX + enc({ name: bp.name, nodes: bp.nodes, edges: bp.edges });
  } catch {
    return '';
  }
}

export function importBlueprintCode(str: string): boolean {
  const data = dec<Pick<Blueprint, 'name' | 'nodes' | 'edges'>>(BP_PREFIX, str);
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || data.nodes.length === 0) return false;
  const s = useGame.getState();
  const bp: Blueprint = {
    id: `bp${Date.now().toString(36)}`,
    name: String(data.name || 'imported.module').slice(0, 40),
    nodes: data.nodes.slice(0, 40).map((n) => ({ ...n, level: Math.max(1, Math.min(BAL.maxLevel, Math.round(n.level || 1))) })),
    edges: data.edges.slice(0, 80),
  };
  useGame.setState({ blueprints: [...s.blueprints, bp] });
  s.addToast('ok', `Blueprint imported: ${bp.name}`, `${bp.nodes.length} resources. Stamp it with B.`);
  return true;
}

export function exportCaseCode(def: CaseDef): string {
  try {
    return CASE_PREFIX + enc(def);
  } catch {
    return '';
  }
}

export function importCaseCode(str: string): boolean {
  const def = dec<CaseDef>(CASE_PREFIX, str);
  if (!def || !def.title || !Array.isArray(def.nodes) || !Array.isArray(def.objectives) || def.objectives.length === 0) return false;
  // hard-sanitize: imported content is data, never trusted
  const safe: CaseDef = {
    ...def,
    id: `custom-${Math.abs(hashStr(JSON.stringify(def))).toString(36)}`,
    track: 'custom',
    requires: undefined,
    title: String(def.title).slice(0, 60),
    client: String(def.client || 'community challenge').slice(0, 60),
    brief: String(def.brief || '').slice(0, 400),
    teach: String(def.teach || 'Community-designed scenario.').slice(0, 120),
    aws: String(def.aws || 'custom').slice(0, 60),
    cash: Math.max(100, Math.min(50000, Math.round(def.cash || 1000))),
    baseRps: Math.max(1, Math.min(5000, Math.round(def.baseRps || 50))),
    timeLimitSec: Math.max(120, Math.min(1200, Math.round(def.timeLimitSec || 420))),
    rewardRp: Math.max(0, Math.min(60, Math.round(def.rewardRp ?? 20))),
    nodes: def.nodes.slice(0, 40),
    edges: (def.edges ?? []).slice(0, 80),
    events: (def.events ?? []).slice(0, 8),
    objectives: def.objectives.slice(0, 4),
    tiers: (def.tiers ?? [1]).filter((t) => t >= 1 && t <= 6),
    research: (def.research ?? []).slice(0, 16),
  };
  return useGame.getState().addCustomCase(safe);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/** One flavor line about what your automation did while you were away. */
export function offlineStory(awayHrs: number): string | null {
  const s = useGame.getState();
  const kinds = new Set(s.nodes.filter((n) => !n.disabled).map((n) => n.kind));
  const zones = s.nodes.filter((n) => n.kind === 'zone');
  const wee = ['2:41am', '3:12am', '4:07am', '5:33am'][Math.floor(Math.random() * 4)];
  const options: string[] = [];
  if (kinds.has('autoscaler') && zones.length > 0)
    options.push(`Your autoscaler rode out a ${(1.6 + Math.random() * 1.2).toFixed(1)}× surge at ${wee}. Nobody woke up.`);
  if (kinds.has('k8s')) options.push(`k8s rescheduled a failed instance at ${wee} and did not consider it worth mentioning.`);
  if (kinds.has('stripe')) options.push(`Stripe settled ${Math.max(3, Math.round(awayHrs * 7))} invoices while you slept.`);
  if (kinds.has('queue') || kinds.has('rabbitmq') || kinds.has('sqs'))
    options.push(`The queue quietly absorbed a batch-job pileup around ${wee} and drained it by morning.`);
  if (options.length === 0) return awayHrs >= 1 ? 'Traffic waited politely. Mostly. (Automation would have stories to tell.)' : null;
  return options[Math.floor(Math.random() * options.length)];
}

let autosaveStarted = false;
export function startAutosave() {
  if (autosaveStarted) return;
  autosaveStarted = true;
  window.setInterval(() => {
    if (useGame.getState().settings.autosave) saveNow();
  }, BAL.autosaveSec * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('beforeunload', () => saveNow());
}
