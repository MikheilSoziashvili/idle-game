import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import { useGame } from '../../../game/state/store';

export interface RegionData extends Record<string, unknown> {
  name: string;
  hue: number;
}
export type RegionNodeType = Node<RegionData, 'region'>;

export default function RegionNode({ id, data, selected }: NodeProps<RegionNodeType>) {
  const region = useGame((s) => s.regions.find((r) => r.id === id));
  const patchRegion = useGame((s) => s.patchRegion);
  const setPositions = useGame((s) => s.setNodePositions);

  const polCount = region ? Object.values(region.policies).filter(Boolean).length : 0;

  return (
    <div className="region-node" style={{ '--rhue': data.hue } as React.CSSProperties}>
      <NodeResizer
        isVisible={selected}
        minWidth={260}
        minHeight={180}
        lineStyle={{ borderColor: `hsla(${data.hue},65%,62%,0.8)` }}
        handleStyle={{ background: `hsl(${data.hue},65%,62%)`, width: 8, height: 8, borderRadius: 2 }}
        onResizeEnd={(_e, params) => {
          patchRegion(id, { w: params.width, h: params.height, x: params.x, y: params.y });
          setPositions([{ id, x: params.x, y: params.y }]);
        }}
      />
      <div className="region-tag">
        <span>⊕ {data.name}</span>
        <span className="region-pol">{polCount > 0 ? `${polCount} ${polCount === 1 ? 'policy' : 'policies'}` : 'no policies'}</span>
      </div>
    </div>
  );
}
