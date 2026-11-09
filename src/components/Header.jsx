import { useEffect, useRef, useState } from 'react';
import { Anchor as PopoverAnchor } from '@radix-ui/react-popover';
import { LOCALES } from '../i18n.js';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { WireIcon } from '../wireIcons.jsx';
import { btn, btnPrimary, hit, iconBtn } from '../ui.js';
import { load } from '../storage.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import SharePanel from './SharePopover.jsx';
import { CopyPanel } from './CircuitSwitcher.jsx';

const safeTop = 'pt-[env(safe-area-inset-top)]';

// Phone-only menu for everything the narrow header and bottom toolbar leave out.
function Overflow({ saved, dark, canClear, actions, onCopy }) {
  const { t, locale, setLocale } = useI18n();
  const [view, setView] = useState('main');
  const picked = useRef(false); // a choice that opens something owns focus, so the menu must not return it to the trigger
  const [wires, setWires] = useState(() => (load('wires') === 'curved' ? 'curved' : 'square'));
  useEffect(() => {
    const on = (e) => setWires(e.detail === 'curved' ? 'curved' : 'square');
    addEventListener('lg:wires', on);
    return () => removeEventListener('lg:wires', on);
  }, []);
  const item = 'data-[disabled]:pointer-events-none data-[disabled]:opacity-35';
  const mark = <span className="ml-auto text-sig"><Icon name="check" /></span>;
  return (
    <DropdownMenu onOpenChange={(o) => !o && setView('main')}>
      <DropdownMenuTrigger asChild><button className={iconBtn} aria-label={t('ov.more')}><Icon name="more" /></button></DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={4} className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-y-auto overscroll-contain" onCloseAutoFocus={(e) => { if (picked.current) { picked.current = false; e.preventDefault(); } }}>
        {view === 'main' ? (
          <>
            <DropdownMenuItem onSelect={actions.circuits.onNew}><Icon name="plus" /><span>{t('cs.new')}</span></DropdownMenuItem>
            <DropdownMenuItem className={item} disabled={!canClear} onSelect={actions.clear}><Icon name="eraser" /><span>{t('cmd.clear')}</span></DropdownMenuItem>
            {!saved && <DropdownMenuItem onSelect={actions.save}><Icon name="check" /><span>{t('save')}</span></DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => { picked.current = true; onCopy(); }}><Icon name="copy" /><span>{t('cmd.copy')}</span></DropdownMenuItem>
            <div role="separator" className="my-1 h-px bg-line" />
            <div className="px-2.5 py-1 text-xs text-muted">{t('wire.style')}</div>
            {['square', 'curved'].map((k) => (
              <DropdownMenuItem key={k} onSelect={() => dispatchEvent(new CustomEvent('lg:wires', { detail: k }))}><WireIcon style={k} /><span>{t(`wire.${k}`)}</span>{wires === k && mark}</DropdownMenuItem>
            ))}
            <div role="separator" className="my-1 h-px bg-line" />
            <DropdownMenuItem onSelect={actions.theme}><Icon name={dark ? 'sun' : 'moon'} /><span>{t(dark ? 'theme.light' : 'theme.dark')}</span></DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setView('lang'); }}><Icon name="globe" /><span>{t('lang.title')}</span><span className="ml-auto text-xs text-muted">{LOCALES[locale]}</span></DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setView('main'); }}><Icon name="left" /><span>{t('ov.back')}</span></DropdownMenuItem>
            <div role="separator" className="my-1 h-px bg-line" />
            {Object.entries(LOCALES).map(([code, name]) => (
              <DropdownMenuItem key={code} lang={code} onSelect={() => setLocale(code)}><span>{name}</span>{code === locale && mark}</DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Header({ tier, editor, saved, sidebar, onSidebar, canUndo, canRedo, canClear, copySignal, dark, shareUrl, actions }) {
  const { t, locale, setLocale } = useI18n();
  const [copyOpen, setCopyOpen] = useState(false);
  useEffect(() => { if (copySignal) setCopyOpen(true); }, [copySignal]);
  const lbl = locale === 'de' || locale === 'fr' ? 'hidden' : 'max-[1199px]:hidden'; // icon-only below 1200px and in German and French
  const quiet = `${btn} ${hit} pointer-coarse:min-w-11 justify-center border-transparent text-muted hover:text-ink disabled:pointer-events-none disabled:opacity-35`;
  const status = saved ? <Icon name="check" /> : <span aria-hidden className="size-1.5 rounded-full bg-faint" />;
  if (tier === 'phone') {
    return (
      <header className={`flex items-center gap-1 border-b border-line px-2 ${safeTop}`}>
        <button className={iconBtn} aria-label={t('sb.toggle')} title={t('sb.toggle')} aria-pressed={sidebar} onClick={onSidebar}><Icon name="sidebar" /></button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <h1 className="min-w-0 truncate font-semibold tracking-[-0.01em] text-[13px]">{editor.circuit.name}</h1>
          <span className="flex flex-none items-center text-muted" role="status" title={saved ? t('status.saved') : t('status.unsaved')}>{status}<span className="sr-only">{saved ? t('status.saved') : t('status.unsaved')}</span></span>
        </div>
        <Popover open={copyOpen} onOpenChange={setCopyOpen}>
          <PopoverAnchor asChild><span className="flex"><Overflow saved={saved} dark={dark} canClear={canClear} actions={actions} onCopy={() => setCopyOpen(true)} /></span></PopoverAnchor>
          <PopoverContent align="end" sideOffset={4} className="w-[280px]" aria-label={t('hd.copy')}><CopyPanel name={editor.circuit.name} onCopy={actions.copy} close={() => setCopyOpen(false)} /></PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild><button className={iconBtn} aria-label={t('share')} title={t('share')}><Icon name="share" /></button></PopoverTrigger>
          <PopoverContent sideOffset={4} className="w-[320px]" aria-label={t('share')}><SharePanel url={shareUrl} /></PopoverContent>
        </Popover>
      </header>
    );
  }
  const desk = tier === 'desk';
  return (
    <header className={`relative flex items-center gap-1 border-b border-line pr-3 pl-4 ${safeTop}`}>
      <button className={`${iconBtn} -ml-1.5 mr-1.5`} aria-label={t('sb.toggle')} title={t('sb.toggle')} aria-pressed={sidebar} onClick={onSidebar}><Icon name="sidebar" /></button>
      {/* centred on the bar, capped so it never runs under the side groups */}
      <div className={desk ? 'pointer-events-none absolute left-1/2 flex max-w-[34%] -translate-x-1/2 items-center gap-2' : 'hidden'}>
        <h1 className="min-w-0 truncate font-semibold tracking-[-0.01em] text-[13px]">{editor.circuit.name}</h1>
        <span className="flex flex-none items-center gap-1.5 text-xs text-muted" role="status">
          {saved && <Icon name="check" />}<span>{saved ? t('status.saved') : t('status.unsaved')}</span>
        </span>
      </div>
      <span className="flex items-center">
        <button className={quiet} aria-label={t('cs.new')} title={t('cs.new')} onClick={actions.circuits.onNew}><Icon name="plus" /><span className={lbl}>{t('hd.new')}</span></button>
        <button className={quiet} disabled={!canClear} aria-label={t('cmd.clear')} title={t('cmd.clear')} onClick={actions.clear}><Icon name="eraser" /><span className={lbl}>{t('hd.clear')}</span></button>
        <Popover open={copyOpen} onOpenChange={setCopyOpen}>
          <PopoverTrigger asChild><button className={quiet} aria-label={t('hd.copy')} title={t('hd.copy')}><Icon name="copy" /><span className={lbl}>{t('hd.copy')}</span></button></PopoverTrigger>
          <PopoverContent align="start" sideOffset={11.5} className="w-[280px]" aria-label={t('hd.copy')}><CopyPanel name={editor.circuit.name} onCopy={actions.copy} close={() => setCopyOpen(false)} /></PopoverContent>
        </Popover>
      </span>
      {desk ? <span className="flex-1" /> : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <h1 className="min-w-0 truncate font-semibold tracking-[-0.01em] text-[13px]">{editor.circuit.name}</h1>
          <span className="flex flex-none items-center text-muted" role="status" title={saved ? t('status.saved') : t('status.unsaved')}>{status}<span className="sr-only">{saved ? t('status.saved') : t('status.unsaved')}</span></span>
        </div>
      )}
      <button className={iconBtn} disabled={!canUndo} aria-label={t('undo')} title={`${t('undo')} ⌘Z`} onClick={actions.undo}><Icon name="undo" /></button>
      <button className={iconBtn} disabled={!canRedo} aria-label={t('redo')} title={`${t('redo')} ⇧⌘Z`} onClick={actions.redo}><Icon name="redo" /></button>
      <button className={iconBtn} aria-label={t('theme.toggle')} onClick={actions.theme}><Icon name={dark ? 'sun' : 'moon'} /></button>
      <Popover>
        <PopoverTrigger asChild><button className={iconBtn} aria-label={t('lang.title')}><Icon name="globe" /></button></PopoverTrigger>
        <PopoverContent sideOffset={11.5} className="w-[216px]" aria-label={t('lang.title')}>
          <div className="-m-1.5 flex flex-col" role="listbox" aria-label={t('lang.title')}>
            {Object.entries(LOCALES).map(([code, name]) => (
              <PopoverClose key={code} asChild>
                <button role="option" aria-selected={code === locale} lang={code} className="flex h-9 pointer-coarse:h-11 items-center gap-2 rounded-lg px-2.5 text-left hover:bg-hover" onClick={() => setLocale(code)}>
                  <span className="grid size-4 flex-none place-items-center text-sig">{code === locale && <Icon name="check" />}</span>{name}
                </button>
              </PopoverClose>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <span className="mx-1.5 h-4 w-px bg-line" />
      {!saved && <button className={`${btn} ${hit}`} onClick={actions.save}><Icon name="check" /><span>{t('save')}</span></button>}
      <span className="ml-1">
        <Popover>
          <PopoverTrigger asChild><button className={`${btnPrimary} ${hit}`}><Icon name="share" /><span>{t('share')}</span></button></PopoverTrigger>
          <PopoverContent sideOffset={20.5} className="w-[320px]" aria-label={t('share')}><SharePanel url={shareUrl} /></PopoverContent>
        </Popover>
      </span>
    </header>
  );
}
