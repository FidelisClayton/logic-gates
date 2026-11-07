import { useI18n } from '../I18n.jsx';

const svg = (d) => <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const BACK = svg(<><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" /><path d="m18 9-6 6" /><path d="m12 9 6 6" /></>);
const CLEAR = svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);

// Tiles: a token (tap inserts, drag drops it in the field) or an action.
export const symbolTiles = (t) => [
  { id: 'lp', tok: { k: 'lp' }, label: '(', aria: t('nt.k.lp'), cls: 'nt-kp' },
  { id: 'rp', tok: { k: 'rp' }, label: ')', aria: t('nt.k.rp'), cls: 'nt-kp' },
  { id: 'not', tok: { k: 'not' }, label: <span className="nt-ov">A</span>, aria: t('nt.k.not'), hint: '!' },
  { id: 'and', tok: { k: 'and' }, label: '·', aria: t('nt.k.and'), hint: '*' },
  { id: 'or', tok: { k: 'or' }, label: '+', aria: t('nt.k.or'), hint: '+' },
  { id: 'xor', tok: { k: 'xor' }, label: '⊕', aria: t('nt.k.xor'), hint: '^' },
  { id: 'back', act: 'back', label: BACK, aria: t('nt.k.back'), cls: 'nt-kp' },
  { id: 'clear', act: 'clear', label: CLEAR, aria: t('nt.k.clear'), cls: 'nt-kp' },
];

export default function Keypad({ letters, dragging, onDown, onMove, onUp, onKey, onAct }) {
  const { t } = useI18n();
  const tiles = [...letters.map((n) => ({ id: n, tok: { k: 'var', name: n }, label: n, aria: n, cls: 'nt-kv' })), ...symbolTiles(t)];
  return (
    <div role="group" aria-label={t('nt.keys')} className="nt-keys" style={{ gridTemplateColumns: `repeat(${Math.ceil(tiles.length / 2)},minmax(0,1fr))` }}>
      {tiles.map((k) => (
        <button
          key={k.id} type="button" aria-label={k.aria}
          className={`nt-key ${k.cls ?? ''}${dragging === k.id ? ' dragging' : ''}`}
          {...(k.tok
            ? { onPointerDown: (e) => onDown(e, k), onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp, onClick: (e) => e.detail === 0 && onKey(k) }
            : { onClick: () => onAct(k.act) })}
        >
          {k.label}{k.hint && <i aria-hidden="true">{k.hint}</i>}
        </button>
      ))}
    </div>
  );
}
