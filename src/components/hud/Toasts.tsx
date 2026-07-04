import { useGame } from '../../game/state/store';

export default function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast t-${t.kind}`} onClick={() => dismiss(t.id)} role="status">
          <b>
            {t.kind === 'achievement' ? '★ ' : t.kind === 'milestone' ? '✓ ' : ''}
            {t.title}
          </b>
          {t.body && <small>{t.body}</small>}
        </div>
      ))}
    </div>
  );
}
