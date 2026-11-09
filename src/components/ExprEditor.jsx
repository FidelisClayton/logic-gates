import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseTokens, tokensFromText } from '../notation.js';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import Keypad from './Keypad.jsx';

const BIN = { and: 1, or: 1, xor: 1 };
const SYM = { and: '·', or: '+', xor: '⊕' };
const MAX_VARS = 6;

// Index just past the operand that starts at i (a letter, a bracket group, or a NOT and its operand). i itself when none starts there.
function opEnd(tk, i) {
  const x = tk[i];
  if (!x) return i;
  if (x.k === 'not') return Math.max(opEnd(tk, i + 1), i + 1);
  if (x.k === 'var') return i + 1;
  if (x.k !== 'lp') return i;
  for (let j = i, d = 0; j < tk.length; j++) {
    if (tk[j].k === 'lp') d++;
    else if (tk[j].k === 'rp' && !--d) return j + 1;
  }
  return tk.length;
}

const text = (x) => (x.k === 'var' ? x.name : x.k === 'not' ? '!' : x.k === 'lp' ? '(' : x.k === 'rp' ? ')' : SYM[x.k]);
const ghost = (tok) => (tok.k === 'not' ? <span className="nt-ov">A</span> : text(tok));

export function useExpressionDraft() {
  const [tokens, setTokens] = useState([]);
  const [caret, setCaret] = useState(0);
  const [mode, setMode] = useState('replace');
  return { tokens, setTokens, caret, setCaret, mode, setMode };
}

export default function ExprEditor({ letters, baseLabels, onBuild, sheet, draft }) {
  const { t } = useI18n();
  const { tokens, setTokens, caret, setCaret, mode, setMode } = draft;
  const [drag, setDrag] = useState(null); // { tile, x, y, drop }
  const field = useRef(null);
  const st = useRef(null);

  const put = (list, at) => {
    const i = Math.max(0, Math.min(at, tokens.length));
    setTokens([...tokens.slice(0, i), ...list, ...tokens.slice(i)]);
    setCaret(i + list.length);
  };
  const cut = (i) => { if (i >= 0 && i < tokens.length) { setTokens(tokens.filter((_, k) => k !== i)); setCaret(i); } };

  const res = useMemo(() => {
    if (!tokens.length) return null;
    const r = parseTokens(tokens);
    if (!r.ok) return r;
    const names = new Set(tokens.filter((x) => x.k === 'var').map((x) => x.name));
    if (mode === 'add') baseLabels.forEach((l) => names.add(l));
    return names.size > MAX_VARS ? { ok: false, error: { code: 'tooMany' } } : r;
  }, [tokens, mode, baseLabels]);
  const err = res && !res.ok ? res.error : null;

  const errText = () => {
    const { code, at, name } = err;
    if (code === 'unclosed' || code === 'unopened' || code === 'badNot' || code === 'tooMany' || code === 'tooComplex') return t(`nt.err.${code}`);
    const first = at === 0 && BIN[tokens[0]?.k];
    return first ? t('nt.err.start') : t('nt.err.after', { op: tokens[at]?.k === 'not' ? t('nt.op.not') : name });
  };

  // Typing: letters and symbols via tokensFromText (so ' and * work), arrows move the caret.
  const onKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowLeft') setCaret(Math.max(0, caret - 1));
    else if (k === 'ArrowRight') setCaret(Math.min(tokens.length, caret + 1));
    else if (k === 'Home') setCaret(0);
    else if (k === 'End') setCaret(tokens.length);
    else if (k === 'Backspace') cut(caret - 1);
    else if (k === 'Delete') cut(caret);
    else if (k.length === 1) {
      // Re-read the text before the caret plus the key, so a postfix ' finds its operand.
      const all = tokensFromText(tokens.slice(0, caret).map(text).join('') + k);
      if (all.length === caret) return;
      setTokens([...all, ...tokens.slice(caret)]);
      setCaret(all.length);
    } else return;
    e.preventDefault();
  };
  const onPaste = (e) => { e.preventDefault(); put(tokensFromText(e.clipboardData.getData('text')), caret); };

  const dropIdx = (x, y) => {
    const f = field.current.getBoundingClientRect();
    if (x < f.left - 16 || x > f.right + 16 || y < f.top - 24 || y > f.bottom + 24) return null;
    for (const el of field.current.querySelectorAll('.nt-t')) {
      const r = el.getBoundingClientRect();
      if (x < r.left + r.width / 2) return +el.dataset.i;
    }
    return tokens.length;
  };
  const down = (e, tile) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    st.current = { tile, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e) => {
    const s = st.current;
    if (!s || (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6)) return;
    s.moved = true;
    setDrag({ tile: s.tile, x: e.clientX, y: e.clientY, drop: dropIdx(e.clientX, e.clientY) });
  };
  const up = (e) => {
    const s = st.current;
    st.current = null;
    setDrag(null);
    if (!s || e.type === 'pointercancel') return;
    if (!s.moved) put([s.tile.tok], caret);
    else { const at = dropIdx(e.clientX, e.clientY); if (at !== null) put([s.tile.tok], at); }
  };
  const act = (a) => { if (a === 'back') cut(caret - 1); else { setTokens([]); setCaret(0); } };

  const pointField = (e) => {
    const el = e.target.closest('.nt-t');
    if (!el) { setCaret(tokens.length); return; }
    const r = el.getBoundingClientRect();
    setCaret(+el.dataset.i + (e.clientX > r.left + r.width / 2 ? 1 : 0));
  };

  // Keep the caret in view when the expression is wider than the field.
  useEffect(() => {
    const f = field.current;
    const c = f?.querySelector('.nt-caret, .nt-dcaret');
    if (!c) return;
    const fr = f.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    if (cr.right > fr.right - 14) f.scrollLeft += cr.right - fr.right + 14;
    else if (cr.left < fr.left + 14) f.scrollLeft -= fr.left - cr.left + 14;
  }, [tokens, caret, drag]);

  const bad = err && err.at != null && err.code !== 'tooMany' ? err.at : -1;
  const trail = tokens.length && (BIN[tokens[tokens.length - 1].k] || tokens[tokens.length - 1].k === 'not');
  const drop = drag ? drag.drop : null;
  const plainCaret = drop ?? caret;
  const marks = (i) => (drop === i ? <span key={`d${i}`} className="nt-dcaret" /> : !drag && caret === i ? <span key={`c${i}`} className="nt-caret" /> : null);
  const seq = (from, to) => {
    const out = [];
    for (let i = from; i < to;) {
      out.push(marks(i));
      const x = tokens[i];
      if (x.k === 'not') {
        const e = Math.min(opEnd(tokens, i + 1), to);
        out.push(<span key={i} className="nt-ov" data-i={i}>{e > i + 1 ? seq(i + 1, e) : <span className="nt-miss" />}</span>);
        i = Math.max(e, i + 1);
        continue;
      }
      const cls = `nt-t${BIN[x.k] ? ' nt-o' : ''}${x.k === 'lp' || x.k === 'rp' ? ' nt-p' : ''}${i === bad ? ' nt-bad' : ''}`;
      out.push(<span key={i} className={cls} data-i={i}>{x.k === 'var' ? x.name : x.k === 'lp' ? '(' : x.k === 'rp' ? ')' : SYM[x.k]}</span>);
      i++;
    }
    return out;
  };

  let msg;
  if (drag) msg = { c: 'hint', s: drag.drop === null ? t('nt.dragHint') : drag.tile.tok.k === 'not' ? t('nt.dropNot') : t('nt.drop', { tok: text(drag.tile.tok) }) };
  else if (!tokens.length) msg = { c: 'hint', s: t('nt.example') };
  else if (err) msg = { c: 'err', s: errText() };
  else msg = { c: 'ok', s: t('nt.ready') };

  const keypad = <Keypad letters={letters} dragging={drag?.tile.id} onDown={down} onMove={move} onUp={up} onKey={(k) => put([k.tok], caret)} onAct={act} />;
  const foot = (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={t('nt.where')} className="nt-seg">
        {['replace', 'add'].map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{t(`nt.${m}`)}</button>)}
      </div>
      <button type="button" disabled={!res?.ok} onClick={() => { if (onBuild(res.expr, mode) !== false) { setTokens([]); setCaret(0); } }} className="inline-flex h-9 pointer-coarse:h-11 w-full items-center justify-center gap-1.5 rounded-md border border-transparent bg-btn px-3.5 font-[550] text-onbtn hover:opacity-90 disabled:opacity-40 disabled:hover:opacity-40">
        <Icon name="format" /><span>{t('nt.buildBtn')}</span>
      </button>
    </div>
  );

  return (
    <div data-expression-editor className="flex flex-col gap-3">
      <div
        ref={field} role="textbox" tabIndex={0} aria-label={t('nt.field')} aria-invalid={!!err} aria-multiline="false"
        className={`nt-field${err ? ' err' : ''}`}
        onKeyDown={onKeyDown} onPaste={onPaste} onPointerDown={pointField}
      >
        <div className="nt-typed">
          {err?.code === 'tooComplex' ? <>{tokens.slice(0, plainCaret).map(text).join('')}{marks(plainCaret)}{tokens.slice(plainCaret).map(text).join('')}</> : tokens.length || drag ? <>{seq(0, tokens.length)}{trail ? <span className="nt-miss" /> : null}{marks(tokens.length)}</> : <><span className="nt-ph">{t('nt.ph')}</span>{marks(0)}</>}
        </div>
      </div>
      <p role="status" className={`nt-msg ${msg.c}`}>
        {msg.c === 'err' && <svg className="size-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>}
        <span>{msg.s}</span>
      </p>
      {sheet ? <>{foot}{keypad}</> : <>{keypad}{foot}<p className="m-0 text-xs text-muted">{t('nt.fine')}</p></>}
      {drag && createPortal(<div className="nt-ghost" style={{ left: drag.x, top: drag.y - 40 }} aria-hidden="true">{ghost(drag.tile.tok)}</div>, document.body)}
    </div>
  );
}
