import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GATES } from '../logic.js';
import { GateIcon } from '../glyphs.jsx';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { REPLACEABLE, TYPES, partName } from '../parts.js';
import { kbd, row } from '../ui.js';
import { WireIcon } from '../wireIcons.jsx';

export default function CommandPalette({ gate, onReplace, onClose, onAdd, onFormat, onNew, onClear, onCopy, onSidebar }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const dialog = useRef(null);
  const opener = useRef(document.activeElement);
  const list = useRef(null);
  const v = q.trim().toLowerCase();
  const hit = (name, extra = '') => !v || name.toLowerCase().includes(v) || extra.toLowerCase().includes(v);
  const parts = TYPES.filter((ty) => hit(partName(t, ty), ty)).map((ty) => ({ key: ty, name: partName(t, ty), icon: <GateIcon type={ty} />, kbd: GATES[ty].key, run: () => onAdd(ty) }));
  const swaps = REPLACEABLE.includes(gate)
    ? REPLACEABLE.filter((ty) => ty !== gate && hit(t('cmd.replace', { name: partName(t, ty) }), `${ty} replace`))
      .map((ty) => ({ key: `swap-${ty}`, name: t('cmd.replace', { name: partName(t, ty) }), icon: <GateIcon type={ty} />, run: () => onReplace(ty) }))
    : [];
  const glyph = (name) => <span className="grid h-[18px] w-[30px] place-items-center text-gate"><Icon name={name} /></span>;
  const actions = [
    { key: 'format', name: t('fmt.label'), extra: 'format', icon: glyph('format'), kbd: '⇧F', run: onFormat },
    ...['square', 'curved'].map((k) => ({ key: `wire-${k}`, name: t(`wire.${k}`), extra: 'wire', icon: <span className="grid h-[18px] w-[30px] place-items-center text-gate"><WireIcon style={k} /></span>, run: () => { dispatchEvent(new CustomEvent('lg:wires', { detail: k })); onClose(); } })),
    { key: 'new', name: t('cs.new'), icon: glyph('plus'), run: onNew },
    { key: 'clear', name: t('cmd.clear'), icon: glyph('eraser'), run: onClear },
    { key: 'sidebar', name: t('sb.toggle'), icon: glyph('sidebar'), run: onSidebar },
    { key: 'copy', name: t('cmd.copy'), icon: glyph('copy'), run: onCopy },
  ].filter((a) => hit(a.name, a.extra));
  const items = [...parts, ...swaps, ...actions];
  const idx = Math.min(act, Math.max(items.length - 1, 0));

  useLayoutEffect(() => {
    const modal = dialog.current;
    modal.showModal();
    return () => {
      modal.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, []);

  // Keep the arrow-key row in view inside the scrolling list.
  useEffect(() => { list.current?.querySelector('.cmd-row.act')?.scrollIntoView({ block: 'nearest' }); }, [act, q]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((idx + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((idx - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); items[idx].run(); }
  };

  return (
    <dialog ref={dialog} className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none items-start justify-center border-0 bg-scrim p-0 [padding-block-start:min(140px,10dvh)] text-ink open:flex backdrop:bg-transparent" aria-label={t('cmd.label')} onCancel={(e) => { e.preventDefault(); onClose(); }} onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } }}>
      <div className="w-[560px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[14px] bg-raised shadow-pop">
        <div className="flex h-[52px] items-center gap-2.5 border-b border-line px-4 text-muted">
          <Icon name="search" />
          <input
            autoFocus
            className="h-full flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
            placeholder={t('cmd.placeholder')}
            value={q}
            autoComplete="off"
            onChange={(e) => { setQ(e.target.value); setAct(0); }}
            onKeyDown={onKey}
          />
        </div>
        <div ref={list} className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain p-1.5">
          {items.length ? (
            [[parts, 'cmd.heading', 0], [swaps, 'cmd.replaceHeading', parts.length], [actions, 'cmd.actions', parts.length + swaps.length]].map(([list, head, off]) => list.length > 0 && (
              <div key={head}>
                <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-muted">{t(head)}</div>
                {list.map((it, i) => (
                  <button key={it.key} className={`${row} cmd-row${off + i === idx ? ' act' : ''}`} onMouseEnter={() => setAct(off + i)} onClick={it.run}>
                    {it.icon}<span className="flex-1 font-medium">{it.name}</span>{it.kbd && <kbd className={kbd}>{it.kbd}</kbd>}
                  </button>
                ))}
              </div>
            ))
          ) : <div className="px-2.5 py-4 text-[11px] font-medium text-muted">{t('cmd.none', { q })}</div>}
        </div>
        <div className="flex h-10 items-center gap-4 border-t border-line px-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><kbd className={kbd}>↵</kbd>{t('cmd.add')}</span>
          <span className="flex items-center gap-1.5"><kbd className={kbd}>↑</kbd><kbd className={kbd}>↓</kbd>{t('cmd.nav')}</span>
          <span className="ml-auto flex items-center gap-1.5"><kbd className={kbd}>esc</kbd>{t('cmd.close')}</span>
        </div>
      </div>
    </dialog>
  );
}
