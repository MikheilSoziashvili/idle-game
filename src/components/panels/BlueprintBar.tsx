import { useMemo, useState } from 'react';
import { STARTER_BLUEPRINTS } from '../../game/catalog/blueprints';
import { specOf } from '../../game/catalog/nodes';
import { BAL, fmtMoney, totalSpentAtLevel } from '../../game/engine/balance';
import type { Blueprint } from '../../game/engine/types';
import { exportBlueprintCode, importBlueprintCode } from '../../game/state/save';
import { isKindUnlocked, unlockedTools, useGame } from '../../game/state/store';

async function copyCode(bp: Blueprint) {
  const code = exportBlueprintCode(bp);
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    useGame.getState().addToast('ok', `Code copied: ${bp.name}`, 'Paste it to anyone — they import it right here.');
  } catch {
    window.prompt('Copy this blueprint code:', code);
  }
}

function bpCost(bp: Blueprint): number {
  return bp.nodes.reduce((acc, bn) => {
    const spec = specOf(bn.kind, bn.zone?.template);
    return acc + (bn.kind === 'zone' ? Math.round(spec.cost * BAL.zoneSpawnDiscount) : totalSpentAtLevel(spec.cost, bn.level));
  }, 0);
}

export default function BlueprintBar() {
  const userBps = useGame((s) => s.blueprints);
  const pending = useGame((s) => s.pendingBlueprint);
  const setPending = useGame((s) => s.setPendingBlueprint);
  const selection = useGame((s) => s.selection);
  const sandbox = useGame((s) => s.sandbox);
  const research = useGame((s) => s.research);
  const allTimeRev = useGame((s) => s.allTimeRev);
  const lifetimeRev = useGame((s) => s.lifetimeRev);
  const milestones = useGame((s) => s.milestones);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStr, setImportStr] = useState('');

  const stampUnlocked = unlockedTools({ sandbox, research, milestones }).includes('stamp');
  const unlockState = { sandbox, research, allTimeRev, lifetimeRev };

  const all = useMemo(() => {
    const starters = STARTER_BLUEPRINTS.filter((bp) =>
      bp.nodes.every((bn) => isKindUnlocked(unlockState, bn.kind === 'zone' ? (bn.zone?.template ?? 'app') : bn.kind)),
    );
    return [...starters, ...userBps];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBps, sandbox, research, allTimeRev, lifetimeRev]);

  if (!stampUnlocked || (all.length === 0 && selection.length === 0)) return null;

  return (
    <div className="bp-bar" role="toolbar" aria-label="Blueprints">
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--faint)', letterSpacing: '0.08em' }}>TF</span>
      {all.map((bp) => (
        <span
          key={bp.id}
          className={`bp-chip ${pending === bp.id ? 'armed' : ''}`}
          onClick={() => setPending(pending === bp.id ? null : bp.id)}
          title={`${bp.nodes.length} resources · ${fmtMoney(bpCost(bp))} — click, then click the canvas to stamp (Esc to stop)`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setPending(pending === bp.id ? null : bp.id)}
        >
          {bp.name}
          <small style={{ color: 'var(--faint)' }}>{fmtMoney(bpCost(bp))}</small>
          {!bp.builtin && (
            <>
              <span
                className="bp-x"
                title="Copy share code (UPBP1.…)"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyCode(bp);
                }}
              >
                ⧉
              </span>
              <span
                className="bp-x"
                title="Delete blueprint"
                onClick={(e) => {
                  e.stopPropagation();
                  useGame.getState().removeBlueprint(bp.id);
                }}
              >
                ✕
              </span>
            </>
          )}
        </span>
      ))}
      {importing ? (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <input
            type="text"
            autoFocus
            placeholder="UPBP1.…"
            value={importStr}
            onChange={(e) => setImportStr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (importBlueprintCode(importStr)) {
                  setImporting(false);
                  setImportStr('');
                } else {
                  useGame.getState().addToast('warn', 'Import failed', 'Not a valid blueprint code.');
                }
              }
              if (e.key === 'Escape') setImporting(false);
            }}
            style={{ width: 150 }}
          />
          <button
            onClick={() => {
              if (importBlueprintCode(importStr)) {
                setImporting(false);
                setImportStr('');
              } else {
                useGame.getState().addToast('warn', 'Import failed', 'Not a valid blueprint code.');
              }
            }}
          >
            import
          </button>
        </span>
      ) : (
        <button onClick={() => setImporting(true)} title="Paste a UPBP1. code from another player">
          ⤓ import
        </button>
      )}
      {selection.length > 0 &&
        (naming ? (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <input
              type="text"
              autoFocus
              placeholder={`module.custom_${userBps.length + 1}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  useGame.getState().saveBlueprintFromSelection(name.trim());
                  setNaming(false);
                  setName('');
                }
                if (e.key === 'Escape') setNaming(false);
              }}
              style={{ width: 150 }}
            />
            <button
              className="primary"
              onClick={() => {
                useGame.getState().saveBlueprintFromSelection(name.trim());
                setNaming(false);
                setName('');
              }}
            >
              save
            </button>
          </span>
        ) : (
          <button onClick={() => setNaming(true)} title="Save the selected nodes as a reusable module">
            + save selection ({selection.length})
          </button>
        ))}
    </div>
  );
}
