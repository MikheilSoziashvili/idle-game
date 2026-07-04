import { useEffect, useRef } from 'react';
import FlowCanvas from './components/canvas/FlowCanvas';
import Dashboard from './components/panels/Dashboard';
import NodePalette from './components/panels/NodePalette';
import Inspector from './components/panels/Inspector';
import EventLog from './components/panels/EventLog';
import BlueprintBar from './components/panels/BlueprintBar';
import Toolbar from './components/tools/Toolbar';
import OverlaySwitcher from './components/tools/OverlaySwitcher';
import Objectives from './components/hud/Objectives';
import Toasts from './components/hud/Toasts';
import Modals from './components/hud/Modals';
import LessonCard from './components/hud/LessonCard';
import CaseHud from './components/hud/CaseHud';
import { unlockedTools, useGame } from './game/state/store';
import { tryLoad, saveNow } from './game/state/save';
import { startEngine } from './game/engine/simulation';
import { fmtMoney } from './game/engine/balance';
import type { Tool } from './game/engine/types';

const TOOL_KEYS: Record<string, Tool> = {
  v: 'move',
  w: 'wire',
  z: 'zone',
  r: 'region',
  b: 'stamp',
  u: 'upgrade',
  x: 'bulldoze',
};

export default function App() {
  const prevSpeed = useRef<1 | 2 | 4>(1);

  // ---- boot: load save (or greet), then start the engine ----
  useEffect(() => {
    const w = window as unknown as { __uptimeBooted?: boolean };
    if (!w.__uptimeBooted) {
      w.__uptimeBooted = true;
      const res = tryLoad();
      const s = useGame.getState();
      if (res.loaded) {
        if (res.offlineEarnings > 0) {
          const hrs = res.awaySec / 3600;
          s.addToast(
            'ok',
            'While you were away',
            `${hrs >= 1 ? `${hrs.toFixed(1)}h` : `${Math.round(res.awaySec / 60)}min`} of traffic served itself: +${fmtMoney(res.offlineEarnings)} (50% efficiency, capped at 8h).`,
          );
        } else {
          s.addToast('info', 'Welcome back', 'State restored from autosave.');
        }
      } else {
        s.addToast(
          'info',
          'You are the platform team now',
          'Drag an Nginx from the palette onto the canvas, then wire the Internet to it.',
        );
      }
    }
    startEngine(useGame);
  }, []);

  // ---- global keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGame.getState();
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if (typing) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        s.undoRemoveEdges();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
        s.addToast('ok', 'Saved');
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (s.modal || s.confirm) return; // modals own the keyboard (Esc handled there)

      const k = e.key.toLowerCase();
      if (TOOL_KEYS[k]) {
        if (unlockedTools(s).includes(TOOL_KEYS[k])) s.setTool(TOOL_KEYS[k]);
        return;
      }
      switch (k) {
        case ' ':
          e.preventDefault();
          if (s.speed === 0) s.setSpeed(prevSpeed.current);
          else {
            prevSpeed.current = s.speed as 1 | 2 | 4;
            s.setSpeed(0);
          }
          break;
        case '1':
          s.setSpeed(1);
          break;
        case '2':
          s.setSpeed(2);
          break;
        case '3':
          s.setSpeed(4);
          break;
        case 'f':
          s.requestFit();
          break;
        case 'l':
          s.autoLayoutNow();
          break;
        case '?':
          s.openModal('help');
          break;
        case 'escape':
          if (s.pendingBlueprint) s.setPendingBlueprint(null);
          else if (s.tool !== 'move') s.setTool('move');
          else s.setSelection([], []);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <Dashboard />
      <main className="app-main">
        <FlowCanvas />
        <Toolbar />
        <Objectives />
        <CaseHud />
        <NodePalette />
        <Inspector />
        <OverlaySwitcher />
        <EventLog />
        <BlueprintBar />
        <LessonCard />
        <Toasts />
        <Modals />
      </main>
    </div>
  );
}
