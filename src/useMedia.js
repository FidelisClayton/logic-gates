import { useEffect, useState } from 'react';

// Phone: narrow, or a short touch screen (a phone held sideways). Desk: 1024px and wider. Mid is everything between.
export const PHONE = '(max-width:639px), (max-height:500px) and (pointer:coarse)';
export const DESK = '(min-width:1024px)';

export function useMedia(q) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function useTier() {
  const phone = useMedia(PHONE);
  const desk = useMedia(DESK);
  return phone ? 'phone' : desk ? 'desk' : 'mid';
}
