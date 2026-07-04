import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { useGame } from '../../../game/state/store';
import { rampColor } from '../../../game/systems/overlays';
import { useReducedMotion } from '../../hooks';

// The signature visual: packets flowing along edges, color-coded by how
// saturated the downstream node is (calm green → amber → red).

const IDLE = '#b3c0ce';

export default function PacketEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props;
  const live = useGame((s) => s.live.edgeStats[id]);
  const speed = useGame((s) => s.speed);
  const reduced = useReducedMotion();

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
  });

  // Control / replication links carry policy, not traffic: quiet dashed lines.
  const wire = (data as { wire?: string } | undefined)?.wire ?? 'traffic';
  if (wire !== 'traffic') {
    const c = wire === 'control' ? 'var(--port-control)' : 'var(--port-repl)';
    return (
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: c, strokeWidth: selected ? 2 : 1.3, strokeDasharray: '4 5', opacity: 0.65 }}
      />
    );
  }

  const rps = live?.rps ?? 0;
  const util = live?.util ?? 0;
  const active = rps > 0.05;
  const color = active ? rampColor(Math.min(1, util)) : IDLE;
  const width = active ? 1.6 + Math.min(2.8, rps / 35) : 1.2;

  // Packet dots: SMIL motion along the edge path. Count scales with volume,
  // speed with sim speed. Disabled under prefers-reduced-motion.
  const dots = !reduced && active && speed > 0 ? 1 + Math.min(3, Math.floor(rps / 12)) : 0;
  const dur = Math.max(0.5, 2.4 - Math.min(1, util) * 1.1) / (speed === 0 ? 1 : Math.min(2, speed));

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className="rf-packet-path"
        style={{
          stroke: color,
          strokeWidth: width,
          opacity: active ? 0.95 : 0.55,
          strokeDasharray: reduced && active ? '7 5' : undefined,
        }}
      />
      {Array.from({ length: dots }, (_, i) => (
        <circle key={i} r={2.3} fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(i * dur) / dots}s`} path={path} />
        </circle>
      ))}
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: 'var(--panel-3)',
              border: '1px solid var(--line-bright)',
              borderRadius: 6,
              padding: '2px 8px',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            {rps < 10 ? rps.toFixed(1) : Math.round(rps)} rps · {Math.round(util * 100)}%
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
