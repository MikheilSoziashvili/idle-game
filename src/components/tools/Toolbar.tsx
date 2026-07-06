import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Tool } from '../../game/engine/types';
import { unlockedTools, useGame } from '../../game/state/store';
import { zoneUnitKinds } from '../../game/systems/zoning';
import { downloadArchitectureSvg } from '../../game/systems/photo';
import { downloadArchitectureMd } from '../../game/systems/docgen';
import { SPECS } from '../../game/catalog/nodes';

const TOOLS: { id: Tool; icon: string; key: string; name: string; desc: string }[] = [
  { id: 'move', icon: '✥', key: 'V', name: 'Move', desc: 'Drag nodes · Shift+drag to box-select' },
  { id: 'select', icon: '⬚', key: 'S', name: 'Select', desc: 'Drag a box to select · click to select · Shift adds' },
  { id: 'wire', icon: '↦', key: 'W', name: 'Wire', desc: 'Drag node→node (ports auto-match) · click a wire to remove it' },
  { id: 'zone', icon: '▦', key: 'Z', name: 'Zone', desc: 'Paint a self-scaling capacity pool' },
  { id: 'region', icon: '⊕', key: 'R', name: 'Region', desc: 'Paint a region & apply policies' },
  { id: 'stamp', icon: '⌗', key: 'B', name: 'Stamp', desc: 'Place a saved blueprint' },
  { id: 'upgrade', icon: '▲', key: 'U', name: 'Upgrade', desc: 'Click a node to upgrade in place' },
  { id: 'bulldoze', icon: '✕', key: 'X', name: 'Bulldoze', desc: 'Remove nodes & wires (50% salvage)' },
];

const LOCK_HINT: Partial<Record<Tool, string>> = {
  zone: 'Research: Autoscaling',
  region: 'Objective: launch a 2nd product tier',
  stamp: 'Objective: launch a 2nd product tier',
};

export default function Toolbar() {
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const unlocked = useGame(useShallow(unlockedTools));
  const requestFit = useGame((s) => s.requestFit);
  const autoLayout = useGame((s) => s.autoLayoutNow);
  const pendingZoneTemplate = useGame((s) => s.pendingZoneTemplate);
  const setPendingZoneTemplate = useGame((s) => s.setPendingZoneTemplate);
  const zoneKinds = useGame(useShallow(zoneUnitKinds));
  const tutorialStep = useGame((s) => s.tutorialStep);

  useEffect(() => {
    if (tool === 'zone' && !pendingZoneTemplate && zoneKinds.length > 0) {
      setPendingZoneTemplate(zoneKinds[0]);
    }
  }, [tool, pendingZoneTemplate, zoneKinds, setPendingZoneTemplate]);

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Build tools">
        {TOOLS.map((t) => {
          const locked = !unlocked.includes(t.id);
          const tutPulse = (tutorialStep === 2 && t.id === 'wire') || (tutorialStep === 4 && t.id === 'upgrade');
          return (
            <button
              key={t.id}
              className={`tool-btn ${tool === t.id ? 'active' : ''} ${locked ? 'locked' : ''} ${tutPulse ? 'tut-pulse' : ''}`}
              onClick={() => !locked && setTool(t.id)}
              aria-label={t.name}
              aria-pressed={tool === t.id}
            >
              {t.icon}
              <span className="key">{t.key}</span>
              <span className="tool-tip">
                {t.name} <kbd>{t.key}</kbd>
                <small>{locked ? `Locked — ${LOCK_HINT[t.id] ?? ''}` : t.desc}</small>
              </span>
            </button>
          );
        })}
        <div style={{ height: 1, background: 'var(--line)', margin: '3px 2px' }} />
        <button className="tool-btn" onClick={requestFit} aria-label="Fit view">
          ⤢<span className="key">F</span>
          <span className="tool-tip">
            Fit view <kbd>F</kbd>
          </span>
        </button>
        <button className="tool-btn" onClick={autoLayout} aria-label="Auto-layout">
          ⌘<span className="key">L</span>
          <span className="tool-tip">
            Auto-layout <kbd>L</kbd>
            <small>Tidy the diagram left→right</small>
          </span>
        </button>
        <button
          className="tool-btn"
          onClick={() => {
            const ok = downloadArchitectureSvg(useGame.getState());
            useGame.getState().addToast(ok ? 'ok' : 'warn', ok ? 'Architecture exported' : 'Nothing to export', ok ? 'Saved as SVG — a clean, shareable diagram.' : 'Place some infrastructure first.');
          }}
          aria-label="Export architecture diagram"
        >
          ⎙
          <span className="tool-tip">
            Photo mode
            <small>Export the graph as a clean SVG architecture diagram</small>
          </span>
        </button>
        <button
          className="tool-btn"
          onClick={() => {
            const ok = downloadArchitectureMd(useGame.getState());
            useGame.getState().addToast(
              ok ? 'ok' : 'warn',
              ok ? 'Design doc exported' : 'Nothing to document',
              ok ? 'Markdown design doc: components, flows, SLOs, risks.' : 'Place some infrastructure first.',
            );
          }}
          aria-label="Export design doc (Markdown)"
        >
          ¶
          <span className="tool-tip">
            Design doc
            <small>Export a Markdown design doc — components, traffic flows, SLOs, risks & incident history</small>
          </span>
        </button>
      </div>

      {tool === 'zone' && (
        <div className="zone-template-row">
          <span>pool of:</span>
          {zoneKinds.map((k) => (
            <button
              key={k}
              className={pendingZoneTemplate === k ? 'primary' : ''}
              onClick={() => setPendingZoneTemplate(k)}
            >
              {SPECS[k].name}
            </button>
          ))}
          <span style={{ color: 'var(--faint)' }}>then drag on the canvas</span>
        </div>
      )}
    </>
  );
}
