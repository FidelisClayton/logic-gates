import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DICTS, detectLocale, t as tr } from './i18n.js';
import { load, save } from './storage.js';

const Ctx = createContext(null);
export const useI18n = () => useContext(Ctx);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    const s = load('locale');
    return s in DICTS ? s : detectLocale(navigator.languages ?? [navigator.language]);
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = tr(locale, 'app.title');
    save('locale', locale);
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (k, v) => tr(locale, k, v) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
