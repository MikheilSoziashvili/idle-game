import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { CLASSES, CLASS_COLORS, CLASS_LABEL } from '../../../game/engine/types';
import { fmtNum } from '../../../game/engine/balance';
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
  const onDropPath = useGame((s) => s.live.dropPathEdges.includes(id));
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
  const breaker = live?.breaker ?? 0;
  const active = rps > 0.05;
  const color = breaker === 1 ? 'var(--amber, #b57700)' : active ? rampColor(Math.min(1, util)) : IDLE;
  const width = active ? 1.6 + Math.min(2.8, rps / 35) : 1.2;

  // Packet dots: SMIL motion along the edge path. Count scales with volume,
  // speed with sim speed. Disabled under prefers-reduced-motion.
  const dots = !reduced && active && speed > 0 && breaker !== 1 ? 1 + Math.min(3, Math.floor(rps / 12)) : 0;
  const dur = Math.max(0.5, 2.4 - Math.min(1, util) * 1.1) / (speed === 0 ? 1 : Math.min(2, speed));

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`rf-packet-path ${onDropPath ? 'drop-path' : ''} ${breaker === 1 ? 'breaker-open' : ''}`}
        style={{
          stroke: color,
          strokeWidth: onDropPath ? Math.max(width, 2.2) : width,
          opacity: breaker === 1 ? 0.85 : active ? 0.95 : 0.55,
          strokeDasharray: breaker === 1 ? '3 7' : breaker === 2 ? '10 4' : reduced && active ? '7 5' : undefined,
        }}
      />
      {breaker === 1 && (
        <EdgeLabelRenderer>
          <div
            className="breaker-badge"
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'none', zIndex: 11 }}
            title="Circuit breaker OPEN — failing fast while the dependency recovers"
          >
            ⌁ open
          </div>
        </EdgeLabelRenderer>
      )}
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
              padding: '3px 8px',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--text)',
              pointerEvents: 'none',
              zIndex: 10,
              textAlign: 'center',
            }}
          >
            {rps < 10 ? rps.toFixed(1) : Math.round(rps)} rps · {Math.round(util * 100)}%
            {/* what KIND of traffic rides this wire — reads vs writes vs jobs */}
            {active && (live?.classRates?.some((r) => r > 0.05) ?? false) && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 2 }}>
                {live!.classRates.map((r, i) =>
                  r > 0.05 ? (
                    <span key={CLASSES[i]} style={{ color: CLASS_COLORS[CLASSES[i]] }}>
                      {CLASS_LABEL[CLASSES[i]]} {fmtNum(r)}
                    </span>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
