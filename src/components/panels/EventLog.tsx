import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/state/store';

function fmtT(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const TAGS: Record<string, string> = {
  info: 'INFO',
  ok: 'OK',
  warn: 'WARN',
  err: 'CRIT',
  deploy: 'DEPLOY',
  scale: 'SCALE',
};

export default function EventLog() {
  const logs = useGame((s) => s.logs);
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className={`console ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-head" style={{ cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
        <span>ops console</span>
        <span className="spacer" />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>
          {logs.length > 0 ? `${logs.length} events` : 'quiet'}
        </span>
        <span>{collapsed ? '▴' : '▾'}</span>
      </div>
      <div
        className="console-body"
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {logs.length === 0 && <div style={{ color: 'var(--faint)' }}>— no events yet. Wire the Internet to a server. —</div>}
        {logs.map((l) => (
          <div key={l.id} className={`log-line log-${l.sev}`}>
            <span className="log-t">{fmtT(l.t)}</span>
            <span className="log-tag">{TAGS[l.sev]}</span>
            <span className="log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
