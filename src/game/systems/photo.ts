import { CATEGORY_INFO, SPECS, specOf } from '../catalog/nodes';
import type { GameStore } from '../state/store';
import { PORT_WORD, type PortType } from '../engine/types';

// Photo mode: render the current graph as a clean, self-contained SVG
// architecture diagram and download it. Doubles as a system-design sketch.

// keyed loosely: legacy 'repl-*' handles from old saves still hit this map
const PORT_COLORS: Record<string, string> = {
  http: '#2f6feb',
  data: '#a78bfa',
  jobs: '#34d1bf',
  repl: '#a78bfa',
  control: '#39c5cf',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildArchitectureSvg(st: GameStore): string {
  const nodes = st.nodes;
  if (nodes.length === 0) return '';
  const W = 190;
  const H = 70;

  const boxOf = (n: (typeof nodes)[number]) => ({
    x: n.x,
    y: n.y,
    w: n.kind === 'zone' ? (n.zone?.w ?? 230) : W,
    h: n.kind === 'zone' ? (n.zone?.h ?? 150) : H,
  });
  // one box per node — reused for bounds, edges, and rendering below
  const boxes = new Map(nodes.map((n) => [n.id, boxOf(n)]));

  const minX = Math.min(...nodes.map((n) => boxes.get(n.id)!.x), ...st.regions.map((r) => r.x)) - 60;
  const minY = Math.min(...nodes.map((n) => boxes.get(n.id)!.y), ...st.regions.map((r) => r.y)) - 60;
  const maxX = Math.max(...nodes.map((n) => boxes.get(n.id)!.x + boxes.get(n.id)!.w), ...st.regions.map((r) => r.x + r.w)) + 60;
  const maxY = Math.max(...nodes.map((n) => boxes.get(n.id)!.y + boxes.get(n.id)!.h), ...st.regions.map((r) => r.y + r.h)) + 110;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" font-family="ui-monospace, Menlo, Consolas, monospace">`,
    `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#f4f6f9"/>`,
  );

  for (const r of st.regions) {
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14" fill="hsla(${r.hue},70%,55%,0.06)" stroke="hsla(${r.hue},60%,45%,0.5)" stroke-dasharray="6 5"/>`,
      `<text x="${r.x + 12}" y="${r.y + 20}" font-size="12" fill="hsla(${r.hue},60%,35%,0.9)">⊕ ${esc(r.name)}</text>`,
    );
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of st.edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const ab = boxes.get(a.id)!;
    const bb = boxes.get(b.id)!;
    const x1 = ab.x + ab.w;
    const y1 = ab.y + ab.h / 2;
    const x2 = bb.x;
    const y2 = bb.y + bb.h / 2;
    const prefix = e.sourceHandle.split('-')[0];
    const type = prefix === 'ctl' ? 'control' : prefix; // 'repl' = legacy replication handles
    const c = PORT_COLORS[type] ?? '#888';
    const mx = (x1 + x2) / 2;
    const dash = type === 'control' || type === 'repl' ? ' stroke-dasharray="4 5"' : '';
    parts.push(
      `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none" stroke="${c}" stroke-width="1.8" opacity="0.75"${dash}/>`,
    );
  }

  for (const n of nodes) {
    const b = boxes.get(n.id)!;
    const spec = specOf(n.kind, n.zone?.template);
    const color = CATEGORY_INFO[spec.category].color;
    const title = n.label ?? (n.kind === 'zone' ? (n.zone?.name ?? 'pool') : spec.name);
    const sub =
      n.kind === 'zone'
        ? `pool of ${spec.name} ×${n.zone?.instances ?? 1}`
        : `${spec.short}${n.level > 1 ? ` · L${n.level}` : ''}`;
    const dashed = n.kind === 'zone' ? ' stroke-dasharray="7 5"' : '';
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#ffffff" stroke="#c8d1dc"${dashed}/>`,
      `<rect x="${b.x}" y="${b.y}" width="5" height="${b.h}" rx="2.5" fill="${color}"/>`,
      `<text x="${b.x + 14}" y="${b.y + 24}" font-size="13" font-weight="600" fill="#1a2634">${esc(title)}</text>`,
      `<text x="${b.x + 14}" y="${b.y + 42}" font-size="10" fill="#66788c">${esc(sub)}</text>`,
    );
  }

  // legend
  const lx = minX + 24;
  const ly = maxY - 66;
  parts.push(`<text x="${lx}" y="${ly - 10}" font-size="10" fill="#66788c">wires:</text>`);
  let off = 0;
  for (const t of ['http', 'data', 'jobs', 'control'] as PortType[]) {
    parts.push(
      `<line x1="${lx + off}" y1="${ly + 6}" x2="${lx + off + 26}" y2="${ly + 6}" stroke="${PORT_COLORS[t]}" stroke-width="2.5"/>`,
      `<text x="${lx + off + 32}" y="${ly + 10}" font-size="10" fill="#43536b">${PORT_WORD[t]}</text>`,
    );
    off += 92;
  }
  parts.push(
    `<text x="${lx}" y="${ly + 34}" font-size="10" fill="#8b9bb0">UPTIME — architecture export · ${nodes.length} nodes, ${st.edges.length} wires</text>`,
    '</svg>',
  );
  return parts.join('\n');
}

export function downloadArchitectureSvg(st: GameStore): boolean {
  const svg = buildArchitectureSvg(st);
  if (!svg) return false;
  try {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uptime-architecture-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  }
}
