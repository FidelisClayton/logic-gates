import { useMemo, useRef } from 'react';
import { evaluate } from '../logic.js';
import { circuitExprs, cone } from '../notation.js';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { GateIcon } from '../glyphs.jsx';
import Expr from './Expr.jsx';
import ExprEditor from './ExprEditor.jsx';

export const Val = ({ v }) => <span className={`nt-v ${v ? 'c1' : 'c0'}`}>{v}</span>;

// Keypad letters: the circuit's input letters plus the next unused one, padded to at least four, at most six.
function keypadLetters(circuit) {
  const have = [...new Set(circuit.nodes.filter((n) => n.type === 'INPUT' && /^[A-Z]$/.test(n.label ?? '')).map((n) => n.label))];
  const more = () => have.push(String.fromCharCode(65 + [...Array(26).keys()].find((i) => !have.includes(String.fromCharCode(65 + i)))));
  if (have.length < 6) more();
  while (have.length < 4) more();
  return have.sort();
}

// One line for the sheet's peek row: the first output's expression.
export function NotationPeek({ circuit }) {
  const { t } = useI18n();
  const { outputs } = useMemo(() => circuitExprs(circuit), [circuit]);
  const ev = useMemo(() => evaluate(circuit), [circuit]);
  const o = outputs[0];
  if (!o) return <span className="max-w-full truncate text-xs text-muted">{t('nt.noOut')}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
      <span className="text-xs text-muted">{o.label} =</span>
      <span className="min-w-0 overflow-hidden"><Expr expr={o.expr} size="sm" /></span>
      <Val v={ev.node[o.id]} />
    </span>
  );
}

export default function NotationPanel({ circuit, hover, onHover, onBuild, sheet, compact, draft }) {
  const { t } = useI18n();
  const { outputs, nodes, order } = useMemo(() => circuitExprs(circuit), [circuit]);
  const ev = useMemo(() => evaluate(circuit), [circuit]);
  const inputs = circuit.nodes.filter((n) => n.type === 'INPUT').sort((a, b) => ((a.label ?? '') < (b.label ?? '') ? -1 : 1));
  const type = (id) => circuit.nodes.find((n) => n.id === id)?.type;
  const letters = useMemo(() => keypadLetters(circuit), [circuit]);
  const baseLabels = useMemo(() => circuit.nodes.filter((n) => n.type === 'INPUT' && n.label).map((n) => n.label), [circuit]);

  const pointerType = useRef(null);

  // Touch has no hover: a tap on a row toggles it. Mouse and keyboard focus follow the pointer.
  const rowEvents = (id) => ({
    onPointerDown: (e) => { pointerType.current = e.pointerType; },
    onPointerEnter: (e) => e.pointerType === 'mouse' && onHover(id),
    onPointerLeave: (e) => e.pointerType === 'mouse' && onHover(null),
    onFocus: (e) => e.currentTarget.matches(':focus-visible') && onHover(id),
    onBlur: () => onHover(null),
    onClick: (e) => {
      const type = pointerType.current;
      pointerType.current = null;
      if (e.detail !== 0 && ['touch', 'pen'].includes(type)) onHover(hover === id ? null : id);
    },
  });

  const cards = outputs.map((o) => {
    const feeds = compact ? null : cone(circuit, o.id).nodes;
    const gates = compact ? [] : order.filter((id) => feeds.has(id) && nodes[id]);
    return (
      <div key={o.id} className={`rounded-xl border border-line bg-raised px-3.5 pb-2 ${compact ? 'pt-2.5' : 'pt-3.5'}`}>
        <div className="flex items-center gap-1.5 text-xs font-[550] text-muted">
          <span className="text-ink">{o.label}</span><span>=</span>
          <span className="ml-auto flex items-center gap-1.5 font-normal"><Icon name="check" /><span>{t('nt.live')}</span></span>
        </div>
        <div className={`overflow-x-auto overflow-y-hidden whitespace-nowrap ${compact ? 'mt-0.5 leading-[1.5]' : 'mt-2 leading-[1.7]'}`}><Expr expr={o.expr} size="lg" hl={hover} onHover={onHover} /></div>
        {!o.complete && <p className="nt-msg err mt-1"><span>{t('nt.partial', { name: o.label })}</span></p>}
        {!compact && (
          <div className="mt-0.5 flex items-center justify-between text-xs text-muted tabular-nums">
            <span>{inputs.map((n) => `${n.label}=${ev.node[n.id]}`).join(' ')}</span><Val v={ev.node[o.id]} />
          </div>
        )}
        {gates.length > 0 && (
          <div role="list" aria-label={t('nt.sub')} className="-mx-1.5 mt-2.5 flex flex-col gap-0.5 border-t border-line pt-1.5">
            {gates.map((id) => (
              <div key={id} role="listitem" tabIndex={0} data-row={id} className={`nt-row${hover === id ? ' hl' : ''}`} {...rowEvents(id)}>
                <GateIcon type={type(id)} />
                <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap"><Expr expr={nodes[id]} size="md" /></span>
                <Val v={ev.node[id]} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pb-1">
      {!compact && <div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs font-[550] text-muted">{t('nt.from')}</span><span className="text-xs text-muted">{t('nt.hint')}</span></div>}
      {cards.length ? cards : <p className="text-sm text-muted text-pretty">{t('nt.noOut')}</p>}
      {!compact && <div className="mt-2.5 flex items-center justify-between gap-2"><span className="text-xs font-[550] text-muted">{t('nt.build')}</span><span className="text-xs text-muted">{t('nt.buildHint')}</span></div>}
      <ExprEditor letters={letters} baseLabels={baseLabels} onBuild={onBuild} sheet={sheet} draft={draft} />
    </div>
  );
}
