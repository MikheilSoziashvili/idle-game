import { create } from 'zustand';
import {
  BAL,
  perkCost,
  roundForSp,
  totalSpentAtLevel,
  upgradeCost,
} from '../engine/balance';
import type {
  ActiveEvent,
  Blueprint,
  ContractInstance,
  DrillState,
  EdgeLive,
  Gauges,
  HistoryEntry,
  LogEntry,
  MandateId,
  NodeKind,
  NodeLive,
  Overlay,
  PerkId,
  PlacedEdge,
  PlacedNode,
  PortType,
  Postmortem,
  RegionRect,
  RivalState,
  RunConstraint,
  Tool,
  ZoneState,
} from '../engine/types';
import { SPECS, specOf } from '../catalog/nodes';
import { STARTER_BLUEPRINTS } from '../catalog/blueprints';
import { TIERS } from '../catalog/tiers';
import { researchById } from '../catalog/research';
import { milestoneById } from '../catalog/milestones';
import { MILESTONES } from '../catalog/milestones';
import { achievementById } from '../catalog/achievements';
import type { CaseDef } from '../catalog/casestudies';
import { resolveCase } from '../catalog/challenge';
import { mandateById } from '../catalog/mandates';

// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  kind: 'info' | 'ok' | 'warn' | 'achievement' | 'milestone' | 'event';
  title: string;
  body?: string;
}

export interface ConfirmRequest {
  title: string;
  body: string;
  danger?: boolean;
  confirmLabel?: string;
  onYes: () => void;
}

export interface TickPatch {
  simTime: number;
  cash: number;
  ar: number;
  rp: number;
  rep: number;
  scale: number;
  lifetimeRev: number;
  allTimeRev: number;
  live: LiveState;
  stats?: Partial<GameStats>;
  logs?: LogEntry[];
}

export interface LiveState {
  gauges: Gauges;
  nodeStats: Record<string, NodeLive>;
  edgeStats: Record<string, EdgeLive>;
  events: ActiveEvent[];
  demandMult: number;
  dropPathEdges: string[]; // edges upstream of a dropping node (bottleneck breadcrumbs)
}

export interface GameStats {
  peakServed: number;
  totalServed: number;
  totalDropped: number;
  prestiges: number;
  spikesSurvived: number;
  autoScaleActions: number;
  bestProfitPerSec: number;
  fourNinesStreak: number;
  servedByKind: Record<string, number>; // lifetime, drives node mastery
  contractsCompleted: number;
  contractsFailed: number;
  drillsCompleted: number;
  incidentsSurvived: number;
}

const emptyGauges = (): Gauges => ({
  offered: 0,
  served: 0,
  dropped: 0,
  shed: 0,
  p95: 0,
  revenuePerSec: 0,
  costPerSec: 0,
  profitPerSec: 0,
  uptime: 100,
  rpPerSec: 0,
});

const emptyLive = (): LiveState => ({
  gauges: emptyGauges(),
  nodeStats: {},
  edgeStats: {},
  events: [],
  demandMult: 1,
  dropPathEdges: [],
});

export const emptyStats = (): GameStats => ({
  peakServed: 0,
  totalServed: 0,
  totalDropped: 0,
  prestiges: 0,
  spikesSurvived: 0,
  autoScaleActions: 0,
  bestProfitPerSec: 0,
  fourNinesStreak: 0,
  servedByKind: {},
  contractsCompleted: 0,
  contractsFailed: 0,
  drillsCompleted: 0,
  incidentsSurvived: 0,
});

const RIVAL_NAMES = ['blitzr.io', 'hypershard', 'scaleworks', 'deploydeploy', 'nulltrace', 'the YC batchmate'];
const rollRival = (): RivalState => ({
  name: RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)],
  rps: 3 + Math.random() * 4,
});

export interface GameStore {
  // --- structure ---
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  regions: RegionRect[];
  graphVersion: number;
  runEpoch: number; // bumped on newGame/prestige/load — engine drops time-anchored state
  idCounter: number;

  // --- progression ---
  cash: number;
  ar: number; // accounts receivable — revenue not yet settled
  rp: number;
  sp: number; // unspent scale points
  spTotal: number; // lifetime banked (drives funding round)
  spSpentOn: Record<PerkId, number>;
  rep: number;
  lifetimeRev: number; // this run
  allTimeRev: number;
  tiers: number[]; // launched tier ids
  research: string[];
  milestones: string[];
  achievements: string[];
  blueprints: Blueprint[];
  scale: number;
  simTime: number;
  lastSaved: number;
  sandbox: boolean;
  sandboxDemand: number;
  stats: GameStats;
  settings: { reducedMotion: 'auto' | 'on' | 'off'; autosave: boolean; lessons: boolean };

  // --- field notes (educational layer) ---
  lessonsSeen: string[];
  activeLesson: string | null;
  lessonQueue: string[];

  // --- tutorial ---
  // -2 = never offered (old saves), -1 = done/skipped, >=0 = active step.
  // Steps advance by watching game state, not by "Next" alone.
  tutorialStep: number;

  // --- case studies ---
  caseId: string | null;
  caseStatus: 'running' | 'passed' | 'failed' | null;
  caseObjectives: Record<string, { held: number; done: boolean }>;
  casesCompleted: string[];
  customCases: CaseDef[]; // player-imported challenges

  // --- live-ops layer ---
  contractOffers: ContractInstance[];
  activeContract: ContractInstance | null;
  contractsRefreshAt: number; // simTime of next board roll
  postmortems: Postmortem[]; // this-run archive, newest first
  activePostmortem: Postmortem | null; // card currently shown
  postmortemQueue: Postmortem[]; // reports waiting behind the active card (runtime-only)
  drill: DrillState;
  history: HistoryEntry[]; // company timeline (real time)
  mandate: MandateId | null; // active board mandate for this run
  rival: RivalState;
  runConstraint: RunConstraint;
  insuranceUsed: boolean; // first-bottleneck rep protection consumed

  // --- live (engine-written) ---
  live: LiveState;
  logs: LogEntry[];

  // --- ui ---
  tool: Tool;
  overlay: Overlay;
  selection: string[];
  selEdges: string[];
  speed: 0 | 1 | 2 | 4;
  dragKind: Exclude<NodeKind, 'zone'> | null; // palette item being dragged (what-if ghost)
  modal: null | 'research' | 'prestige' | 'settings' | 'help' | 'tiers' | 'cases' | 'casedone' | 'doctor' | 'history' | 'caseeditor';
  confirm: ConfirmRequest | null;
  pendingBlueprint: string | null;
  pendingZoneTemplate: Exclude<NodeKind, 'zone'> | null;
  toasts: Toast[];
  lastRemovedEdges: PlacedEdge[];
  fitSignal: number;
  paletteOpen: boolean;
  inspectorOpen: boolean;

  // --- actions: structure ---
  placeNode: (kind: NodeKind, x: number, y: number) => string | null;
  setNodePositions: (moves: { id: string; x: number; y: number }[]) => void;
  bumpGraph: () => void;
  connectPorts: (c: { source: string; sourceHandle: string; target: string; targetHandle: string }) => boolean;
  removeEdges: (ids: string[], undoable?: boolean) => void;
  undoRemoveEdges: () => void;
  removeNodes: (ids: string[]) => void;
  upgradeNodes: (ids: string[]) => void;
  replaceNode: (id: string, kind: Exclude<NodeKind, 'zone'>) => void;
  restartNode: (id: string) => void;
  toggleNode: (id: string) => void;
  createZone: (x: number, y: number, w: number, h: number, template: Exclude<NodeKind, 'zone'>) => string | null;
  patchZone: (id: string, patch: Partial<ZoneState>, opts?: { payFor?: number }) => void;
  createRegion: (x: number, y: number, w: number, h: number) => string;
  patchRegion: (id: string, patch: Partial<RegionRect>) => void;
  removeRegion: (id: string) => void;
  autoLayoutNow: () => void;

  // --- actions: progression ---
  buyResearch: (id: string) => void;
  launchTier: (id: number) => void;
  collectAR: () => void;
  doPrestige: (nextMandate?: MandateId | null) => void;
  buyPerk: (perk: PerkId) => void;
  saveBlueprintFromSelection: (name: string) => void;
  applyBlueprint: (bpId: string, x: number, y: number) => boolean;
  removeBlueprint: (id: string) => void;

  // --- actions: engine ---
  applyTick: (patch: TickPatch) => void;
  completeMilestone: (id: string) => void;
  grantAchievement: (id: string) => void;
  showLesson: (id: string) => void;
  dismissLesson: () => void;
  setTutorialStep: (n: number) => void;
  markSaved: (t: number) => void;
  enterCase: (id: string) => void;
  exitCase: (passed: boolean) => void;
  retryCase: () => void;
  setCaseProgress: (objectives: Record<string, { held: number; done: boolean }>, status: 'running' | 'passed' | 'failed') => void;

  // --- actions: live-ops ---
  setNodeLabel: (id: string, label: string) => void;
  setNodeTier: (id: string, tier: number | undefined) => void;
  acceptContract: (id: string) => void;
  setContractState: (patch: { offers?: ContractInstance[]; active?: ContractInstance | null; refreshAt?: number }) => void;
  completeContract: () => void;
  failContract: () => void;
  startDrill: () => void;
  finishDrill: (passed: boolean, dropShare: number) => void;
  pushPostmortem: (pm: Postmortem) => void;
  dismissPostmortem: () => void;
  setRival: (rps: number) => void;
  markInsuranceUsed: () => void;
  pushHistory: (icon: string, label: string) => void;
  addCustomCase: (def: CaseDef) => boolean;
  removeCustomCase: (id: string) => void;
  setDragKind: (k: Exclude<NodeKind, 'zone'> | null) => void;

  // --- actions: ui ---
  setTool: (t: Tool) => void;
  setOverlay: (o: Overlay) => void;
  setSpeed: (s: 0 | 1 | 2 | 4) => void;
  setSelection: (nodes: string[], edges: string[]) => void;
  openModal: (m: GameStore['modal']) => void;
  requestConfirm: (c: ConfirmRequest) => void;
  resolveConfirm: (yes: boolean) => void;
  setPendingBlueprint: (id: string | null) => void;
  setPendingZoneTemplate: (k: Exclude<NodeKind, 'zone'> | null) => void;
  addToast: (kind: Toast['kind'], title: string, body?: string) => void;
  dismissToast: (id: number) => void;
  requestFit: () => void;
  togglePalette: () => void;
  toggleInspector: () => void;
  setSandboxDemand: (v: number) => void;
  setSettings: (patch: Partial<GameStore['settings']>) => void;
  loadState: (partial: Partial<GameStore>) => void;
  newGame: (sandbox: boolean, constraint?: RunConstraint) => void;
}

/** Reason a kind can't be placed under the active run constraint, or null. */
export function constraintBlocks(constraint: RunConstraint, kind: NodeKind): string | null {
  if (constraint === 'serverless' && ['app', 'spot', 'worker'].includes(kind))
    return 'Serverless-only run: no servers to hug. Lambda is your compute.';
  if (constraint === 'nocache' && ['redis', 'memcached', 'varnish', 'cdn', 'fastly'].includes(kind))
    return 'No-cache run: every request earns its round trip.';
  return null;
}

// ---------------------------------------------------------------------------

let toastId = 1;

export function portTypeOf(handle: string): PortType {
  const prefix = handle.split('-')[0];
  if (prefix === 'ctl') return 'control';
  if (prefix === 'repl') return 'data'; // legacy handle ids from before the merge
  return prefix as PortType;
}

/** Handles a node exposes (zones expose their template's ports + control-in). */
export function handlesOf(node: PlacedNode): { id: string; type: PortType; dir: 'in' | 'out'; label: string }[] {
  if (node.kind === 'zone') {
    const spec = specOf('zone', node.zone?.template);
    return [
      ...spec.ports.map((p) => ({ id: p.id, type: p.type, dir: p.dir, label: p.label })),
      { id: 'ctl-in', type: 'control' as PortType, dir: 'in' as const, label: 'policy' },
    ];
  }
  return SPECS[node.kind].ports;
}

function freshRunState() {
  return {
    // a queued field note about the OLD run would show out of context;
    // collected notes (lessonsSeen) persist — knowledge survives resets
    activeLesson: null as string | null,
    lessonQueue: [] as string[],
    nodes: [
      {
        id: 'n1',
        kind: 'users' as NodeKind,
        x: 60,
        y: 220,
        level: 1,
        spent: 0,
      },
    ],
    edges: [] as PlacedEdge[],
    regions: [] as RegionRect[],
    idCounter: 2,
    cash: BAL.startCash,
    ar: 0,
    rp: 0,
    rep: BAL.startRep,
    lifetimeRev: 0,
    tiers: [1],
    research: [] as string[],
    scale: BAL.startScale,
    simTime: 0,
    live: emptyLive(),
    logs: [] as LogEntry[],
    selection: [] as string[],
    selEdges: [] as string[],
    tool: 'move' as Tool,
    overlay: 'none' as Overlay,
    pendingBlueprint: null,
    pendingZoneTemplate: null,
    lastRemovedEdges: [] as PlacedEdge[],
    // live-ops: contracts + postmortems are per-run; a new run rolls a new rival
    contractOffers: [] as ContractInstance[],
    activeContract: null as ContractInstance | null,
    contractsRefreshAt: 0,
    postmortems: [] as Postmortem[],
    activePostmortem: null as Postmortem | null,
    postmortemQueue: [] as Postmortem[],
    rival: rollRival(),
    dragKind: null as Exclude<NodeKind, 'zone'> | null,
  };
}

export const useGame = create<GameStore>()((set, get) => ({
  ...freshRunState(),
  graphVersion: 0,
  runEpoch: 0,
  sp: 0,
  spTotal: 0,
  spSpentOn: { throughput: 0, revenue: 0, efficiency: 0, momentum: 0 },
  allTimeRev: 0,
  milestones: [],
  achievements: [],
  blueprints: [],
  lastSaved: Date.now(),
  sandbox: false,
  sandboxDemand: 60,
  stats: emptyStats(),
  settings: { reducedMotion: 'auto', autosave: true, lessons: true },
  lessonsSeen: [],
  activeLesson: null,
  lessonQueue: [],
  tutorialStep: -2,
  caseId: null,
  caseStatus: null,
  caseObjectives: {},
  casesCompleted: [],
  customCases: [],
  drill: { streak: 0, lastDay: '', activeUntil: 0 },
  history: [],
  mandate: null,
  runConstraint: 'none',
  insuranceUsed: false,
  speed: 1,
  modal: null,
  confirm: null,
  toasts: [],
  fitSignal: 0,
  paletteOpen: true,
  inspectorOpen: true,

  // ------------------------------------------------------------- structure --
  placeNode: (kind, x, y) => {
    const s = get();
    if (kind === 'zone' || kind === 'users') return null;
    const spec = SPECS[kind];
    const blocked = constraintBlocks(s.runConstraint, kind);
    if (blocked) {
      s.addToast('warn', `${spec.name} is off-limits this run`, blocked);
      return null;
    }
    if (spec.singleton && s.nodes.some((n) => n.kind === kind)) {
      s.addToast('warn', `${spec.name} is a singleton`, 'One per company is plenty.');
      return null;
    }
    if (!s.sandbox && s.cash < spec.cost) {
      s.addToast('warn', 'Insufficient funds', `${spec.name} costs $${spec.cost}.`);
      return null;
    }
    const id = `n${s.idCounter}`;
    const boot = s.simTime + (s.research.includes('containers') && s.nodes.some((n) => n.kind === 'cicd') ? BAL.bootTimeCicdSec : BAL.bootTimeSec);
    const node: PlacedNode = { id, kind, x, y, level: 1, spent: spec.cost, bootUntil: boot };
    set({
      nodes: [...s.nodes, node],
      idCounter: s.idCounter + 1,
      cash: s.sandbox ? s.cash : s.cash - spec.cost,
      graphVersion: s.graphVersion + 1,
    });
    return id;
  },

  setNodePositions: (moves) => {
    if (moves.length === 0) return;
    const byId = new Map(moves.map((m) => [m.id, m]));
    set((s) => ({
      nodes: s.nodes.map((n) => {
        const m = byId.get(n.id);
        return m ? { ...n, x: m.x, y: m.y } : n;
      }),
    }));
  },

  bumpGraph: () => set((s) => ({ graphVersion: s.graphVersion + 1 })),

  connectPorts: (c) => {
    const s = get();
    if (c.source === c.target) return false;
    const src = s.nodes.find((n) => n.id === c.source);
    const tgt = s.nodes.find((n) => n.id === c.target);
    if (!src || !tgt) return false;
    const sh = handlesOf(src).find((h) => h.id === c.sourceHandle && h.dir === 'out');
    const th = handlesOf(tgt).find((h) => h.id === c.targetHandle && h.dir === 'in');
    if (!sh || !th || sh.type !== th.type) return false;
    if (sh.type === 'control' && tgt.kind !== 'zone') return false;
    const dup = s.edges.some(
      (e) => e.source === c.source && e.target === c.target && e.sourceHandle === c.sourceHandle && e.targetHandle === c.targetHandle,
    );
    if (dup) return false;
    const id = `e${s.idCounter}`;
    set({
      edges: [...s.edges, { id, source: c.source, sourceHandle: c.sourceHandle, target: c.target, targetHandle: c.targetHandle }],
      idCounter: s.idCounter + 1,
      graphVersion: s.graphVersion + 1,
    });
    return true;
  },

  removeEdges: (ids, undoable = true) => {
    const s = get();
    const removed = s.edges.filter((e) => ids.includes(e.id));
    if (removed.length === 0) return;
    set({
      edges: s.edges.filter((e) => !ids.includes(e.id)),
      lastRemovedEdges: undoable ? removed : [],
      selEdges: s.selEdges.filter((id) => !ids.includes(id)),
      graphVersion: s.graphVersion + 1,
    });
    if (undoable) {
      s.addToast('info', `${removed.length === 1 ? 'Connection' : `${removed.length} connections`} removed`, 'Cmd/Ctrl+Z to restore.');
    }
  },

  undoRemoveEdges: () => {
    const s = get();
    if (s.lastRemovedEdges.length === 0) return;
    const stillValid = s.lastRemovedEdges.filter(
      (e) => s.nodes.some((n) => n.id === e.source) && s.nodes.some((n) => n.id === e.target),
    );
    set({
      edges: [...s.edges, ...stillValid],
      lastRemovedEdges: [],
      graphVersion: s.graphVersion + 1,
    });
  },

  removeNodes: (ids) => {
    const s = get();
    const doomed = s.nodes.filter((n) => ids.includes(n.id) && n.kind !== 'users');
    if (doomed.length === 0) return;
    const refund = s.sandbox ? 0 : Math.round(doomed.reduce((acc, n) => acc + n.spent, 0) * BAL.refundRatio);
    const doomedIds = new Set(doomed.map((n) => n.id));
    set({
      nodes: s.nodes.filter((n) => !doomedIds.has(n.id)),
      edges: s.edges.filter((e) => !doomedIds.has(e.source) && !doomedIds.has(e.target)),
      cash: s.cash + refund,
      selection: s.selection.filter((id) => !doomedIds.has(id)),
      graphVersion: s.graphVersion + 1,
    });
    if (refund > 0) s.addToast('info', 'Decommissioned', `Recovered $${refund} (${Math.round(BAL.refundRatio * 100)}% salvage).`);
  },

  upgradeNodes: (ids) => {
    const s = get();
    if (s.runConstraint === 'frugal') {
      s.addToast('warn', 'Shoestring run: upgrades disabled', 'Level 1 hardware only — scale OUT, not up.');
      return;
    }
    const discount = s.nodes.some((n) => n.kind === 'cicd') ? BAL.cicdUpgradeDiscount : 1;
    let cash = s.cash;
    let upgraded = 0;
    const nodes = s.nodes.map((n) => {
      if (!ids.includes(n.id) || n.kind === 'users') return n;
      const spec = specOf(n.kind, n.zone?.template);
      if (n.level >= BAL.maxLevel) return n;
      const cost = upgradeCost(spec.cost * (n.kind === 'zone' ? 1.6 : 1), n.level, discount);
      if (!s.sandbox && cash < cost) return n;
      if (!s.sandbox) cash -= cost;
      upgraded++;
      return { ...n, level: n.level + 1, spent: n.spent + cost };
    });
    if (upgraded === 0) {
      s.addToast('warn', 'No upgrades applied', 'Not enough cash, or everything is already max level.');
      return;
    }
    set({ nodes, cash, graphVersion: s.graphVersion + 1 });
  },

  replaceNode: (id, kind) => {
    const s = get();
    const old = s.nodes.find((n) => n.id === id);
    if (!old || old.kind === 'users' || old.kind === 'zone') return;
    const swapBlocked = constraintBlocks(s.runConstraint, kind);
    if (swapBlocked) {
      s.addToast('warn', 'Off-limits this run', swapBlocked);
      return;
    }
    const newSpec = SPECS[kind];
    const refund = Math.round(old.spent * BAL.refundRatio);
    const net = newSpec.cost - refund;
    if (!s.sandbox && s.cash < net) {
      s.addToast('warn', 'Insufficient funds', `Swap to ${newSpec.name} costs $${net} net of salvage.`);
      return;
    }
    const newHandles = new Set(newSpec.ports.map((p) => `${p.id}`));
    const keptEdges = s.edges.filter((e) => {
      if (e.source === id) return newHandles.has(e.sourceHandle);
      if (e.target === id) return newHandles.has(e.targetHandle);
      return true;
    });
    const droppedCount = s.edges.length - keptEdges.length;
    set({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? { ...n, kind, level: 1, spent: newSpec.cost, bootUntil: s.simTime + BAL.bootTimeSec }
          : n,
      ),
      edges: keptEdges,
      cash: s.sandbox ? s.cash : s.cash - net,
      graphVersion: s.graphVersion + 1,
    });
    s.addToast('ok', `Swapped to ${newSpec.name}`, droppedCount > 0 ? `${droppedCount} incompatible connection(s) dropped.` : 'All connections kept.');
  },

  restartNode: (id) => {
    const s = get();
    // Restart = pay a small ops fee, back at full health after a short boot.
    const fee = s.sandbox ? 0 : 20;
    if (s.cash < fee) return;
    set({
      cash: s.cash - fee,
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, bootUntil: s.simTime + 3 } : n)),
      graphVersion: s.graphVersion + 1,
    });
  },

  toggleNode: (id) => {
    const s = get();
    set({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, disabled: !n.disabled } : n)),
      graphVersion: s.graphVersion + 1,
    });
  },

  createZone: (x, y, w, h, template) => {
    const s = get();
    const spec = SPECS[template];
    if (!spec.zoneUnit) return null;
    const zoneBlocked = constraintBlocks(s.runConstraint, template);
    if (zoneBlocked) {
      s.addToast('warn', 'Off-limits this run', zoneBlocked);
      return null;
    }
    const cost = Math.round(spec.cost * BAL.zoneSpawnDiscount);
    if (!s.sandbox && s.cash < cost) {
      s.addToast('warn', 'Insufficient funds', `First ${spec.name} instance costs $${cost}.`);
      return null;
    }
    const id = `n${s.idCounter}`;
    const count = s.nodes.filter((n) => n.kind === 'zone').length;
    const zone: ZoneState = {
      template,
      name: `${spec.short.toLowerCase()}-pool-${count + 1}`,
      w: Math.max(230, w),
      h: Math.max(150, h),
      min: 1,
      max: 8,
      instances: 1,
      targetUtil: 0.65,
      auto: false,
      bootQueue: [s.simTime + BAL.bootTimeSec],
    };
    set({
      nodes: [...s.nodes, { id, kind: 'zone', x, y, level: 1, spent: cost, zone }],
      idCounter: s.idCounter + 1,
      cash: s.sandbox ? s.cash : s.cash - cost,
      graphVersion: s.graphVersion + 1,
    });
    return id;
  },

  patchZone: (id, patch, opts) => {
    const s = get();
    let cash = s.cash;
    if (opts?.payFor && !s.sandbox) {
      if (cash < opts.payFor) return;
      cash -= opts.payFor;
    }
    set({
      cash,
      nodes: s.nodes.map((n) =>
        n.id === id && n.zone ? { ...n, zone: { ...n.zone, ...patch }, spent: n.spent + (opts?.payFor ?? 0) } : n,
      ),
      graphVersion: s.graphVersion + 1,
    });
  },

  createRegion: (x, y, w, h) => {
    const s = get();
    const id = `r${s.idCounter}`;
    const hues = [210, 280, 160, 30, 340];
    set({
      regions: [
        ...s.regions,
        {
          id,
          name: `region-${s.regions.length + 1}`,
          x,
          y,
          w,
          h,
          hue: hues[s.regions.length % hues.length],
          policies: { aggressiveScale: false, cacheTtl: false, rateLimit: false, redundancy: false },
        },
      ],
      idCounter: s.idCounter + 1,
      graphVersion: s.graphVersion + 1,
    });
    return id;
  },

  patchRegion: (id, patch) => {
    set((s) => ({
      regions: s.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      graphVersion: s.graphVersion + 1,
    }));
  },

  removeRegion: (id) => {
    set((s) => ({
      regions: s.regions.filter((r) => r.id !== id),
      selection: s.selection.filter((sid) => sid !== id),
      graphVersion: s.graphVersion + 1,
    }));
  },

  autoLayoutNow: () => {
    // implemented in systems/layout.ts, bound in App to avoid a cycle
    window.dispatchEvent(new CustomEvent('uptime:autolayout'));
  },

  // ----------------------------------------------------------- progression --
  buyResearch: (id) => {
    const s = get();
    const r = researchById.get(id);
    if (!r || s.research.includes(id)) return;
    if (!r.deps.every((d) => s.research.includes(d))) return;
    if (!s.sandbox && s.rp < r.cost) return;
    set({
      rp: s.sandbox ? s.rp : s.rp - r.cost,
      research: [...s.research, id],
      graphVersion: s.graphVersion + 1,
    });
    s.addToast('ok', `Research complete: ${r.name}`, r.grants.join(' · '));
  },

  launchTier: (id) => {
    const s = get();
    const tier = TIERS[id - 1];
    if (!tier || s.tiers.includes(id)) return;
    if (!s.sandbox && s.cash < tier.cost) {
      s.addToast('warn', 'Insufficient funds', `${tier.name} launch costs $${tier.cost}.`);
      return;
    }
    set({ cash: s.sandbox ? s.cash : s.cash - tier.cost, tiers: [...s.tiers, id] });
    s.addToast('milestone', `Launched: ${tier.name}`, 'New traffic mix incoming. Watch your gauges.');
    s.pushHistory('▲', `Launched ${tier.name}`);
  },

  collectAR: () => {
    const s = get();
    if (s.ar <= 0) return;
    set({ cash: s.cash + s.ar, ar: 0 });
  },

  doPrestige: (nextMandate = null) => {
    const s = get();
    let gain = Math.floor(Math.sqrt(Math.max(0, s.lifetimeRev) / BAL.spDivisor));
    if (gain < BAL.prestigeMinSp) return;

    // mandate bonus (this run's mandate pays out now) + rival bonus
    const mandateBonus = s.mandate ? (mandateById.get(s.mandate)?.spBonus ?? 0) : 0;
    if (mandateBonus > 0) gain = Math.floor(gain * (1 + mandateBonus));
    const beatRival = s.live.gauges.served > s.rival.rps;
    if (beatRival) gain += BAL.rivalBeatSp;

    // constraint-run achievements: honored only when actually raising
    if (s.runConstraint === 'serverless') s.grantAchievement('went-serverless');
    if (s.runConstraint === 'nocache') s.grantAchievement('raw-dog-db');
    if (s.runConstraint === 'frugal') s.grantAchievement('level-one-legend');
    if (beatRival) s.grantAchievement('flippening');

    const spTotal = s.spTotal + gain;
    const roundName = BAL.roundNames[roundForSp(spTotal)];
    s.pushHistory('📈', `Raised ${roundName}: +${gain} SP${beatRival ? ` (out-served ${s.rival.name})` : ''}${s.mandate ? ` · ${mandateById.get(s.mandate)?.name} honored` : ''}`);
    set({
      ...freshRunState(),
      sp: s.sp + gain,
      spTotal,
      stats: { ...s.stats, prestiges: s.stats.prestiges + 1 },
      cash: BAL.startCash + s.spSpentOn.momentum * BAL.perkMomentumCash,
      mandate: nextMandate,
      graphVersion: s.graphVersion + 1,
      runEpoch: s.runEpoch + 1,
      modal: null,
      speed: 1,
    });
    get().addToast(
      'achievement',
      `${roundName} closed`,
      `Banked ${gain} SP${beatRival ? ` (incl. +${BAL.rivalBeatSp} for out-serving ${s.rival.name})` : ''}${mandateBonus > 0 ? ` (incl. +${Math.round(mandateBonus * 100)}% mandate bonus)` : ''}. Stamp your blueprints.`,
    );
    if (nextMandate) {
      const m = mandateById.get(nextMandate);
      if (m) get().addToast('info', `Board mandate: ${m.name}`, m.desc);
    }
  },

  buyPerk: (perk) => {
    const s = get();
    const level = s.spSpentOn[perk];
    if (level >= BAL.perkMaxLevel) return;
    const cost = perkCost(level);
    if (s.sp < cost) return;
    set({
      sp: s.sp - cost,
      spSpentOn: { ...s.spSpentOn, [perk]: level + 1 },
    });
  },

  saveBlueprintFromSelection: (name) => {
    const s = get();
    const sel = s.nodes.filter((n) => s.selection.includes(n.id) && n.kind !== 'users');
    if (sel.length === 0) {
      s.addToast('warn', 'Nothing selected', 'Select some infrastructure first (drag a box in Move mode).');
      return;
    }
    const minX = Math.min(...sel.map((n) => n.x));
    const minY = Math.min(...sel.map((n) => n.y));
    const idx = new Map(sel.map((n, i) => [n.id, i]));
    const bp: Blueprint = {
      id: `bp${Date.now().toString(36)}`,
      name: name || `module.custom_${s.blueprints.length + 1}`,
      nodes: sel.map((n) => ({
        kind: n.kind,
        dx: n.x - minX,
        dy: n.y - minY,
        level: n.level,
        zone: n.zone
          ? { template: n.zone.template, name: n.zone.name, w: n.zone.w, h: n.zone.h, min: n.zone.min, max: n.zone.max, targetUtil: n.zone.targetUtil }
          : undefined,
      })),
      edges: s.edges
        .filter((e) => idx.has(e.source) && idx.has(e.target))
        .map((e) => ({ si: idx.get(e.source)!, sh: e.sourceHandle, ti: idx.get(e.target)!, th: e.targetHandle })),
    };
    set({ blueprints: [...s.blueprints, bp] });
    s.addToast('ok', `Blueprint saved: ${bp.name}`, `${bp.nodes.length} resources, ${bp.edges.length} connections. Stamp it with B.`);
  },

  applyBlueprint: (bpId, x, y) => {
    const s = get();
    const bp = [...STARTER_BLUEPRINTS, ...s.blueprints].find((b) => b.id === bpId);
    if (!bp) return false;
    let cost = 0;
    for (const bn of bp.nodes) {
      const spec = specOf(bn.kind, bn.zone?.template);
      const base = bn.kind === 'zone' ? Math.round(spec.cost * BAL.zoneSpawnDiscount) : totalSpentAtLevel(spec.cost, bn.level);
      cost += base;
      if (spec.singleton && s.nodes.some((n) => n.kind === bn.kind)) {
        s.addToast('warn', 'Blueprint blocked', `${spec.name} is a singleton and already exists.`);
        return false;
      }
      const bpBlocked = constraintBlocks(s.runConstraint, bn.kind === 'zone' ? (bn.zone?.template ?? 'app') : bn.kind);
      if (bpBlocked) {
        s.addToast('warn', 'Blueprint blocked', bpBlocked);
        return false;
      }
    }
    if (!s.sandbox && s.cash < cost) {
      s.addToast('warn', 'Insufficient funds', `Stamping ${bp.name} costs $${cost}.`);
      return false;
    }
    let counter = s.idCounter;
    const bootAt = s.simTime + (s.nodes.some((n) => n.kind === 'cicd') ? BAL.bootTimeCicdSec : BAL.bootTimeSec);
    const created: PlacedNode[] = bp.nodes.map((bn) => {
      const spec = specOf(bn.kind, bn.zone?.template);
      const id = `n${counter++}`;
      return {
        id,
        kind: bn.kind,
        x: x + bn.dx,
        y: y + bn.dy,
        level: bn.level,
        spent: bn.kind === 'zone' ? Math.round(spec.cost * BAL.zoneSpawnDiscount) : totalSpentAtLevel(spec.cost, bn.level),
        bootUntil: bootAt,
        zone: bn.zone
          ? { ...bn.zone, instances: 1, auto: false, bootQueue: [bootAt] }
          : undefined,
      };
    });
    const newEdges: PlacedEdge[] = bp.edges.map((be) => ({
      id: `e${counter++}`,
      source: created[be.si].id,
      sourceHandle: be.sh,
      target: created[be.ti].id,
      targetHandle: be.th,
    }));
    set({
      nodes: [...s.nodes, ...created],
      edges: [...s.edges, ...newEdges],
      idCounter: counter,
      cash: s.sandbox ? s.cash : s.cash - cost,
      graphVersion: s.graphVersion + 1,
    });
    return true;
  },

  removeBlueprint: (id) => {
    set((s) => ({ blueprints: s.blueprints.filter((b) => b.id !== id) }));
  },

  // ---------------------------------------------------------------- engine --
  applyTick: (p) => {
    set((s) => ({
      simTime: p.simTime,
      cash: p.cash,
      ar: p.ar,
      rp: p.rp,
      rep: p.rep,
      scale: p.scale,
      lifetimeRev: p.lifetimeRev,
      allTimeRev: p.allTimeRev,
      live: p.live,
      stats: p.stats ? { ...s.stats, ...p.stats } : s.stats,
      logs: p.logs && p.logs.length > 0 ? [...s.logs.slice(-(BAL.logCap - p.logs.length)), ...p.logs] : s.logs,
    }));
  },

  completeMilestone: (id) => {
    const s = get();
    const m = milestoneById.get(id);
    if (!m || s.milestones.includes(id)) return;
    set({
      milestones: [...s.milestones, id],
      cash: s.cash + (m.rewardCash ?? 0),
      rp: s.rp + (m.rewardRp ?? 0),
    });
    const rewards = [
      m.rewardCash ? `+$${m.rewardCash}` : null,
      m.rewardRp ? `+${m.rewardRp} RP` : null,
      m.unlocks ? `Unlocked: ${m.unlocks}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    s.addToast('milestone', `Objective: ${m.title}`, rewards || m.desc);
  },

  grantAchievement: (id) => {
    const s = get();
    const a = achievementById.get(id);
    if (!a || s.achievements.includes(id)) return;
    set({ achievements: [...s.achievements, id] });
    s.addToast('achievement', a.name, a.desc);
  },

  showLesson: (id) => {
    const s = get();
    // `lessons: undefined` (old saves) means enabled
    if (s.settings.lessons === false) return;
    if (s.lessonsSeen.includes(id) || s.activeLesson === id || s.lessonQueue.includes(id)) return;
    if (s.activeLesson === null) set({ activeLesson: id });
    else set({ lessonQueue: [...s.lessonQueue, id] });
  },

  dismissLesson: () => {
    const s = get();
    if (!s.activeLesson) return;
    const [next, ...rest] = s.lessonQueue;
    set({
      lessonsSeen: [...s.lessonsSeen, s.activeLesson],
      activeLesson: next ?? null,
      lessonQueue: rest,
    });
  },

  setTutorialStep: (n) => set({ tutorialStep: n }),

  markSaved: (t) => set({ lastSaved: t }),

  // ------------------------------------------------------------ case studies --
  enterCase: (id) => {
    const s = get();
    const def = resolveCase(id, s.customCases);
    if (!def || s.caseId) return;
    if (def.requires && !s.casesCompleted.includes(def.requires)) return; // level locked
    // snapshot the campaign to localStorage first; autosave is suspended
    // while a case is running, so this snapshot survives until exit.
    void import('./save').then(({ saveNow }) => {
      saveNow();
      let counter = 1;
      const created = def.nodes.map((cn) => {
        const nodeId = `n${counter++}`;
        return {
          id: nodeId,
          kind: cn.kind,
          x: cn.x,
          y: cn.y,
          level: cn.level ?? 1,
          spent: 0,
          zone: cn.zone ? { ...cn.zone, auto: false, bootQueue: [] } : undefined,
        };
      });
      const edges = def.edges.map((e) => ({
        id: `e${counter++}`,
        source: created[e.si].id,
        sourceHandle: e.sh,
        target: created[e.ti].id,
        targetHandle: e.th,
      }));
      const st = get();
      set({
        ...freshRunState(),
        nodes: created,
        edges,
        idCounter: counter,
        cash: def.cash,
        rp: def.rp ?? 0,
        rep: 70,
        tiers: def.tiers,
        research: def.research,
        // all tools available inside cases regardless of campaign progress
        milestones: MILESTONES.map((m) => m.id),
        sandbox: false,
        caseId: id,
        caseStatus: 'running',
        caseObjectives: Object.fromEntries(def.objectives.map((o) => [o.id, { held: 0, done: false }])),
        graphVersion: st.graphVersion + 1,
        runEpoch: st.runEpoch + 1,
        modal: null,
        speed: 1,
      });
      const g = get();
      g.requestFit();
      g.addToast('info', `Case study: ${def.title}`, `${def.client}. ${def.teach}`);
    });
  },

  exitCase: (passed) => {
    const s = get();
    const id = s.caseId;
    if (!id) return;
    const def = resolveCase(id, s.customCases);
    const lessonsFromCase = s.lessonsSeen;
    const completedBefore = s.casesCompleted;
    set({ caseId: null, caseStatus: null, caseObjectives: {}, modal: null, speed: 1 });
    void import('./save').then(({ restoreCampaign, saveNow }) => {
      restoreCampaign(); // loadState bumps runEpoch → engine resets cleanly
      const st = get();
      const completed = new Set([...st.casesCompleted, ...completedBefore]);
      if (passed) completed.add(id);
      set({
        casesCompleted: [...completed],
        lessonsSeen: [...new Set([...st.lessonsSeen, ...lessonsFromCase])],
        rp: st.rp + (passed && def ? def.rewardRp : 0),
      });
      saveNow();
      if (passed && def) {
        get().pushHistory(def.track === 'product' ? '🚢' : '✓', `${def.track === 'product' ? 'Shipped' : 'Closed'}: ${def.title} (+${def.rewardRp} RP)`);
        get().addToast('achievement', `Case closed: ${def.title}`, `+${def.rewardRp} RP banked to the company. Campaign restored.`);
      } else {
        get().addToast('info', 'Back to the company', 'Campaign restored from snapshot.');
      }
    });
  },

  retryCase: () => {
    const s = get();
    const id = s.caseId;
    if (!id) return;
    s.exitCase(false);
    // re-enter after the restore settles
    window.setTimeout(() => get().enterCase(id), 250);
  },

  setCaseProgress: (objectives, status) => {
    const s = get();
    if (!s.caseId) return;
    if (s.caseStatus === 'running' && status !== 'running') {
      set({ caseObjectives: objectives, caseStatus: status, modal: 'casedone', speed: 0 });
    } else {
      set({ caseObjectives: objectives });
    }
  },

  // ---------------------------------------------------------------- live-ops --
  setNodeLabel: (id, label) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, label: label.trim() || undefined } : n)),
      graphVersion: s.graphVersion + 1,
    }));
  },

  setNodeTier: (id, tier) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, tier } : n)),
      graphVersion: s.graphVersion + 1,
    }));
  },

  acceptContract: (id) => {
    const s = get();
    if (s.activeContract) {
      s.addToast('warn', 'One contract at a time', 'Finish (or fail) the active one first.');
      return;
    }
    const offer = s.contractOffers.find((c) => c.id === id);
    if (!offer) return;
    set({
      activeContract: { ...offer, held: 0, deadlineAt: s.simTime + BAL.contractDeadlineSec },
      contractOffers: s.contractOffers.filter((c) => c.id !== id),
    });
    s.addToast('info', `Contract signed: ${offer.client}`, `${offer.label} — ${Math.round(BAL.contractDeadlineSec / 60)} min to deliver.`);
  },

  setContractState: (patch) => {
    set((s) => ({
      contractOffers: patch.offers ?? s.contractOffers,
      activeContract: patch.active !== undefined ? patch.active : s.activeContract,
      contractsRefreshAt: patch.refreshAt ?? s.contractsRefreshAt,
    }));
  },

  completeContract: () => {
    const s = get();
    const c = s.activeContract;
    if (!c) return;
    set({
      activeContract: null,
      cash: s.cash + c.rewardCash,
      rp: s.rp + c.rewardRp,
      rep: Math.min(BAL.repMax, s.rep + c.repBonus),
    });
    const n = s.stats.contractsCompleted + 1; // engine increments the stat itself
    if (n === 1 || n % 5 === 0) s.pushHistory('✍', `SLA contract #${n} delivered (${c.client})`);
    s.addToast('milestone', 'Contract delivered', `${c.label} — +$${c.rewardCash}, +${c.rewardRp} RP, +${c.repBonus} rep.`);
  },

  failContract: () => {
    const s = get();
    const c = s.activeContract;
    if (!c) return;
    set({
      activeContract: null,
      rep: Math.max(BAL.repMin, s.rep - c.repPenalty),
    });
    s.addToast('warn', 'Contract failed', `${c.client} walks. −${c.repPenalty} reputation.`);
  },

  startDrill: () => {
    const s = get();
    const today = new Date().toISOString().slice(0, 10);
    if (s.sandbox || s.caseId || s.drill.activeUntil > s.simTime) return;
    if (s.drill.lastDay === today) {
      s.addToast('info', 'Drill already run today', `Streak: ${s.drill.streak}. Come back tomorrow.`);
      return;
    }
    set({ drill: { ...s.drill, lastDay: today, activeUntil: s.simTime + BAL.drillDurSec } });
    s.addToast('event', 'Chaos drill started', `${Math.round(BAL.drillDurSec / 60)} minutes of scripted failure. Keep drops under ${Math.round(BAL.drillPassDropShare * 100)}%.`);
  },

  finishDrill: (passed, dropShare) => {
    const s = get();
    const streak = passed ? s.drill.streak + 1 : 0;
    const reward = passed ? BAL.drillBaseRp + BAL.drillStreakRp * Math.min(streak, 15) : 0;
    set({
      drill: { ...s.drill, streak, activeUntil: 0 },
      rp: s.rp + reward,
    });
    if (passed) {
      if (streak === 7) s.grantAchievement('fire-drill');
      if (streak === 1 || streak % 5 === 0) s.pushHistory('🔥', `Chaos drill streak: ${streak}`);
      s.addToast('achievement', `Drill survived (streak ${streak})`, `${(dropShare * 100).toFixed(1)}% dropped. +${reward} RP.`);
    } else {
      s.addToast('warn', 'Drill failed', `${(dropShare * 100).toFixed(1)}% dropped — streak resets. The real one would have hurt more.`);
    }
  },

  pushPostmortem: (pm) => {
    const s = get();
    set({
      postmortems: [pm, ...s.postmortems].slice(0, 12),
      // show it now if the card is free; otherwise queue it behind the current one
      activePostmortem: s.activePostmortem ?? pm,
      postmortemQueue: s.activePostmortem ? [...s.postmortemQueue, pm] : s.postmortemQueue,
    });
  },

  dismissPostmortem: () =>
    set((s) => ({
      activePostmortem: s.postmortemQueue[0] ?? null,
      postmortemQueue: s.postmortemQueue.slice(1),
    })),

  setRival: (rps) => set((s) => ({ rival: { ...s.rival, rps } })),

  markInsuranceUsed: () => {
    const s = get();
    if (s.insuranceUsed) return;
    set({ insuranceUsed: true });
    s.addToast(
      'info',
      'First-outage insurance',
      `Your first bottleneck is on the house: reputation is protected for ${BAL.insuranceWindowSec}s. Next time it bleeds — fix the constraint.`,
    );
  },

  pushHistory: (icon, label) => {
    set((s) => ({ history: [{ at: Date.now(), icon, label }, ...s.history].slice(0, 60) }));
  },

  addCustomCase: (def) => {
    const s = get();
    if (s.customCases.some((c) => c.id === def.id)) {
      s.addToast('info', 'Already imported', def.title);
      return false;
    }
    set({ customCases: [def, ...s.customCases].slice(0, 20) });
    s.addToast('ok', `Challenge imported: ${def.title}`, 'Find it under Cases → Community.');
    return true;
  },

  removeCustomCase: (id) => set((s) => ({ customCases: s.customCases.filter((c) => c.id !== id) })),

  setDragKind: (k) => set({ dragKind: k }),

  // -------------------------------------------------------------------- ui --
  setTool: (t) => set({ tool: t, pendingBlueprint: t === 'stamp' ? get().pendingBlueprint : null }),
  setOverlay: (o) => set({ overlay: o }),
  setSpeed: (sp) => set({ speed: sp }),
  setSelection: (nodes, edges) => set({ selection: nodes, selEdges: edges }),
  openModal: (m) => set({ modal: m }),
  requestConfirm: (c) => set({ confirm: c }),
  resolveConfirm: (yes) => {
    const c = get().confirm;
    set({ confirm: null });
    if (yes && c) c.onYes();
  },
  setPendingBlueprint: (id) => set({ pendingBlueprint: id, tool: id ? 'stamp' : get().tool }),
  setPendingZoneTemplate: (k) => set({ pendingZoneTemplate: k }),
  addToast: (kind, title, body) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, title, body }] }));
    window.setTimeout(() => get().dismissToast(id), kind === 'event' ? 10000 : BAL.toastSec * 1000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  requestFit: () => set((s) => ({ fitSignal: s.fitSignal + 1 })),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setSandboxDemand: (v) => set({ sandboxDemand: v }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  loadState: (partial) => set({ ...partial, graphVersion: get().graphVersion + 1, runEpoch: get().runEpoch + 1 }),

  newGame: (sandbox, constraint = 'none') => {
    const s = get();
    set({
      ...freshRunState(),
      sp: 0,
      spTotal: 0,
      spSpentOn: { throughput: 0, revenue: 0, efficiency: 0, momentum: 0 },
      allTimeRev: sandbox ? 1e9 : 0,
      milestones: sandbox ? ['first-wire', 'ten-rps', 'first-bottleneck', 'observability', 'first-cache', 'hands-off', 'tier-two', 'spike-survivor', 'auto-billing'] : [],
      achievements: s.achievements,
      blueprints: s.blueprints,
      customCases: s.customCases,
      cash: sandbox ? 1e12 : BAL.startCash,
      sandbox,
      research: sandbox ? ['containers', 'caching', 'gateway', 'autoscaling', 'queues', 'replicas', 'cdn', 'nosql', 'managed', 'orchestration', 'obs2', 'serverless', 'mesh', 'multiregion', 'mlpipe'] : [],
      tiers: sandbox ? [1, 2, 3, 4, 5, 6] : [1],
      stats: emptyStats(),
      drill: { streak: 0, lastDay: '', activeUntil: 0 },
      history: [],
      mandate: null,
      runConstraint: sandbox ? 'none' : constraint,
      insuranceUsed: false,
      graphVersion: s.graphVersion + 1,
      runEpoch: s.runEpoch + 1,
      modal: null,
      speed: 1,
    });
    const cNote =
      constraint === 'serverless'
        ? ' · Constraint: serverless-only'
        : constraint === 'nocache'
          ? ' · Constraint: no caches'
          : constraint === 'frugal'
            ? ' · Constraint: no upgrades'
            : '';
    get().addToast(
      'info',
      sandbox ? 'Sandbox: unlimited budget, everything unlocked' : `New company founded${cNote}`,
      sandbox ? 'Use the demand slider in the dashboard to set traffic.' : 'Wire the Internet to a server to start serving.',
    );
  },
}));

// ------------------------------- derived helpers ---------------------------

export function isKindUnlocked(
  s: Pick<GameStore, 'sandbox' | 'research' | 'allTimeRev' | 'lifetimeRev'>,
  kind: Exclude<NodeKind, 'zone'>,
): boolean {
  if (s.sandbox) return true;
  const spec = SPECS[kind];
  if (spec.research && !s.research.includes(spec.research)) return false;
  if (spec.revGate && s.allTimeRev + s.lifetimeRev < spec.revGate) return false;
  return true;
}

export function unlockedTools(s: Pick<GameStore, 'sandbox' | 'research' | 'milestones'>): Tool[] {
  const tools: Tool[] = ['move', 'select', 'wire', 'upgrade', 'bulldoze'];
  if (s.sandbox || s.research.includes('autoscaling')) tools.push('zone');
  if (s.sandbox || s.milestones.includes('tier-two')) tools.push('region', 'stamp');
  return tools;
}

export function unlockedOverlays(s: Pick<GameStore, 'sandbox' | 'research' | 'milestones'>): Overlay[] {
  const o: Overlay[] = ['none'];
  if (s.sandbox || s.milestones.includes('observability')) o.push('load', 'latency', 'cost');
  if (s.sandbox || s.research.includes('obs2')) o.push('errors', 'cache');
  return o;
}

export function researchOpen(s: GameStore): boolean {
  return s.sandbox || s.milestones.includes('observability');
}
