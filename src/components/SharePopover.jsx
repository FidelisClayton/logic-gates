import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { btnPrimary, field, input } from '../ui.js';

export default function SharePanel({ url }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.select(); }, []);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);
  async function copy() {
    ref.current.select();
    try { await navigator.clipboard.writeText(url); } catch { document.execCommand?.('copy'); }
    setCopied(true);
  }
  return (
    <>
      <label className="text-xs text-muted" htmlFor="share-url">{t('share.label')}</label>
      <div className={field}>
        <input id="share-url" ref={ref} className={input} readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className={btnPrimary} onClick={copy}><Icon name={copied ? 'check' : 'link'} /><span>{copied ? t('share.copied') : t('share.copy')}</span></button>
      </div>
    </>
  );
}
