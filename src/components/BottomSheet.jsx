import { useEffect, useRef, useState } from 'react';

// Two snap points, peek and expanded. Drag the peek row or tap it; Esc collapses. Slides with translateY only.
export default function BottomSheet({ open, onOpenChange, peek, label, tall, children }) {
  const el = useRef(null);
  const row = useRef(null);
  const drag = useRef(null);
  const [y, setY] = useState(null); // live offset in px while a finger is down
  const range = () => Math.max(0, (el.current?.offsetHeight ?? 0) - (row.current?.offsetHeight ?? 0));

  useEffect(() => {
    if (!open) return;
    const on = (e) => e.key === 'Escape' && !e.defaultPrevented && onOpenChange(false);
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [open, onOpenChange]);

  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, base: open ? 0 : range(), moved: false, v: 0, last: e.clientY, t: e.timeStamp };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.v = (e.clientY - d.last) / dt;
    d.last = e.clientY; d.t = e.timeStamp;
    setY(Math.min(range(), Math.max(0, d.base + dy)));
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    setY(null);
    if (!d || e.type === 'pointercancel') return;
    if (!d.moved) { onOpenChange(!open); return; }
    const pos = Math.min(range(), Math.max(0, d.base + e.clientY - d.y0));
    onOpenChange(Math.abs(d.v) > 0.3 ? d.v < 0 : pos < range() / 2);
  };

  return (
    <section
      ref={el}
      className={`absolute inset-x-0 bottom-0 z-[15] mx-auto flex ${tall ? 'h-[min(100%,max(60dvh,520px))]' : 'h-[60dvh]'} max-h-full [@media(max-height:500px)]:h-full w-full max-w-[720px] flex-col rounded-t-[14px] bg-bg shadow-pop motion-safe:will-change-transform ${y === null ? 'transition-transform duration-200 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none' : ''}`}
      style={{ transform: `translateY(${y === null ? (open ? '0px' : 'calc(100% - var(--peek))') : `${y}px`})` }}
    >
      <button
        ref={row}
        type="button"
        aria-expanded={open}
        aria-label={label}
        className="relative flex h-[var(--peek)] w-full flex-none touch-none items-center gap-2 px-4 text-left"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={(e) => e.detail === 0 && onOpenChange(!open)}
      >
        <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line2" />
        {peek}
      </button>
      <div inert={!open} className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
