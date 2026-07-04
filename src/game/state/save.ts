import { BAL } from '../engine/balance';
import type { GameStore } from './store';
import { useGame } from './store';

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
  'casesCompleted',
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
  partial.blueprints = Array.isArray(blob.blueprints) ? blob.blueprints : [];
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
