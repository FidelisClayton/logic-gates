import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';

const tool = 'grid h-12 min-w-12 flex-none place-items-center rounded-lg text-ink hover:bg-hover active:bg-line disabled:pointer-events-none disabled:opacity-35';

const Fit = () => (
  <svg className="size-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /><rect width="8" height="6" x="8" y="9" rx="1" />
  </svg>
);

// Thumb-zone toolbar for phones, below the truth-table peek and above the safe area.
export default function MobileToolbar({ canUndo, canRedo, onUndo, onRedo, onAdd, onFormat, onFit }) {
  const { t } = useI18n();
  return (
    <div role="toolbar" aria-label={t('tb.label')} className="flex items-center gap-1 border-t border-line bg-bg px-2 pt-1 pb-[max(.25rem,env(safe-area-inset-bottom))]">
      <button className={tool} disabled={!canUndo} aria-label={t('undo')} onClick={onUndo}><Icon name="undo" /></button>
      <button className={tool} disabled={!canRedo} aria-label={t('redo')} onClick={onRedo}><Icon name="redo" /></button>
      <button className="mx-1 flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-btn px-3 font-[550] text-onbtn active:opacity-80" onClick={onAdd}>
        <Icon name="plus" /><span className="truncate max-[359px]:sr-only">{t('rail.add')}</span>
      </button>
      <button className={`${tool.replace("grid", "flex")} justify-center gap-2 px-3 min-[480px]:px-4`} aria-label={t('fmt.label')} onClick={onFormat}><Icon name="format" /><span className="hidden whitespace-nowrap min-[480px]:inline">{t('fmt.label')}</span></button>
      <button className={tool} aria-label={t('tb.fit')} onClick={onFit}><Fit /></button>
    </div>
  );
}
