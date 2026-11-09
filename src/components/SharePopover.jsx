import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { btnPrimary, field, input } from '../ui.js';

export default function SharePanel({ url }) {
  const { t } = useI18n();
  const [copiedUrl, setCopiedUrl] = useState(null);
  const copied = copiedUrl === url;
  const ref = useRef(null);
  useEffect(() => { ref.current?.select(); }, []);
  useEffect(() => {
    if (copiedUrl === null) return;
    const id = setTimeout(() => setCopiedUrl(null), 1600);
    return () => clearTimeout(id);
  }, [copiedUrl]);
  async function copy() {
    setCopiedUrl(null);
    ref.current?.select();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      const input = ref.current;
      if (!input) return;
      const value = input.value;
      input.select();
      try {
        if (document.execCommand?.('copy') === true) setCopiedUrl(value);
      } catch {}
    }
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
