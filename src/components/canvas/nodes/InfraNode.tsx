import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { BAL, fmtNum, masteryTier } from '../../../game/engine/balance';
import { CLASSES, CLASS_COLORS, CLASS_LABEL, PORT_WORD, type NodeKind, type NodeLive } from '../../../game/engine/types';
import { CATEGORY_INFO, SPECS } from '../../../game/catalog/nodes';
import { useGame } from '../../../game/state/store';
import { overlayValue, rampColor } from '../../../game/systems/overlays';
import BrandIcon from '../../BrandIcon';

/** Polyline points for the served-rps sparkline, right-aligned so "now" hugs the right edge. */
export function sparkPoints(spark: number[], len: number): string {
  const max = Math.max(...spark, 1e-6);
  const offset = len - spark.length;
  return spark.map((v, i) => `${offset + i},${14.5 - (v / max) * 13}`).join(' ');
}

/** Class-mix strip: proportional colored segments of the incoming traffic. */
export function ClassStrip({ live }: { live: NodeLive }) {
  const total = live.classIn.reduce((a, b) => a + b, 0);
  if (total < 0.5) return null;
  const label = live.classIn
    .map((r, i) => (r / total >= 0.02 ? `${CLASS_LABEL[CLASSES[i]]} ${fmtNum(r)}/s` : null))
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="node-classstrip" title={`traffic mix: ${label}`}>
      {live.classIn.map((r, i) =>
        r / total >= 0.02 ? <i key={CLASSES[i]} style={{ flexGrow: r, background: CLASS_COLORS[CLASSES[i]] }} /> : null,
      )}
    </div>
  );
}

export interface InfraData extends Record<string, unknown> {
  kind: Exclude<NodeKind, 'zone'>;
  level: number;
  disabled: boolean;
  wireFlag: boolean;
  label?: string;
}
export type InfraNodeType = Node<InfraData, 'infra'>;

export default function InfraNode({ id, data, selected }: NodeProps<InfraNodeType>) {
  const spec = SPECS[data.kind];
  const cat = CATEGORY_INFO[spec.category];
  const live = useGame((s) => s.live.nodeStats[id]);
  const overlay = useGame((s) => s.overlay);
  const mastery = useGame((s) => masteryTier(s.stats.servedByKind?.[data.kind] ?? 0));

  const ov = overlayValue(overlay, live);
  const util = live?.util ?? 0;
  const booting = (live?.booting ?? 0) > 0 && (live?.instances ?? 1) === 0;
  const unhealthy = (live?.health ?? 1) < 0.85;
  const isSource = spec.special === 'source' || spec.special === 'ingress';
  const observ = spec.capacity === 0 && !isSource;

  const ins = spec.ports.filter((p) => p.dir === 'in');
  const outs = spec.ports.filter((p) => p.dir === 'out');

  return (
    <div
      className={[
        'node-card',
        booting ? 'booting' : '',
        data.disabled || live?.hint === 'OFFLINE' ? 'offline' : '',
        unhealthy ? 'unhealthy' : '',
        ov ? 'overlay-active' : '',
        selected ? 'selected' : '',
        mastery > 0 ? `mastery-${mastery}` : '',
      ].join(' ')}
      style={
        {
          '--cat': cat.color,
          '--heat': ov && ov.t > 0.02 ? rampColor(ov.t) : 'transparent',
        } as React.CSSProperties
      }
    >
      {data.wireFlag && <div className="wire-source-flag">wiring from…</div>}
      {ov && <div className="node-overlay-badge">{ov.label}</div>}

      <div className="node-head">
        <span className="node-logo" title={spec.short}>
          <BrandIcon kind={data.kind} size={15} />
        </span>
        <span className="node-name" title={data.label ? spec.name : undefined}>{data.label ?? spec.name}</span>
        {!isSource && !observ && (
          <span className="node-pips" title={`level ${data.level}/${BAL.maxLevel}`}>
            {Array.from({ length: BAL.maxLevel }, (_, i) => (
              <i key={i} className={i < data.level ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>

      {live?.role ? (
        <div className="node-role" title={live.role}>
          {live.role}
        </div>
      ) : null}

      <div className="node-stats">
        {isSource ? (
          <>
            <span>
              out <b>{fmtNum(live?.served ?? 0)}</b> rps
            </span>
            <span style={{ color: 'var(--ok)' }}>{(live?.served ?? 0) > 0 ? '● LIVE' : '○ idle'}</span>
          </>
        ) : observ ? (
          <>
            {spec.special === 'metrics' || spec.special === 'grafana' ? (
              <span>
                RP <b>+{(live?.rpRate ?? 0).toFixed(2)}</b>/s
              </span>
            ) : (
              <span>
                <b>{spec.special === 'autoscaler' ? 'policy' : spec.special === 'k8s' ? 'cluster' : spec.special === 'cicd' ? 'pipeline' : 'active'}</b>
              </span>
            )}
            <span>
              <b>${(live?.costRate ?? 0).toFixed(2)}</b>/s
            </span>
          </>
        ) : (
          <>
            <span>
              in <b>{fmtNum(live?.inRps ?? 0)}</b>
            </span>
            <span>
              {(live?.latencyMs ?? 0) > 9000 ? (
                <b style={{ color: 'var(--amber)' }}>buffering</b>
              ) : (
                <>
                  <b>{fmtNum(live?.latencyMs ?? 0)}</b> ms
                </>
              )}
            </span>
            <span>
              srv <b>{fmtNum(live?.served ?? 0)}</b>
            </span>
            {live && live.hitPct >= 0 ? (
              <span>
                hit <b>{Math.round(live.hitPct * 100)}%</b>
              </span>
            ) : (
              <span>
                q <b>{live?.queue ?? 0}</b>
              </span>
            )}
          </>
        )}
        {!isSource && !observ && live && <ClassStrip live={live} />}
        {!isSource && !observ && (
          <div className="node-utilbar">
            <i
              style={{
                width: `${Math.min(100, util * 100)}%`,
                background: rampColor(Math.min(1, util)),
              }}
            />
          </div>
        )}
        {!isSource && !observ && (live?.queue ?? 0) > 3 && (
          <div
            className="node-queuebar"
            title={`queue: ${live!.queue} buffered / ~${spec.queueLen * Math.max(1, (live!.instances ?? 1) + (live!.booting ?? 0))} capacity`}
          >
            <i
              style={{
                width: `${Math.min(100, (live!.queue / (spec.queueLen * Math.max(1, (live!.instances ?? 1) + (live!.booting ?? 0)))) * 100)}%`,
              }}
            />
          </div>
        )}
        {!observ && (live?.spark?.length ?? 0) > 1 && live!.spark.some((v) => v > 0) && (
          <svg
            className="node-spark"
            viewBox={`0 0 ${BAL.sparkLen} 16`}
            preserveAspectRatio="none"
            aria-label="served rps, last 48s"
          >
            <polyline points={sparkPoints(live!.spark, BAL.sparkLen)} />
          </svg>
        )}
      </div>

      {live?.hint && (
        <div className={`node-hint ${live.hint === 'OFFLINE' ? 'offline-hint' : ''}`}>{live.hint}</div>
      )}
      {(live?.drops ?? 0) > 0.2 && (
        <div className="node-hint offline-hint">dropping {fmtNum(live!.drops)} req/s</div>
      )}

      {ins.map((p, i) => (
        <Handle
          key={p.id}
          id={p.id}
          type="target"
          position={Position.Left}
          className={`port-${p.type}${(live?.portIn?.[p.type] ?? 0) > 0.05 ? ' port-active' : ''}`}
          style={{ top: 34 + i * 22 }}
          title={`in · ${p.label} (${PORT_WORD[p.type]}) · ${fmtNum(live?.portIn?.[p.type] ?? 0)} rps`}
        />
      ))}
      {outs.map((p, i) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={Position.Right}
          className={`port-${p.type}${(live?.portOut?.[p.type] ?? 0) > 0.05 ? ' port-active' : ''}`}
          style={{ top: 34 + i * 22 }}
          title={`out · ${p.label} (${PORT_WORD[p.type]}) · ${fmtNum(live?.portOut?.[p.type] ?? 0)} rps`}
        />
      ))}

      {/* whole-card wiring: invisible handles resolved to the best port pair.
          any-in is a pure drop target (never intercepts the pointer); any-out
          becomes grabbable in wire mode so you can drag node → node anywhere. */}
      {ins.length > 0 && (
        <Handle id="any-in" type="target" position={Position.Left} className="port-any" isConnectableStart={false} />
      )}
      {outs.length > 0 && (
        <Handle id="any-out" type="source" position={Position.Right} className="port-any port-any-out" isConnectableEnd={false} />
      )}
    </div>
  );
}
