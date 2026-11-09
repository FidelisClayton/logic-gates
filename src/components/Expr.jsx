import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { exprTooLarge, needsParens } from '../notation.js';
import { useI18n } from '../I18n.jsx';

const SIZE = { lg: 'text-[22px]', md: 'text-[15px]', sm: 'text-[12.5px]' };
const OP = { and: ' · ', or: ' + ', xor: ' ⊕ ' };
// Nested overlines each add a border and 2px of padding, so they stack with a small gap.
const OVER = 'inline-block border-t-[1.5px] border-current pt-[2px] leading-[1.1]';
const HOLE = 'inline-block h-[0.95em] w-[0.8em] rounded-[3px] border border-dashed border-faint align-[-0.12em]';

function Node({ e, parent, hl, onHover }) {
  let body;
  if (e.t === 'var') body = e.name;
  else if (e.t === 'hole') body = <span className={HOLE} role="img" aria-label="?" />;
  else if (e.t === 'not') body = <span className={OVER}><Node e={e.a} hl={hl} onHover={onHover} /></span>;
  else {
    body = e.args.map((c, i) => (
      <span key={i}>
        {i > 0 && <span className="text-muted">{OP[e.t]}</span>}
        <Node e={c} parent={e.t} hl={hl} onHover={onHover} />
      </span>
    ));
  }
  if (parent && needsParens(parent, e)) body = <>({body})</>;
  if (!e.src) return body;
  return (
    <span
      data-src={e.src}
      tabIndex={onHover ? 0 : undefined}
      onPointerOver={onHover && ((ev) => { ev.stopPropagation(); if (ev.pointerType === 'mouse') onHover(e.src); })}
      onFocus={onHover && ((ev) => { ev.stopPropagation(); if (ev.currentTarget.matches(':focus-visible')) onHover(e.src); })}
      className={cn('rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-sig', hl === e.src && 'bg-sigsoft')}
    >
      {body}
    </span>
  );
}

export default function Expr({ expr, size = 'md', hl = null, onHover }) {
  const { t } = useI18n();
  const pointerType = useRef(null);
  return (
    <span
      className={cn('inline-block pt-1 font-medium tabular-nums', SIZE[size])}
      onPointerDown={onHover && ((ev) => { pointerType.current = ev.pointerType; })}
      onClick={onHover && ((ev) => {
        ev.stopPropagation();
        const type = pointerType.current;
        pointerType.current = null;
        const src = ev.target.closest('[data-src]')?.dataset.src;
        if (src && ev.detail !== 0 && ['touch', 'pen'].includes(type)) onHover(hl === src ? null : src);
      })}
      onPointerLeave={onHover && ((ev) => { if (ev.pointerType === 'mouse') onHover(null); })}
      onBlur={onHover && (() => onHover(null))}
    >
      {exprTooLarge(expr) ? t('nt.tooLarge') : <Node e={expr} hl={hl} onHover={onHover} />}
    </span>
  );
}
