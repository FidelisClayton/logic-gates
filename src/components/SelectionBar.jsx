import { useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { GateIcon } from '../glyphs.jsx';
import { REPLACEABLE, partName } from '../parts.js';
import { btn, kbd, row } from '../ui.js';
import { PHONE, useMedia } from '../useMedia.js';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const cell = `${btn} relative min-w-0 gap-2 pointer-coarse:px-3 border-transparent after:absolute after:-inset-x-0.5 after:-inset-y-2 after:content-[""]`;

export default function SelectionBar({ x, y, type, onDuplicate, onReplace, onDelete }) {
  const { t } = useI18n();
  const bar = useRef(null);
  const [open, setOpen] = useState(false);
  // On phones the bar docks to the bottom of the canvas (just above the truth-table peek) instead of floating by the node.
  const docked = useMedia(PHONE);
  // below 480px the label sits under the icon so longer words (Remplacer, Duplizieren) fit three across
  const dock = docked ? 'min-w-0 flex-1 justify-center px-1.5! max-[479px]:h-auto! max-[479px]:min-h-11 max-[479px]:flex-col max-[479px]:gap-0.5 max-[479px]:py-1 max-[479px]:text-[11px]' : '';
  // The anchor is clamped for a typical bar width; wider labels (German, French) need the real width to stay inside the canvas.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || docked) return;
    const half = el.offsetWidth / 2 + 4;
    el.style.left = `${Math.max(half, Math.min(x, el.parentElement.clientWidth - half))}px`;
  });
  return (
    <div
      className={docked ? 'absolute inset-x-0 bottom-0 z-10 flex items-center justify-around gap-0.5 border-t border-line bg-raised p-1' : 'absolute z-10 flex items-center gap-0.5 rounded-[10px] bg-raised p-1 shadow-pop'}
      style={docked ? undefined : { left: x, top: y, transform: 'translate(-50%,-100%)' }}
      role="toolbar"
      ref={bar}
    >
      {onDuplicate && (
        <>
          <button className={`${cell} ${dock}`} onClick={onDuplicate}><Icon name="copy" /><span className="truncate">{t('sel.duplicate')}</span><kbd className={kbd}>⌘D</kbd></button>
          <i className="h-4 w-px bg-line" />
        </>
      )}
      {onReplace && (
        <>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild><button className={`${cell} ${dock}`} aria-haspopup="menu"><Icon name="swap" /><span className="truncate">{t('sel.replace')}</span></button></PopoverTrigger>
            {/* stays inside the canvas ([data-clip]) and flips above the trigger near its bottom edge */}
            <PopoverContent align="start" className="max-h-[var(--radix-popover-content-available-height)] w-[220px] overflow-y-auto overscroll-contain" avoidCollisions collisionBoundary={bar.current?.closest('[data-clip]') ?? undefined}>
              <div role="menu" aria-label={t('sel.replaceLabel')} className="flex flex-col gap-0.5 -m-1.5">
                {REPLACEABLE.map((ty) => (
                  <PopoverClose key={ty} asChild>
                    <button role="menuitemradio" aria-checked={ty === type} className={row} onClick={() => onReplace(ty)}>
                      <GateIcon type={ty} /><span className="flex-1 font-medium">{partName(t, ty)}</span>{ty === type && <Icon name="check" />}
                    </button>
                  </PopoverClose>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <i className="h-4 w-px bg-line" />
        </>
      )}
      <button className={`${cell} ${dock} text-danger`} onClick={onDelete}><Icon name="trash" /><span className="truncate">{t('sel.delete')}</span><kbd className={kbd}>⌫</kbd></button>
    </div>
  );
}
