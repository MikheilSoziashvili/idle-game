import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import InfraNode, { type InfraData } from './nodes/InfraNode';
import ZoneNode, { type ZoneData } from './nodes/ZoneNode';
import RegionNode, { type RegionData } from './nodes/RegionNode';
import PacketEdge from './edges/PacketEdge';
import { handlesOf, useGame } from '../../game/state/store';
import { CATEGORY_INFO, SPECS, specOf } from '../../game/catalog/nodes';
import { PORT_WORD, type NodeKind } from '../../game/engine/types';
import { STARTER_BLUEPRINTS } from '../../game/catalog/blueprints';
import { computeAutoLayout, alignmentGuides } from '../../game/engine/layout';
import { BAL, fmtMoney, fmtNum } from '../../game/engine/balance';

const nodeTypes = {
  infra: InfraNode as unknown as React.ComponentType<NodeProps>,
  zone: ZoneNode as unknown as React.ComponentType<NodeProps>,
  region: RegionNode as unknown as React.ComponentType<NodeProps>,
};
const edgeTypes = { packet: PacketEdge };

function CanvasInner() {
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  const nodes = useGame((s) => s.nodes);
  const edges = useGame((s) => s.edges);
  const regions = useGame((s) => s.regions);
  const tool = useGame((s) => s.tool);
  const selection = useGame((s) => s.selection);
  const selEdges = useGame((s) => s.selEdges);
  const fitSignal = useGame((s) => s.fitSignal);
  const pendingBlueprint = useGame((s) => s.pendingBlueprint);
  const pendingZoneTemplate = useGame((s) => s.pendingZoneTemplate);

  const [wireFrom, setWireFrom] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drawStart = useRef<{ cx: number; cy: number } | null>(null);
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });

  // ---------------- build RF nodes/edges from the store ----------------
  const selSet = useMemo(() => new Set(selection), [selection]);
  const selEdgeSet = useMemo(() => new Set(selEdges), [selEdges]);

  const rfNodes = useMemo<Node[]>(() => {
    const list: Node[] = [];
    for (const r of regions) {
      list.push({
        id: r.id,
        type: 'region',
        position: { x: r.x, y: r.y },
        data: { name: r.name, hue: r.hue } satisfies RegionData,
        style: { width: r.w, height: r.h },
        zIndex: -20,
        dragHandle: '.region-tag',
        selected: selSet.has(r.id),
        draggable: true,
      });
    }
    for (const n of nodes) {
      if (n.kind === 'zone' && n.zone) {
        list.push({
          id: n.id,
          type: 'zone',
          position: { x: n.x, y: n.y },
          data: {
            template: n.zone.template,
            name: n.zone.name,
            min: n.zone.min,
            max: n.zone.max,
          } satisfies ZoneData,
          style: { width: n.zone.w, height: n.zone.h },
          zIndex: -5,
          dragHandle: '.zone-head',
          selected: selSet.has(n.id),
          draggable: true,
        });
      } else {
        list.push({
          id: n.id,
          type: 'infra',
          position: { x: n.x, y: n.y },
          data: {
            kind: n.kind as Exclude<NodeKind, 'zone'>,
            level: n.level,
            disabled: Boolean(n.disabled),
            wireFlag: wireFrom === n.id,
            label: n.label,
          } satisfies InfraData,
          zIndex: 1,
          selected: selSet.has(n.id),
          draggable: tool === 'move' || tool === 'select',
          deletable: n.kind !== 'users',
        });
      }
    }
    return list;
  }, [nodes, regions, selSet, tool, wireFrom]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const pt = e.sourceHandle.split('-')[0];
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
          type: 'packet',
          selected: selEdgeSet.has(e.id),
          data: { wire: pt === 'ctl' ? 'control' : pt === 'repl' ? 'repl' : 'traffic' },
        };
      }),
    [edges, selEdgeSet],
  );

  // ---------------- change handlers ----------------
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const s = useGame.getState();
    const moves: { id: string; x: number; y: number }[] = [];
    let sel: Set<string> | null = null;
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) {
        if (ch.id.startsWith('r')) {
          s.patchRegion(ch.id, { x: ch.position.x, y: ch.position.y });
        } else {
          moves.push({ id: ch.id, x: ch.position.x, y: ch.position.y });
        }
      } else if (ch.type === 'select') {
        if (!sel) sel = new Set(s.selection);
        if (ch.selected) sel.add(ch.id);
        else sel.delete(ch.id);
      }
    }
    if (moves.length > 0) s.setNodePositions(moves);
    if (sel) s.setSelection([...sel], s.selEdges);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const s = useGame.getState();
    let sel: Set<string> | null = null;
    for (const ch of changes) {
      if (ch.type === 'select') {
        if (!sel) sel = new Set(s.selEdges);
        if (ch.selected) sel.add(ch.id);
        else sel.delete(ch.id);
      }
    }
    if (sel) s.setSelection(s.selection, [...sel]);
  }, []);

  const isValidConnection = useCallback((conn: Edge | Connection) => {
    const { source, target, sourceHandle, targetHandle } = conn;
    if (!source || !target || !sourceHandle || !targetHandle || source === target) return false;
    return resolveConnection(source, sourceHandle, target, targetHandle) !== null;
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
    // 'any-*' handles (whole-card wiring) resolve to the best compatible port pair.
    const pair = resolveConnection(c.source, c.sourceHandle, c.target, c.targetHandle);
    if (pair) useGame.getState().connectPorts(pair);
  }, []);

  // Deletes (Backspace / bulldoze) always go through confirm-or-undo paths.
  const onBeforeDelete = useCallback(
    async ({ nodes: delNodes, edges: delEdges }: { nodes: Node[]; edges: Edge[] }): Promise<boolean> => {
      const s = useGame.getState();
      const regionIds = delNodes.filter((n) => n.type === 'region').map((n) => n.id);
      const nodeIds = delNodes.filter((n) => n.type !== 'region').map((n) => n.id);
      const edgeIds = delEdges.map((e) => e.id);
      if (nodeIds.length > 0 || regionIds.length > 0) {
        confirmBulldoze(nodeIds, regionIds, edgeIds);
      } else if (edgeIds.length > 0) {
        s.removeEdges(edgeIds);
      }
      return false; // we handle mutations ourselves
    },
    [],
  );

  // ---------------- tool interactions ----------------
  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      const s = useGame.getState();
      if (tool === 'bulldoze') {
        e.stopPropagation();
        if (node.type === 'region') confirmBulldoze([], [node.id], []);
        else confirmBulldoze([node.id], [], []);
        return;
      }
      if (tool === 'upgrade') {
        e.stopPropagation();
        if (node.type !== 'region') s.upgradeNodes([node.id]);
        return;
      }
      if (tool === 'wire' && node.type !== 'region') {
        e.stopPropagation();
        if (!wireFrom) {
          setWireFrom(node.id);
        } else if (wireFrom !== node.id) {
          const sources = s.selection.length > 1 && s.selection.includes(wireFrom) ? s.selection : [wireFrom];
          let made = 0;
          for (const srcId of sources) {
            const pair = bestPortPair(srcId, node.id);
            if (pair && s.connectPorts(pair)) made++;
          }
          if (made === 0) {
            const [title, body] = mismatchAdvice(wireFrom, node.id);
            s.addToast('warn', title, body);
          }
          setWireFrom(null);
        } else {
          setWireFrom(null);
        }
      }
    },
    [tool, wireFrom],
  );

  const onEdgeClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      // Wire mode is for managing connections: clicking an existing one removes
      // it (undoable). Bulldoze keeps doing the same for consistency.
      if (tool === 'bulldoze' || tool === 'wire') {
        e.stopPropagation();
        useGame.getState().removeEdges([edge.id]);
      }
    },
    [tool],
  );

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      const s = useGame.getState();
      if (tool === 'stamp' && pendingBlueprint) {
        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const ok = s.applyBlueprint(pendingBlueprint, pos.x, pos.y);
        if (ok) s.grantAchievement('terraformed');
        return;
      }
      s.setSelection([], []);
      setWireFrom(null);
    },
    [tool, pendingBlueprint, rf],
  );

  const onPaneMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (tool === 'stamp' && pendingBlueprint) {
        setGhostPos(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }
    },
    [tool, pendingBlueprint, rf],
  );

  // ---------------- alignment guides + snap ----------------
  const onNodeDrag = useCallback(
    (_e: unknown, node: Node, dragged: Node[]) => {
      if (dragged.length > 1 || node.type === 'region' || node.type === 'zone') {
        setGuides({ v: null, h: null });
        return;
      }
      const g = alignmentGuides(node.id, node.position.x, node.position.y, useGame.getState().nodes);
      setGuides({ v: g.v, h: g.h });
    },
    [],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node, dragged: Node[]) => {
      const s = useGame.getState();
      if (dragged.length === 1 && node.type === 'infra') {
        const g = alignmentGuides(node.id, node.position.x, node.position.y, s.nodes);
        if (g.snapX !== node.position.x || g.snapY !== node.position.y) {
          s.setNodePositions([{ id: node.id, x: g.snapX, y: g.snapY }]);
        }
      }
      setGuides({ v: null, h: null });
      s.bumpGraph(); // recompute region membership
    },
    [],
  );

  // ---------------- palette drag & drop ----------------
  const dragKind = useGame((s) => s.dragKind);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setDragPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragPos(null);
      const kind = e.dataTransfer.getData('application/uptime') as Exclude<NodeKind, 'zone'>;
      if (!kind || !SPECS[kind]) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      useGame.getState().placeNode(kind, pos.x - 89, pos.y - 32);
    },
    [rf],
  );
  const onDragLeave = useCallback(() => setDragPos(null), []);

  // ---------------- zone / region draw layer ----------------
  const beginDraw = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawStart.current = { cx: e.clientX, cy: e.clientY };
    setDrawRect(rectFromClients(wrapRef.current!, e.clientX, e.clientY, e.clientX, e.clientY));
  }, []);
  const moveDraw = useCallback((e: React.PointerEvent) => {
    if (!drawStart.current) return;
    setDrawRect(rectFromClients(wrapRef.current!, drawStart.current.cx, drawStart.current.cy, e.clientX, e.clientY));
  }, []);
  const endDraw = useCallback(
    (e: React.PointerEvent) => {
      const start = drawStart.current;
      drawStart.current = null;
      setDrawRect(null);
      if (!start) return;
      const a = rf.screenToFlowPosition({ x: start.cx, y: start.cy });
      const b = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      if (w < 60 || h < 50) return;
      const s = useGame.getState();
      if (tool === 'zone') {
        if (!pendingZoneTemplate) {
          s.addToast('warn', 'Pick a zone template', 'Choose what this pool runs from the row next to the toolbar.');
          return;
        }
        s.createZone(x, y, Math.max(230, w), Math.max(150, h), pendingZoneTemplate);
      } else if (tool === 'region') {
        s.createRegion(x, y, Math.max(260, w), Math.max(180, h));
      }
    },
    [rf, tool, pendingZoneTemplate],
  );

  // ---------------- external signals ----------------
  useEffect(() => {
    if (fitSignal > 0) rf.fitView({ padding: 0.18, duration: 350 });
  }, [fitSignal, rf]);

  useEffect(() => {
    const handler = () => {
      const s = useGame.getState();
      const moves = computeAutoLayout(s.nodes, s.edges);
      s.setNodePositions(moves);
      s.bumpGraph();
      window.setTimeout(() => rf.fitView({ padding: 0.18, duration: 350 }), 30);
    };
    window.addEventListener('uptime:autolayout', handler);
    return () => window.removeEventListener('uptime:autolayout', handler);
  }, [rf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWireFrom(null);
        drawStart.current = null;
        setDrawRect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (tool !== 'wire') setWireFrom(null);
    if (tool !== 'stamp') setGhostPos(null);
  }, [tool]);

  const bp = pendingBlueprint ? [...STARTER_BLUEPRINTS, ...useGame.getState().blueprints].find((b) => b.id === pendingBlueprint) : null;

  return (
    <div className={`flow-wrap mode-${tool} ${tool === 'wire' ? 'wire-mode' : ''}`} ref={wrapRef}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onBeforeDelete={onBeforeDelete}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onPaneMouseMove={onPaneMouseMove}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'packet' }}
        colorMode="light"
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        snapToGrid
        snapGrid={[8, 8]}
        connectionRadius={48}
        panOnDrag={[1, 2]}
        selectionKeyCode="Shift"
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        deleteKeyCode={['Backspace', 'Delete']}
        nodesDraggable={tool === 'move' || tool === 'select'}
        nodesConnectable={tool === 'move' || tool === 'wire'}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#c6d0dc" />
        <Controls position="bottom-left" showInteractive={false} className="flow-controls" />
        {nodes.length >= 6 && (
        <MiniMap
          position="bottom-right"
          className="flow-minimap"
          style={{ width: 168, height: 108 }}
          pannable
          zoomable
          bgColor="#e7ebf1"
          maskColor="rgba(26,38,52,0.12)"
          nodeColor={(n) => {
            if (n.type === 'region') return 'rgba(9,105,218,0.08)';
            if (n.type === 'zone') return 'rgba(212,104,31,0.3)';
            const kind = (n.data as InfraData | undefined)?.kind;
            return kind ? CATEGORY_INFO[SPECS[kind].category].color : '#55708a';
          }}
        />
        )}

        {/* alignment guides */}
        <ViewportPortal>
          {guides.v !== null && <div className="align-guide v" style={{ left: guides.v, top: -50000, height: 100000 }} />}
          {guides.h !== null && <div className="align-guide h" style={{ top: guides.h, left: -50000, width: 100000 }} />}
        </ViewportPortal>

        {/* blueprint stamp ghost */}
        {tool === 'stamp' && bp && ghostPos && (
          <ViewportPortal>
            <div className="stamp-ghost" style={{ transform: `translate(${ghostPos.x}px, ${ghostPos.y}px)` }}>
              {bp.nodes.map((bn, i) => (
                <div
                  key={i}
                  className={`ghost-node ${bn.kind === 'zone' ? 'ghost-zone' : ''}`}
                  style={{
                    left: bn.dx,
                    top: bn.dy,
                    width: bn.kind === 'zone' ? (bn.zone?.w ?? 230) : 178,
                    height: bn.kind === 'zone' ? (bn.zone?.h ?? 150) : 64,
                  }}
                >
                  {specOf(bn.kind, bn.zone?.template).short}
                  {bn.level > 1 ? ` ·L${bn.level}` : ''}
                </div>
              ))}
            </div>
          </ViewportPortal>
        )}
      </ReactFlow>

      {/* what-if ghost: spec facts follow the palette drag before you commit */}
      {dragKind && dragPos && SPECS[dragKind] && (
        <div className="drag-whatif" style={{ left: dragPos.x + 18, top: dragPos.y + 14 }}>
          <b>{SPECS[dragKind].name}</b>
          <span className="mono">
            {fmtNum(SPECS[dragKind].capacity)} rps cap · ${SPECS[dragKind].opCost.toFixed(2)}/s
            {SPECS[dragKind].perServeCost ? ` · $${SPECS[dragKind].perServeCost}/req` : ''}
          </span>
          <span>
            {SPECS[dragKind].serves.length > 0 ? `serves: ${SPECS[dragKind].serves.join(', ')}` : SPECS[dragKind].hitRate ? 'cache — absorbs upstream reads' : SPECS[dragKind].capacity === 0 ? 'support node — no traffic' : 'routes traffic onward'}
          </span>
        </div>
      )}

      {/* zone/region drawing capture layer — z 5 keeps it above the canvas but
          below every floating panel (objectives 6, palette 7, toolbar 8), so
          the zone-template row and tools stay clickable while drawing. */}
      {(tool === 'zone' || tool === 'region') && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'cell', touchAction: 'none' }}
          onPointerDown={beginDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
        >
          {drawRect && (
            <div
              className="draw-preview"
              style={{ left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function rectFromClients(wrap: HTMLElement, x1: number, y1: number, x2: number, y2: number) {
  const r = wrap.getBoundingClientRect();
  return {
    x: Math.min(x1, x2) - r.left,
    y: Math.min(y1, y2) - r.top,
    w: Math.abs(x1 - x2),
    h: Math.abs(y1 - y2),
  };
}

/**
 * When no ports match, say WHY in plain words and suggest the intermediary —
 * the type system is a teacher, so the error should teach too.
 */
function mismatchAdvice(srcId: string, tgtId: string): [string, string] {
  const s = useGame.getState();
  const src = s.nodes.find((n) => n.id === srcId);
  const tgt = s.nodes.find((n) => n.id === tgtId);
  if (!src || !tgt) return ['No compatible ports', 'One of the nodes is gone.'];
  const outs = new Set(handlesOf(src).filter((h) => h.dir === 'out').map((h) => h.type));
  const ins = new Set(handlesOf(tgt).filter((h) => h.dir === 'in').map((h) => h.type));
  const srcName = src.label ?? specOf(src.kind, src.zone?.template).name;
  const tgtName = tgt.label ?? specOf(tgt.kind, tgt.zone?.template).name;
  const word = (set: Set<string>) => [...set].map((t) => PORT_WORD[t as keyof typeof PORT_WORD] ?? t).join('/') || 'nothing';
  if (ins.size === 0) return [`${tgtName} takes no wires`, 'It works on its own — no inputs to connect.'];
  if (outs.size === 0) return [`${srcName} sends nothing onward`, 'It terminates what it receives — wire INTO it instead.'];
  let fix = 'Wire like to like — in wire mode, dragging card to card matches ports automatically.';
  if (outs.has('http') && ins.has('data')) fix = `Web boxes don't speak storage. Put an App Server between ${srcName} and ${tgtName} — its storage port talks to databases and caches.`;
  else if (outs.has('http') && ins.has('jobs')) fix = `Queues take jobs, not web traffic. An App Server enqueues work — wire ${srcName} → App Server → ${tgtName}.`;
  else if (outs.has('data') && ins.has('http')) fix = `Storage flows downstream, not back to the web tier. Traffic already returns on its own.`;
  else if (ins.has('control')) fix = `That's a control port — only an Autoscaler/Kubernetes policy wire fits, and only onto a Zone.`;
  else if (outs.has('control')) fix = `${srcName} speaks control — wire it onto a Zone to manage it.`;
  return [
    `${srcName} speaks ${word(outs)} — ${tgtName} listens for ${word(ins)}`,
    fix,
  ];
}

/** First compatible out→in port pair between two nodes (wire tool quick-connect). */
function bestPortPair(
  srcId: string,
  tgtId: string,
): { source: string; sourceHandle: string; target: string; targetHandle: string } | null {
  return resolveConnection(srcId, 'any-out', tgtId, 'any-in');
}

/**
 * Resolve a (possibly 'any-*') handle pair to a concrete, legal, non-duplicate
 * connection. 'any-out'/'any-in' are the invisible whole-card handles rendered
 * in wire mode: they mean "pick the best compatible port for me".
 */
function resolveConnection(
  srcId: string,
  sourceHandle: string,
  tgtId: string,
  targetHandle: string,
): { source: string; sourceHandle: string; target: string; targetHandle: string } | null {
  const s = useGame.getState();
  const src = s.nodes.find((n) => n.id === srcId);
  const tgt = s.nodes.find((n) => n.id === tgtId);
  if (!src || !tgt) return null;
  const outs = handlesOf(src).filter((h) => h.dir === 'out' && (sourceHandle === 'any-out' || h.id === sourceHandle));
  const ins = handlesOf(tgt).filter((h) => h.dir === 'in' && (targetHandle === 'any-in' || h.id === targetHandle));
  for (const o of outs) {
    for (const i of ins) {
      if (o.type !== i.type) continue;
      if (o.type === 'control' && tgt.kind !== 'zone') continue;
      const dup = s.edges.some(
        (e) => e.source === srcId && e.target === tgtId && e.sourceHandle === o.id && e.targetHandle === i.id,
      );
      if (!dup) return { source: srcId, sourceHandle: o.id, target: tgtId, targetHandle: i.id };
    }
  }
  return null;
}

function confirmBulldoze(nodeIds: string[], regionIds: string[], edgeIds: string[]) {
  const s = useGame.getState();
  const doomed = s.nodes.filter((n) => nodeIds.includes(n.id) && n.kind !== 'users');
  if (doomed.length === 0 && regionIds.length === 0) {
    if (edgeIds.length > 0) s.removeEdges(edgeIds);
    return;
  }
  const refund = s.sandbox ? 0 : Math.round(doomed.reduce((acc, n) => acc + n.spent, 0) * BAL.refundRatio);
  const parts: string[] = [];
  if (doomed.length > 0) parts.push(`${doomed.length} node${doomed.length > 1 ? 's' : ''}`);
  if (regionIds.length > 0) parts.push(`${regionIds.length} region${regionIds.length > 1 ? 's' : ''}`);
  const attachedEdges = s.edges.filter((e) => nodeIds.includes(e.source) || nodeIds.includes(e.target)).length;
  s.requestConfirm({
    title: 'Decommission infrastructure?',
    body: `${parts.join(' and ')} will be removed${attachedEdges > 0 ? ` along with ${attachedEdges} connection${attachedEdges > 1 ? 's' : ''}` : ''}. Salvage value: ${fmtMoney(refund)}.`,
    danger: true,
    confirmLabel: 'Bulldoze',
    onYes: () => {
      if (doomed.length > 0) s.removeNodes(doomed.map((n) => n.id));
      for (const rid of regionIds) s.removeRegion(rid);
      if (edgeIds.length > 0) s.removeEdges(edgeIds, false);
    },
  });
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
