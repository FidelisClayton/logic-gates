import { cn } from '@/lib/utils';
import { needsParens } from '../notation.js';

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
      onPointerOver={onHover && ((ev) => { ev.stopPropagation(); onHover(e.src); })}
      onFocus={onHover && ((ev) => { ev.stopPropagation(); onHover(e.src); })}
      className={cn('rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-sig', hl === e.src && 'bg-sigsoft')}
    >
      {body}
    </span>
  );
}

export default function Expr({ expr, size = 'md', hl = null, onHover }) {
  return (
    <span
      className={cn('inline-block pt-1 font-medium tabular-nums', SIZE[size])}
      onPointerLeave={onHover && (() => onHover(null))}
      onBlur={onHover && (() => onHover(null))}
    >
      <Node e={expr} hl={hl} onHover={onHover} />
    </span>
  );
}
