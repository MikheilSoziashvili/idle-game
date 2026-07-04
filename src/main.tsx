import { createRoot } from 'react-dom/client';
import App from './App';
import { useGame } from './game/state/store';
import * as save from './game/state/save';
import './styles/global.css';
import './styles/canvas.css';
import './styles/panels.css';

// Dev/debug handle: poke the game from the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __uptime: typeof useGame }).__uptime = useGame;
  (window as unknown as { __uptimeSave: typeof save }).__uptimeSave = save;
}

// No StrictMode on purpose: the game engine is a singleton driving a real-time
// loop, and double-invoked effects would double-boot it in dev.
createRoot(document.getElementById('root')!).render(<App />);
