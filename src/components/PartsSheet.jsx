import { useEffect, useRef } from 'react';
import { GateIcon } from '../glyphs.jsx';
import { useI18n } from '../I18n.jsx';
import { TYPES, partName } from '../parts.js';
import { iconBtn } from '../ui.js';

// Modal sheet for phones: tap a part to place it at the visible centre of the canvas.
export default function PartsSheet({ onPick, onClose }) {
  const { t } = useI18n();
  const first = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    first.current?.focus();
    const on = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') { // keep focus inside the sheet
        const f = [...document.querySelectorAll('[data-parts-sheet] button')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    addEventListener('keydown', on, true);
    return () => { removeEventListener('keydown', on, true); prev?.focus?.(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-scrim" onPointerDown={onClose} />
      <div
        data-parts-sheet role="dialog" aria-modal="true" aria-label={t('rail.add')}
        className="parts-sheet absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-[14px] bg-bg px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] shadow-pop"
      >
        <div className="flex h-12 items-center justify-between pl-1">
          <b className="font-semibold">{t('rail.add')}</b>
          <button className={iconBtn} aria-label={t('cmd.close')} onClick={onClose}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((type, i) => (
            <button
              key={type}
              ref={i === 0 ? first : undefined}
              className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-line px-1.5 py-2 text-center text-xs font-medium hover:bg-hover active:bg-line"
              aria-label={t('rail.addPart', { name: partName(t, type) })}
              onClick={() => onPick(type)}
            >
              <GateIcon type={type} /><span className="text-balance">{partName(t, type)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
