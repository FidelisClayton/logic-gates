import { circuitName } from '../useEditor.js';
import { useI18n } from '../I18n.jsx';
import { btnPrimary, field, input } from '../ui.js';

export function CopyPanel({ name, onCopy, close }) {
  const { t } = useI18n();
  return (
    <form onSubmit={(e) => { e.preventDefault(); onCopy(e.currentTarget.elements.n.value.trim() || circuitName(t('cs.copyName', { name }))); close(); }}>
      <label className="text-xs text-muted" htmlFor="cp">{t('cs.copyLabel')}</label>
      <div className={field}>
        <input id="cp" name="n" className={input} defaultValue={circuitName(t('cs.copyName', { name }))} maxLength={100} autoFocus onFocus={(e) => e.target.select()} />
        <button className={btnPrimary} type="submit">{t('cs.copyDo')}</button>
      </div>
    </form>
  );
}
