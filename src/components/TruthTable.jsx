import { useEffect, useMemo, useRef, useState } from 'react';
import { truthTable } from '../logic.js';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { btn, hit } from '../ui.js';
import BottomSheet from './BottomSheet.jsx';
import NotationPanel, { NotationPeek } from './NotationPanel.jsx';
import { useExpressionDraft } from './ExprEditor.jsx';

const MIN = 240;
const STEP = 16;

export default function TruthTable({ circuit, width, onWidth, sheet, phone, hover, onHover, onBuild }) {
  const { t } = useI18n();
  const draft = useExpressionDraft();
  const [covered, setCovered] = useState(false);
  const [shown, setShown] = useState({ key: null, rows: new Set() });
  const box = useRef(null);
  const aside = useRef(null);
  const drag = useRef(null);
  const [now, setNow] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('tt'); // the truth table stays the default
  const note = tab === 'nt';
  // Max: 560px, or whatever still leaves the canvas (the column before this one) at least 360px.
  const max = () => Math.max(MIN, Math.min(560, (aside.current?.offsetWidth ?? 0) + (aside.current?.previousElementSibling?.offsetWidth ?? 0) - 360));
  const clamp = (w) => Math.round(Math.min(max(), Math.max(MIN, w)));
  const cur = () => aside.current?.offsetWidth ?? MIN;
  useEffect(() => {
    setNow(cur());
    const on = () => { setNow(cur()); if (width && clamp(width) !== width) onWidth(clamp(width), false); };
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, [width]); // eslint-disable-line react-hooks/exhaustive-deps
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, w: cur() }; };
  const move = (e) => { if (drag.current) { const w = clamp(drag.current.w + drag.current.x - e.clientX); onWidth(w, false); } };
  const up = () => { if (drag.current) { drag.current = null; onWidth(cur(), true); } };
  const key = (e) => {
    const d = e.key === 'ArrowLeft' ? STEP : e.key === 'ArrowRight' ? -STEP : 0;
    if (d) { e.preventDefault(); onWidth(clamp(cur() + d), true); }
  };
  const hasIn = circuit.nodes.some((n) => n.type === 'INPUT');
  const hasOut = circuit.nodes.some((n) => n.type === 'OUTPUT');
  const tt = useMemo(() => hasIn && hasOut ? truthTable(circuit) : null, [circuit, hasIn, hasOut]);
  const ok = tt && !tt.tooMany;
  const tableKey = useMemo(() => ok ? JSON.stringify([tt.inputs, tt.outputs, tt.rows]) : null, [tt, ok]);

  // Scroll only the table box (scrollIntoView could also shift the clipped sheet or the page).
  useEffect(() => {
    const b = box.current;
    const r = b?.querySelector('tr.now');
    if (!r) return;
    const top = r.offsetTop;
    const bot = top + r.offsetHeight;
    if (top < b.scrollTop) b.scrollTop = top;
    else if (bot > b.scrollTop + b.clientHeight) b.scrollTop = bot - b.clientHeight;
  }, [ok && tt.current, ok && tt.rows.length, expanded, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const msg = tt?.tooMany ? t('tt.tooMany') : !hasIn && !hasOut ? t('tt.empty.both') : !hasIn ? t('tt.empty.in') : !hasOut ? t('tt.empty.out') : null;
  const open = shown.key === tableKey ? shown.rows : new Set();
  const toggleCover = () => { setCovered((c) => !c); setShown({ key: null, rows: new Set() }); };
  const reveal = (r) => setShown({ key: tableKey, rows: new Set(open).add(r) });

  const credit = (
    <>
      <p className={`credit text-center text-xs text-muted ${sheet ? 'py-2' : 'mt-auto'}`}>
        {t('credit.by')}{' '}
        <a href="https://github.com/FidelisClayton" target="_blank" rel="noreferrer" className="inline-block py-1 pointer-coarse:py-3.5 font-medium text-ink hover:underline">FidelisClayton</a>
      </p>
    </>
  );

  const body = (
    <>
      {ok ? (
        <>
          <button className={`${btn} ${hit} w-full justify-center ${sheet ? 'h-8! pointer-coarse:h-9!' : ''} ${covered ? 'bg-hover text-ink' : 'text-muted hover:text-ink'}`} aria-pressed={covered} onClick={toggleCover}>
            <Icon name="eye" /><span>{covered ? t('tt.uncover') : t('tt.cover')}</span>
          </button>
          <div ref={box} className="min-h-0 flex-1 overflow-auto overscroll-contain">
            <table className={`tt table-fixed${covered ? ' covered' : ''}`}>
              <thead><tr>
                {tt.inputs.map((i) => <th key={i.id}>{i.label}</th>)}
                {tt.outputs.map((o) => <th key={o.id} className="out">{o.label}</th>)}
              </tr></thead>
              <tbody>
                {tt.rows.map((r, ri) => (
                  <tr key={ri} className={ri === tt.current ? 'now' : undefined} aria-current={ri === tt.current ? 'true' : undefined}>
                    {r.in.map((x, k) => <td key={k} className={`v${x}`}>{x}</td>)}
                    {r.out.map((x, k) => {
                      const hidden = covered && !open.has(ri); // a covered cell is a button: tap, Enter or Space shows the row
                      return <td key={k} className={`out v${x}${open.has(ri) ? ' shown' : ''}`} onClick={() => covered && reveal(ri)}
                        {...(hidden ? { role: 'button', tabIndex: 0, 'aria-label': t('tt.reveal'), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(ri); } } } : {})}>{x}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {sheet && credit}
          </div>
        </>
      ) : <p className="text-sm text-muted text-pretty">{msg}</p>}
    </>
  );
  const tabs = (
    <div role="tablist" aria-label={`${t('tt.title')} / ${t('nt.tab')}`} className="flex h-7 pointer-coarse:h-11 flex-none gap-1" onKeyDown={(e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const to = note ? 'tt' : 'nt';
      setTab(to);
      e.currentTarget.querySelector(`#tab-${to}`).focus();
    }}>
      {[['tt', t('tt.title')], ['nt', t('nt.tab')]].map(([k, label]) => (
        <button key={k} type="button" role="tab" id={`tab-${k}`} aria-controls={`panel-${k}`} aria-selected={tab === k} tabIndex={tab === k ? 0 : -1}
          className="relative h-7 pointer-coarse:h-11 rounded-md px-2.5 font-[550] text-muted after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] hover:text-ink aria-selected:bg-hover aria-selected:text-ink"
          onClick={() => setTab(k)}>{label}</button>
      ))}
    </div>
  );
  const panels = (head) => (
    <>
      <div role="tabpanel" id="panel-tt" aria-labelledby="tab-tt" hidden={note} className="flex min-h-0 flex-1 flex-col gap-2.5">{head}{body}</div>
      <div role="tabpanel" id="panel-nt" aria-labelledby="tab-nt" hidden={!note} className="flex min-h-0 flex-1 flex-col">
        <NotationPanel circuit={circuit} hover={hover} onHover={onHover} onBuild={onBuild} sheet={sheet} compact={phone} draft={draft} />
      </div>
    </>
  );
  if (sheet) {
    const row = ok ? tt.rows[tt.current] : null;
    const chip = (v, out) => `inline-flex h-6 flex-none items-center gap-1 rounded-md px-1.5 text-xs tabular-nums ${out && v ? 'bg-sigsoft text-sig' : 'bg-hover'}`;
    const peek = note ? (
      <>
        <span className="peek">
          <span className="flex flex-none items-baseline gap-2"><b className="font-semibold">{t('nt.tab')}</b><span className="text-xs text-muted">{t('nt.live')}</span></span>
          <NotationPeek circuit={circuit} />
        </span>
        <span className={`flex-none text-muted ${expanded ? 'rotate-90' : '-rotate-90'}`}><Icon name="right" /></span>
      </>
    ) : (
      <>
        <span className="peek">
          <span className="flex flex-none items-baseline gap-2">
            <b className="font-semibold">{t('tt.title')}</b>
            {ok && <span className="text-xs text-muted tabular-nums">{tt.current + 1}/{tt.rows.length}</span>}
          </span>
          {ok ? (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {tt.inputs.map((i, k) => <span key={i.id} className={chip(row.in[k])}><span className="text-muted">{i.label}</span><b className={row.in[k] ? '' : 'text-muted'}>{row.in[k]}</b></span>)}
              <span className="text-muted"><Icon name="right" /></span>
              {tt.outputs.map((o, k) => {
                const v = covered && !open.has(tt.current) ? null : row.out[k];
                return <span key={o.id} className={chip(v, true)}><span className={v ? '' : 'text-muted'}>{o.label}</span><b>{v ?? '?'}</b></span>;
              })}
            </span>
          ) : <span className="max-w-full truncate text-xs text-muted">{msg}</span>}
        </span>
        <span className={`flex-none text-muted ${expanded ? 'rotate-90' : '-rotate-90'}`}><Icon name="right" /></span>
      </>
    );
    return (
      <BottomSheet tall={note} open={expanded} onOpenChange={setExpanded} label={note ? `${t('nt.tab')}. ${expanded ? t('nt.collapse') : t('nt.expand')}` : `${t('tt.title')}${ok ? ` ${tt.current + 1}/${tt.rows.length}` : ''}. ${expanded ? t('tt.collapse') : t('tt.expand')}`} peek={peek}>
        <div className="sheet mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col gap-2.5 px-4 pb-3">
          {tabs}
          {panels(null)}
        </div>
      </BottomSheet>
    );
  }

  return (
    <aside ref={aside} className="relative flex min-h-0 flex-col gap-2.5 border-l border-line px-4 py-3.5">
      <div
        role="separator" aria-orientation="vertical" aria-label={t('tt.resize')} aria-valuenow={now} aria-valuemin={MIN} aria-valuemax={max()} tabIndex={0}
        className="group absolute inset-y-0 -left-2 z-10 w-4 cursor-col-resize touch-none outline-none"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        onDoubleClick={() => onWidth(null, true)}
      >
        <span className="absolute inset-y-0 left-[7px] w-0.5 rounded bg-transparent group-hover:bg-sig group-focus-visible:bg-sig group-active:bg-sig" />
      </div>
      {tabs}
      {panels(
        <div className="flex h-7 items-center justify-between">
          <h2 className="font-semibold">{t('tt.title')}</h2>
          <span className="text-xs text-muted tabular-nums">{ok ? `${tt.current + 1} / ${tt.rows.length}` : ''}</span>
        </div>,
      )}
      {credit}
    </aside>
  );
}
