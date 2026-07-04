import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import { fmtNum } from '../../../game/engine/balance';
import type { NodeKind } from '../../../game/engine/types';
import { CATEGORY_INFO, SPECS, specOf } from '../../../game/catalog/nodes';
import { useGame } from '../../../game/state/store';
import { zoneHasController } from '../../../game/systems/zoning';
import { rampColor } from '../../../game/systems/overlays';
import BrandIcon from '../../BrandIcon';

export interface ZoneData extends Record<string, unknown> {
  template: Exclude<NodeKind, 'zone'>;
  name: string;
  min: number;
  max: number;
}
export type ZoneNodeType = Node<ZoneData, 'zone'>;

export default function ZoneNode({ id, data, selected }: NodeProps<ZoneNodeType>) {
  const live = useGame((s) => s.live.nodeStats[id]);
  const hasAuto = useGame((s) => zoneHasController(s, id, 'autoscaler'));
  const hasK8s = useGame((s) => zoneHasController(s, id, 'k8s'));
  const patchZone = useGame((s) => s.patchZone);
  const setPositions = useGame((s) => s.setNodePositions);
  const bump = useGame((s) => s.bumpGraph);

  const spec = specOf('zone', data.template);
  const cat = CATEGORY_INFO[spec.category];
  const ready = live?.instances ?? 1;
  const booting = live?.booting ?? 0;
  const util = live?.util ?? 0;

  const ins = spec.ports.filter((p) => p.dir === 'in');
  const outs = spec.ports.filter((p) => p.dir === 'out');

  return (
    <div className="zone-node" style={{ '--cat': cat.color } as React.CSSProperties}>
      <NodeResizer
        isVisible={selected}
        minWidth={230}
        minHeight={150}
        lineStyle={{ borderColor: 'var(--accent)' }}
        handleStyle={{ background: 'var(--accent)', width: 8, height: 8, borderRadius: 2 }}
        onResizeEnd={(_e, params) => {
          patchZone(id, { w: params.width, h: params.height });
          setPositions([{ id, x: params.x, y: params.y }]);
          bump();
        }}
      />
      <div className="zone-head">
        <span className="node-logo" title={SPECS[data.template].short}>
          <BrandIcon kind={data.template} size={14} />
        </span>
        <span className="zone-title">{data.name}</span>
        {hasAuto && <span className="zone-auto-badge">auto</span>}
        {hasK8s && <span className="zone-auto-badge" style={{ borderColor: 'var(--cat-data)', color: 'var(--cat-data)' }}>k8s</span>}
        <span className="zone-meta">
          {ready}
          {booting > 0 ? `+${booting}` : ''}/{data.max}
        </span>
      </div>
      <div className="zone-grid">
        {Array.from({ length: Math.min(48, ready) }, (_, i) => (
          <span key={`r${i}`} className="zone-inst" title={`${SPECS[data.template].name} instance`} />
        ))}
        {Array.from({ length: Math.min(12, booting) }, (_, i) => (
          <span key={`b${i}`} className="zone-inst booting" title="provisioning…" />
        ))}
        {ready > 48 && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)' }}>+{ready - 48}</span>}
      </div>
      <div className="zone-foot">
        <span style={{ color: rampColor(Math.min(1, util)) }}>util {Math.round(util * 100)}%</span>
        <span>srv {fmtNum(live?.served ?? 0)} rps</span>
        <span>${(live?.costRate ?? 0).toFixed(2)}/s</span>
        {!hasAuto && <span title="Wire an Autoscaler to the ⌾ port for hands-off scaling">manual</span>}
      </div>

      <Handle
        id="ctl-in"
        type="target"
        position={Position.Top}
        className="port-control"
        title="policy (control)"
        style={{ left: '50%' }}
      />
      {ins.map((p, i) => (
        <Handle
          key={p.id}
          id={p.id}
          type="target"
          position={Position.Left}
          className={`port-${p.type}`}
          style={{ top: 44 + i * 26 }}
          title={`${p.label} (${p.type})`}
        />
      ))}
      {outs.map((p, i) => (
        <Handle
          key={p.id}
          id={p.id}
          type="source"
          position={Position.Right}
          className={`port-${p.type}`}
          style={{ top: 44 + i * 26 }}
          title={`${p.label} (${p.type})`}
        />
      ))}
    </div>
  );
}
