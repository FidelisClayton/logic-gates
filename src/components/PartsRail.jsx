import { useRef, useState } from 'react';
import { GATES } from '../logic.js';
import { GateIcon } from '../glyphs.jsx';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { ORDER, partName } from '../parts.js';
import { kbd, row } from '../ui.js';

export default function PartsRail({ collapsed, fixed, onCollapse, onAdd, onDrop, onSearch }) {
  const { t } = useI18n();
  const drag = useRef(null);
  const [ghost, setGhost] = useState(null);
  const rowCls = `${row} touch-none ${collapsed ? 'justify-center px-0!' : ''}`;

  const down = (e, type) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { type, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6)) return;
    d.moved = true;
    setGhost({ type: d.type, x: e.clientX, y: e.clientY });
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d || e.type === 'pointercancel') return;
    if (d.moved) onDrop(d.type, e.clientX, e.clientY);
    else onAdd(d.type);
  };

  return (
    <nav className="flex min-w-0 flex-col gap-0.5 overflow-hidden border-r border-line px-2 py-3 pointer-coarse:px-1" aria-label={t('rail.label')}>
      <button className={`relative mb-2.5 flex h-8 pointer-coarse:h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-line px-2.5 text-muted after:absolute after:-inset-x-0 after:-inset-y-1.5 after:content-[""] hover:border-line2 hover:text-ink ${collapsed ? 'justify-center px-0!' : ''}`} onClick={onSearch} aria-label={t('rail.add')}>
        <Icon name="search" />{!collapsed && <><span>{t('rail.add')}</span><kbd className={`${kbd} ml-auto`}>⌘K</kbd></>}
      </button>
      {ORDER.map((type, i) => type ? (
        <button
          key={type}
          className={rowCls}
          aria-label={t('rail.addPart', { name: partName(t, type) })}
          title={collapsed ? partName(t, type) : undefined}
          onPointerDown={(e) => down(e, type)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onClick={(e) => e.detail === 0 && onAdd(type)}
        >
          <GateIcon type={type} />
          {!collapsed && <><span className="flex-1 overflow-hidden font-medium">{partName(t, type)}</span><kbd className={kbd}>{GATES[type].key}</kbd></>}
        </button>
      ) : <div key={`g${i}`} className="h-2.5" />)}
      {!fixed && <div className="mt-auto">
        <button className={`${row} h-9 text-muted ${collapsed ? 'justify-center px-0!' : ''}`} onClick={onCollapse} aria-label={collapsed ? t('rail.expand') : t('rail.collapse')}>
          <Icon name={collapsed ? 'right' : 'left'} />{!collapsed && <span className="flex-1 font-medium">{t('rail.collapse')}</span>}
        </button>
      </div>}
      {ghost && (
        <div className="pointer-events-none fixed z-40 rounded-lg bg-raised px-2.5 py-2 opacity-90 shadow-pop" style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%,-50%)' }}>
          <GateIcon type={ghost.type} />
        </div>
      )}
    </nav>
  );
}
