import { useMemo } from 'react';
import { BAL, MASTERY_NAMES, fmtMoney, fmtNum, levelCapMult, masteryTier, upgradeCost } from '../../game/engine/balance';
import { CATEGORY_INFO, REPLACE_MAP, SPECS, specOf } from '../../game/catalog/nodes';
import type { PlacedNode, RegionPolicies } from '../../game/engine/types';
import { isKindUnlocked, useGame } from '../../game/state/store';
import { zoneHasController, zoneSpawnCost } from '../../game/systems/zoning';
import { rampColor } from '../../game/systems/overlays';
import { NODE_LEARN } from '../../game/catalog/lessons';
import BrandIcon from '../BrandIcon';

export default function Inspector() {
  const open = useGame((s) => s.inspectorOpen);
  const toggle = useGame((s) => s.toggleInspector);
  const selection = useGame((s) => s.selection);
  const selEdges = useGame((s) => s.selEdges);
  const nodes = useGame((s) => s.nodes);
  const regions = useGame((s) => s.regions);

  const selNodes = useMemo(() => nodes.filter((n) => selection.includes(n.id)), [nodes, selection]);
  const selRegions = useMemo(() => regions.filter((r) => selection.includes(r.id)), [regions, selection]);

  let body: React.ReactNode;
  if (selNodes.length === 1 && selRegions.length === 0) {
    body = selNodes[0].kind === 'zone' ? <ZonePanel node={selNodes[0]} /> : <NodePanel node={selNodes[0]} />;
  } else if (selRegions.length === 1 && selNodes.length === 0) {
    body = <RegionPanel id={selRegions[0].id} />;
  } else if (selNodes.length + selRegions.length > 1) {
    body = <MultiPanel nodeIds={selNodes.map((n) => n.id)} regionIds={selRegions.map((r) => r.id)} />;
  } else if (selEdges.length > 0) {
    body = <EdgePanel id={selEdges[0]} count={selEdges.length} />;
  } else {
    body = (
      <div className="empty-insp">
        <p style={{ marginTop: 0 }}>Select a node to configure it.</p>
        <p>
          <kbd>V</kbd> move · <kbd>S</kbd> select · <kbd>W</kbd> wire · <kbd>U</kbd> upgrade · <kbd>X</kbd> bulldoze
          <br />
          Wire mode: drag from anywhere on a node to another — ports auto-match.
          <br />
          <kbd>S</kbd> then drag a box to select, then bulk-upgrade here.
        </p>
        <p>
          Watch the edges: a link turning red means the node behind it is saturating. Cache it, queue it, or scale it.
        </p>
      </div>
    );
  }

  return (
    <aside className={`inspector ${open ? '' : 'closed'}`}>
      <div className="panel-head">
        <span>Inspector</span>
        <span className="spacer" />
        <button className="ghost" onClick={toggle} aria-label={open ? 'Collapse inspector' : 'Expand inspector'}>
          {open ? '▸' : '◂'}
        </button>
      </div>
      {open && <div className="insp-scroll">{body}</div>}
    </aside>
  );
}

// ---------------------------------------------------------------------------

function LiveStats({ id, showHit }: { id: string; showHit: boolean }) {
  const live = useGame((s) => s.live.nodeStats[id]);
  if (!live) return null;
  return (
    <div className="insp-stats">
      <span>
        <span className="k">in</span>
        {fmtNum(live.inRps)} rps
      </span>
      <span>
        <span className="k">served</span>
        {fmtNum(live.served)} rps
      </span>
      <span>
        <span className="k">latency</span>
        {fmtNum(live.latencyMs)} ms
      </span>
      <span>
        <span className="k">queue</span>
        {live.queue}
      </span>
      <span style={{ color: rampColor(Math.min(1, live.util)) }}>
        <span className="k">util</span>
        {Math.round(live.util * 100)}%
      </span>
      <span>
        <span className="k">cost</span>${live.costRate.toFixed(2)}/s
      </span>
      {live.drops > 0.05 && (
        <span style={{ color: 'var(--bad)' }}>
          <span className="k">drops</span>
          {fmtNum(live.drops)}/s
        </span>
      )}
      {showHit && live.hitPct >= 0 && (
        <span>
          <span className="k">cache hit</span>
          {Math.round(live.hitPct * 100)}%
        </span>
      )}
    </div>
  );
}

function NodePanel({ node }: { node: PlacedNode }) {
  const s = useGame;
  const cash = useGame((st) => st.cash);
  const sandbox = useGame((st) => st.sandbox);
  const research = useGame((st) => st.research);
  const allTimeRev = useGame((st) => st.allTimeRev);
  const lifetimeRev = useGame((st) => st.lifetimeRev);
  const hasCicd = useGame((st) => st.nodes.some((n) => n.kind === 'cicd'));
  const spec = SPECS[node.kind as Exclude<typeof node.kind, 'zone'>];
  const cat = CATEGORY_INFO[spec.category];
  const isSource = spec.special === 'source';
  const upCost = upgradeCost(spec.cost, node.level, hasCicd ? BAL.cicdUpgradeDiscount : 1);
  const maxed = node.level >= BAL.maxLevel;
  const replacements = (REPLACE_MAP[node.kind] ?? []).filter((k) =>
    isKindUnlocked({ sandbox, research, allTimeRev, lifetimeRev }, k),
  );

  const mastery = useGame((st) => masteryTier(st.stats.servedByKind?.[spec.kind] ?? 0));

  return (
    <div>
      <div className="insp-title">
        <span className="node-logo" style={{ borderColor: cat.color }}>
          <BrandIcon kind={spec.kind} size={17} />
        </span>
        <h3>{node.label ?? spec.name}</h3>
        {!isSource && <span className="chip mono">L{node.level}</span>}
        {mastery > 0 && (
          <span className={`chip mastery-chip m${mastery}`} title={`${MASTERY_NAMES[mastery]} mastery: +${Math.round(BAL.masteryCapPerTier * mastery * 100)}% capacity for every ${spec.name}`}>
            {MASTERY_NAMES[mastery]}
          </span>
        )}
      </div>
      {!isSource && (
        <input
          type="text"
          className="insp-rename"
          placeholder={`name it (e.g. ${spec.short.toLowerCase()}-prod-1)`}
          value={node.label ?? ''}
          onChange={(e) => s.getState().setNodeLabel(node.id, e.target.value)}
          aria-label="Node name"
        />
      )}
      <p className="insp-blurb">{spec.blurb}</p>
      <p className="insp-learn">{NODE_LEARN[spec.kind]}</p>
      <a className="insp-docs" href={spec.docsUrl} target="_blank" rel="noopener noreferrer">
        Official {spec.name} docs ↗
      </a>
      <LiveStats id={node.id} showHit={Boolean(spec.hitRate)} />

      {!isSource && (
        <div className="insp-actions">
          {spec.capacity > 0 && (
            <button
              className="primary"
              disabled={maxed || (!sandbox && cash < upCost)}
              onClick={() => s.getState().upgradeNodes([node.id])}
              title={`Capacity ×${BAL.capPerLevel} per level`}
            >
              {maxed ? 'Max level' : `Upgrade → L${node.level + 1} · ${fmtMoney(upCost)}`}
            </button>
          )}
          {spec.capacity > 0 && !maxed && (
            <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
              capacity {fmtNum(spec.capacity * levelCapMult(node.level))} → {fmtNum(spec.capacity * levelCapMult(node.level + 1))} rps
            </div>
          )}
          {replacements.length > 0 && (
            <div className="row">
              {replacements.map((k) => (
                <button key={k} onClick={() => s.getState().replaceNode(node.id, k)} title={`Swap in place, keeping compatible wires. Net cost after salvage.`}>
                  → {SPECS[k].name}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <button onClick={() => s.getState().toggleNode(node.id)}>{node.disabled ? 'Power on' : 'Power off'}</button>
            <button onClick={() => s.getState().restartNode(node.id)} title="Restart to clear degraded health ($20)">
              Restart
            </button>
          </div>
          <button
            className="danger"
            onClick={() =>
              s.getState().requestConfirm({
                title: `Decommission ${spec.name}?`,
                body: `Salvage value: ${fmtMoney(Math.round(node.spent * BAL.refundRatio))}. Attached wires are removed too.`,
                danger: true,
                confirmLabel: 'Bulldoze',
                onYes: () => s.getState().removeNodes([node.id]),
              })
            }
          >
            Bulldoze
          </button>
        </div>
      )}
    </div>
  );
}

function ZonePanel({ node }: { node: PlacedNode }) {
  const s = useGame;
  const zone = node.zone!;
  const spec = specOf('zone', zone.template);
  const cat = CATEGORY_INFO[spec.category];
  const hasAuto = useGame((st) => zoneHasController(st, node.id, 'autoscaler'));
  const hasK8s = useGame((st) => zoneHasController(st, node.id, 'k8s'));
  const sandbox = useGame((st) => st.sandbox);
  const cash = useGame((st) => st.cash);
  const simTime = useGame((st) => st.simTime);
  const addCost = zoneSpawnCost(zone, 1);

  return (
    <div>
      <div className="insp-title">
        <span className="node-logo" style={{ borderColor: cat.color }}>
          <BrandIcon kind={zone.template} size={17} />
        </span>
        <h3>{zone.name}</h3>
        {hasAuto && <span className="chip">auto</span>}
      </div>
      <input
        type="text"
        className="insp-rename"
        value={zone.name}
        onChange={(e) => s.getState().patchZone(node.id, { name: e.target.value })}
        aria-label="Zone name"
      />
      <p className="insp-blurb">
        Declarative pool of {SPECS[zone.template].name}s. {hasAuto ? 'The autoscaler tracks target utilization within min/max.' : 'Wire an Autoscaler to the top control port for hands-off scaling.'}
        {hasK8s ? ' Kubernetes attached: self-healing, −20% run cost.' : ''}
      </p>
      <p className="insp-learn">
        This is an EC2 Auto Scaling Group in AWS terms: capacity as a policy, not a purchase. Real teams declare "keep
        this pool at 65% utilization, 1–20 instances" and let the control loop do the buying. {NODE_LEARN[zone.template]}
      </p>
      <a className="insp-docs" href={spec.docsUrl} target="_blank" rel="noopener noreferrer">
        Official {spec.name} docs ↗
      </a>
      <LiveStats id={node.id} showHit={false} />

      <div className="insp-actions">
        <div className="row">
          <button
            disabled={zone.instances >= zone.max || (!sandbox && cash < addCost)}
            onClick={() =>
              s.getState().patchZone(
                node.id,
                {
                  instances: zone.instances + 1,
                  bootQueue: [...zone.bootQueue.filter((b) => b > simTime), simTime + BAL.bootTimeSec],
                },
                { payFor: sandbox ? 0 : addCost },
              )
            }
          >
            + instance · {fmtMoney(addCost)}
          </button>
          <button
            disabled={zone.instances <= zone.min}
            onClick={() =>
              s.getState().patchZone(node.id, {
                instances: zone.instances - 1,
                bootQueue: zone.bootQueue.filter((b) => b > simTime).slice(0, -1),
              })
            }
          >
            − instance
          </button>
        </div>
      </div>

      <div className="insp-section">
        <h4>Scaling policy</h4>
        <div className="slider-row">
          <label>min</label>
          <input
            type="range"
            min={1}
            max={20}
            value={zone.min}
            onChange={(e) => s.getState().patchZone(node.id, { min: Math.min(+e.target.value, zone.max) })}
          />
          <span className="val">{zone.min}</span>
        </div>
        <div className="slider-row">
          <label>max</label>
          <input
            type="range"
            min={1}
            max={40}
            value={zone.max}
            onChange={(e) => s.getState().patchZone(node.id, { max: Math.max(+e.target.value, zone.min) })}
          />
          <span className="val">{zone.max}</span>
        </div>
        <div className="slider-row">
          <label>target util</label>
          <input
            type="range"
            min={30}
            max={90}
            value={Math.round(zone.targetUtil * 100)}
            onChange={(e) => s.getState().patchZone(node.id, { targetUtil: +e.target.value / 100 })}
          />
          <span className="val">{Math.round(zone.targetUtil * 100)}%</span>
        </div>
        <div className="slider-row">
          <label>instance size</label>
          <span className="val" style={{ width: 'auto' }}>
            L{node.level}
          </span>
          <button onClick={() => s.getState().upgradeNodes([node.id])} disabled={node.level >= BAL.maxLevel}>
            upsize · {fmtMoney(upgradeCost(spec.cost * 1.6, node.level))}
          </button>
        </div>
      </div>

      <div className="insp-actions" style={{ marginTop: 10 }}>
        <button
          className="danger"
          onClick={() =>
            s.getState().requestConfirm({
              title: `Tear down ${zone.name}?`,
              body: `All ${zone.instances} instance(s) are decommissioned. Salvage: ${fmtMoney(Math.round(node.spent * BAL.refundRatio))}.`,
              danger: true,
              confirmLabel: 'Tear down',
              onYes: () => s.getState().removeNodes([node.id]),
            })
          }
        >
          Tear down zone
        </button>
      </div>
    </div>
  );
}

const POLICY_INFO: { key: keyof RegionPolicies; name: string; desc: string }[] = [
  { key: 'aggressiveScale', name: 'Aggressive autoscaling', desc: 'Scale reactions 2× faster · +10% run cost in region' },
  { key: 'cacheTtl', name: 'Long cache TTLs', desc: '+8% cache hit rate for caches here · +5% run cost' },
  { key: 'rateLimit', name: 'Rate limiting', desc: 'Overload sheds as 429s (mild) instead of timeouts (brutal)' },
  { key: 'redundancy', name: 'N+1 redundancy', desc: 'Outages degrade this region instead of killing it · +25% run cost' },
];

function RegionPanel({ id }: { id: string }) {
  const s = useGame;
  const region = useGame((st) => st.regions.find((r) => r.id === id));
  if (!region) return null;
  return (
    <div>
      <div className="insp-title">
        <h3>⊕ {region.name}</h3>
      </div>
      <p className="insp-blurb">Policies apply to every node whose center sits inside this region.</p>
      <input
        type="text"
        value={region.name}
        onChange={(e) => s.getState().patchRegion(id, { name: e.target.value })}
        style={{ width: '100%', marginBottom: 10 }}
        aria-label="Region name"
      />
      <div className="insp-section" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
        <h4>Policies</h4>
        {POLICY_INFO.map((p) => (
          <label key={p.key} className="pol-row">
            <input
              type="checkbox"
              checked={region.policies[p.key]}
              onChange={(e) => s.getState().patchRegion(id, { policies: { ...region.policies, [p.key]: e.target.checked } })}
            />
            <span>
              {p.name}
              <small>{p.desc}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="insp-actions" style={{ marginTop: 10 }}>
        <button
          className="danger"
          onClick={() =>
            s.getState().requestConfirm({
              title: `Dissolve ${region.name}?`,
              body: 'Nodes inside are kept — only the region boundary and its policies are removed.',
              danger: true,
              confirmLabel: 'Dissolve',
              onYes: () => s.getState().removeRegion(id),
            })
          }
        >
          Dissolve region
        </button>
      </div>
    </div>
  );
}

function MultiPanel({ nodeIds, regionIds }: { nodeIds: string[]; regionIds: string[] }) {
  const s = useGame;
  const nodes = useGame((st) => st.nodes);
  const hasCicd = useGame((st) => st.nodes.some((n) => n.kind === 'cicd'));
  const sel = nodes.filter((n) => nodeIds.includes(n.id) && n.kind !== 'users');
  const upgradable = sel.filter((n) => n.level < BAL.maxLevel && specOf(n.kind, n.zone?.template).capacity > 0);
  const totalUp = upgradable.reduce(
    (acc, n) =>
      acc + upgradeCost(specOf(n.kind, n.zone?.template).cost * (n.kind === 'zone' ? 1.6 : 1), n.level, hasCicd ? BAL.cicdUpgradeDiscount : 1),
    0,
  );
  return (
    <div>
      <div className="insp-title">
        <h3>{nodeIds.length + regionIds.length} selected</h3>
      </div>
      <p className="insp-blurb">
        {sel.length} node(s){regionIds.length > 0 ? `, ${regionIds.length} region(s)` : ''} — bulk operations apply to all of them.
      </p>
      <div className="insp-actions">
        <button className="primary" disabled={upgradable.length === 0} onClick={() => s.getState().upgradeNodes(upgradable.map((n) => n.id))}>
          Upgrade all ({upgradable.length}) · {fmtMoney(totalUp)}
        </button>
        <button
          onClick={() => s.getState().saveBlueprintFromSelection('')}
          title="Save this selection as a reusable Terraform-style module"
        >
          Save as blueprint
        </button>
        <button
          className="danger"
          onClick={() =>
            s.getState().requestConfirm({
              title: `Bulldoze ${sel.length + regionIds.length} item(s)?`,
              body: `Salvage value: ${fmtMoney(Math.round(sel.reduce((a, n) => a + n.spent, 0) * BAL.refundRatio))}.`,
              danger: true,
              confirmLabel: 'Bulldoze all',
              onYes: () => {
                s.getState().removeNodes(sel.map((n) => n.id));
                regionIds.forEach((r) => s.getState().removeRegion(r));
              },
            })
          }
        >
          Bulldoze all
        </button>
      </div>
    </div>
  );
}

function EdgePanel({ id, count }: { id: string; count: number }) {
  const s = useGame;
  const live = useGame((st) => st.live.edgeStats[id]);
  return (
    <div>
      <div className="insp-title">
        <h3>{count > 1 ? `${count} connections` : 'Connection'}</h3>
      </div>
      {live && (
        <div className="insp-stats">
          <span>
            <span className="k">flow</span>
            {fmtNum(live.rps)} rps
          </span>
          <span style={{ color: rampColor(Math.min(1, live.util)) }}>
            <span className="k">downstream util</span>
            {Math.round(live.util * 100)}%
          </span>
        </div>
      )}
      <div className="insp-actions">
        <button className="danger" onClick={() => s.getState().removeEdges(s.getState().selEdges)}>
          Disconnect {count > 1 ? 'all' : ''}
        </button>
        <div style={{ fontSize: 10, color: 'var(--faint)' }}>Removed connections can be restored from the toast (or Cmd+Z).</div>
      </div>
    </div>
  );
}
