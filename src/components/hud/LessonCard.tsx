import { useEffect } from 'react';
import { LESSONS, lessonById } from '../../game/catalog/lessons';
import { useGame } from '../../game/state/store';

// A "field note": fires the first time the player experiences a real
// engineering phenomenon and explains the concept behind it. Re-readable
// later from the Field Manual (help). Enter or click dismisses.

export default function LessonCard() {
  const activeLesson = useGame((s) => s.activeLesson);
  const seen = useGame((s) => s.lessonsSeen);
  const queued = useGame((s) => s.lessonQueue.length);
  const dismiss = useGame((s) => s.dismissLesson);

  useEffect(() => {
    if (!activeLesson) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeLesson, dismiss]);

  if (!activeLesson) return null;
  const lesson = lessonById.get(activeLesson);
  if (!lesson) return null;

  return (
    <div className="lesson-card" role="note" aria-label={`Field note: ${lesson.title}`}>
      <div className="lesson-head">
        <span className="lesson-icon">✎</span>
        <span className="lesson-kicker">field note {seen.length + 1}/{LESSONS.length}</span>
        <span className="lesson-tag">{lesson.tag}</span>
      </div>
      <h3>{lesson.title}</h3>
      <p>{lesson.body}</p>
      <div className="lesson-foot">
        <span className="lesson-more">{queued > 0 ? `${queued} more queued` : 'collected in the Field Manual (?)'}</span>
        <button className="primary" onClick={dismiss}>
          Noted <kbd style={{ marginLeft: 4 }}>↵</kbd>
        </button>
      </div>
    </div>
  );
}
