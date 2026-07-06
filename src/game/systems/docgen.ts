import { CLASS_LABEL, CLASSES, PORT_WORD, type PortType } from '../engine/types';
import { BAL, fmtMoney, fmtNum, MASTERY_NAMES, masteryTier, roundForSp } from '../engine/balance';
import { SPECS, specOf, DB_KINDS } from '../catalog/nodes';
import { diagnose } from './doctor';
import type { GameStore } from '../state/store';

// ---------------------------------------------------------------------------
// Design-doc export: render the live architecture as a real Markdown design
// document — components, traffic flows, SLOs, data-layer notes, risks and
// incident history. The game IS the documentation exercise; this file is the
// artifact you'd hand a new teammate.
// ---------------------------------------------------------------------------

const q = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

const nameOf = (n: GameStore['nodes'][number]) =>
  n.label ?? (n.zone ? n.zone.name : (SPECS[n.kind as keyof typeof SPECS]?.name ?? n.kind));

export function buildArchitectureMd(st: GameStore): string {
  const live = st.live;
  const g = live.gauges;
  const nodes = st.nodes;
  if (nodes.filter((n) => n.kind !== 'users').length === 0) return '';
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const round = BAL.roundNames[Math.min(BAL.roundNames.length - 1, roundForSp(st.spTotal))];
  const trafficEdges = st.edges.filter((e) => !e.sourceHandle.startsWith('ctl'));
  const L: string[] = [];

  L.push(`# Architecture Design Doc`);
  L.push('');
  L.push(`> Exported from UPTIME · ${round} stage · ${nodes.length} components, ${st.edges.length} connections`);
  L.push('');

  // ---- 1. service overview -------------------------------------------------
  L.push(`## 1. Service overview`);
  L.push('');
  L.push(`| SLI | Current | Notes |`);
  L.push(`| --- | --- | --- |`);
  L.push(`| Throughput | **${fmtNum(g.served)} rps** served / ${fmtNum(g.offered)} offered | ${g.dropped > 0.3 ? `⚠ dropping ${fmtNum(g.dropped)}/s` : 'no drops'} |`);
  L.push(`| p95 latency | **${Math.round(g.p95)} ms** | SLO target ${BAL.slaTargetMs} ms |`);
  L.push(`| Uptime | **${g.uptime.toFixed(2)}%** | SLA 99.9% = 43 min/month error budget |`);
  L.push(`| Unit economics | **${fmtMoney(g.profitPerSec)}/s profit** | ${fmtMoney(g.revenuePerSec)}/s revenue − ${fmtMoney(g.costPerSec)}/s infra |`);
  L.push(`| Reputation | **${Math.round(st.rep)}/100** | drives traffic growth |`);
  L.push('');

  // ---- 2. components ---------------------------------------------------------
  L.push(`## 2. Components`);
  L.push('');
  L.push(`| Component | Technology | Doing right now | Scale | In → Served (rps) | Latency | Cost/s |`);
  L.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const n of nodes) {
    const spec = specOf(n.kind, n.zone?.template);
    if (spec.special === 'source') continue;
    const s = live.nodeStats[n.id];
    const scale = n.zone ? `pool ×${n.zone.instances}` : `L${n.level}`;
    const m = masteryTier(st.stats.servedByKind?.[spec.kind] ?? 0);
    const tech = `[${spec.name}](${spec.docsUrl})${m > 0 ? ` (${MASTERY_NAMES[m]})` : ''}`;
    const role = s?.role || (n.disabled ? 'disabled' : 'idle');
    const flow = spec.capacity === 0 ? '—' : `${fmtNum(s?.inRps ?? 0)} → ${fmtNum(s?.served ?? 0)}`;
    const lat = spec.capacity === 0 ? '—' : `${fmtNum(s?.latencyMs ?? 0)} ms`;
    L.push(`| **${q(nameOf(n))}** | ${tech} | ${q(role)} | ${scale} | ${flow} | ${lat} | $${(s?.costRate ?? 0).toFixed(2)} |`);
  }
  L.push('');

  // ---- 3. traffic flow -------------------------------------------------------
  L.push(`## 3. Traffic flow`);
  L.push('');
  if (trafficEdges.length === 0) {
    L.push(`_No traffic wiring yet._`);
  } else {
    for (const e of trafficEdges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      const es = live.edgeStats[e.id];
      const total = es?.rps ?? 0;
      const port = portOf(e.sourceHandle);
      const parts = (es?.classRates ?? [])
        .map((r, i) => ({ r, label: CLASS_LABEL[CLASSES[i]] }))
        .filter((p) => p.r > 0.05)
        .map((p) => `${p.label} ${fmtNum(p.r)}`)
        .join(', ');
      L.push(
        `- **${q(nameOf(a))} → ${q(nameOf(b))}** · ${PORT_WORD[port]} wire · ${total > 0.05 ? `${fmtNum(total)} rps${parts ? ` (${parts})` : ''}` : 'no traffic'}`,
      );
    }
  }
  const ctlEdges = st.edges.filter((e) => e.sourceHandle.startsWith('ctl'));
  if (ctlEdges.length > 0) {
    L.push('');
    L.push(`Policy links: ${ctlEdges.map((e) => `${q(nameOf(byId.get(e.source)!))} ⇢ ${q(nameOf(byId.get(e.target)!))}`).join(' · ')}`);
  }
  L.push('');

  // ---- 4. data layer ---------------------------------------------------------
  const dataNotes: string[] = [];
  for (const n of nodes) {
    const s = live.nodeStats[n.id];
    if (!s) continue;
    const spec = specOf(n.kind, n.zone?.template);
    if (DB_KINDS.has(n.kind) && s.connLimit > 0) {
      const pooled = st.research.includes('pooling');
      dataNotes.push(
        `- **${q(nameOf(n))}**: ${s.conns} client connection${s.conns === 1 ? '' : 's'} / pool of ${s.connLimit}${pooled ? ' (PgBouncer in front — pressure absorbed)' : s.conns > s.connLimit ? ' — **over-subscribed**, latency degrading' : ''}`,
      );
    }
    if (n.kind === 'replica' && s.replLagSec >= 0) {
      dataNotes.push(
        `- **${q(nameOf(n))}**: replication lag ${s.replLagSec.toFixed(1)}s${s.replLagSec > BAL.replLagStaleSec ? ' — **stale reads**, ease write pressure on the primary' : ' (in sync)'}`,
      );
    }
    if (spec.hitRate && s.hitPct >= 0) {
      dataNotes.push(
        `- **${q(nameOf(n))}**: ${Math.round(s.hitPct * 100)}% hit rate${s.warm01 >= 0 && s.warm01 < 0.85 ? ` — warming (${Math.round(s.warm01 * 100)}%)` : ''}`,
      );
    }
  }
  if (dataNotes.length > 0) {
    L.push(`## 4. Data layer`);
    L.push('');
    L.push(...dataNotes);
    L.push('');
  }

  // ---- 5. risks (architecture doctor) -----------------------------------------
  const findings = diagnose(st);
  L.push(`## ${dataNotes.length > 0 ? 5 : 4}. Risks & recommendations`);
  L.push('');
  if (findings.length === 0) {
    L.push(`_Clean bill of health at current load._`);
  } else {
    const badge: Record<string, string> = { crit: '🔴 CRIT', warn: '🟡 WARN', tip: '🟢 TIP' };
    for (const f of findings) {
      L.push(`- ${badge[f.severity]} **${q(f.title)}** — ${q(f.detail)}${f.fix ? ` _Fix: ${q(f.fix)}_` : ''}`);
    }
  }
  L.push('');

  // ---- 6. incident history ------------------------------------------------------
  if (st.postmortems.length > 0) {
    L.push(`## Incident history (this run)`);
    L.push('');
    for (const pm of st.postmortems.slice(0, 5)) {
      L.push(`- **${q(pm.title)}** — ${pm.durSec}s, ${fmtNum(pm.dropped)} requests lost, −${pm.repLost} rep. ${q(pm.takeaway)}`);
    }
    L.push('');
  }

  L.push(`---`);
  L.push(`_UPTIME architecture export · uptime ${g.uptime.toFixed(2)}% · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}_`);
  return L.join('\n');
}

function portOf(handle: string): PortType {
  const prefix = handle.split('-')[0];
  if (prefix === 'ctl') return 'control';
  if (prefix === 'repl') return 'data';
  return prefix as PortType;
}

export function downloadArchitectureMd(st: GameStore): boolean {
  const md = buildArchitectureMd(st);
  if (!md) return false;
  try {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uptime-design-doc-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  }
}
