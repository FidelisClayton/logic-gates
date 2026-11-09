import { useEffect, useRef } from 'react';
import { gridColor } from '../gridColor.js';

const SPACING = 24; // world px between dots, same as geometry.GRID
const RADIUS = 120; // screen px: reach of the cursor's pull
const PULL = 8; // screen px: strongest displacement
const OMEGA = 20; // spring rate: critically damped, settles in about 300ms
const IDLE = 250; // ms without a move before the pull eases back

// The dot grid, drawn in world space on a canvas behind the SVG. With a mouse, dots near the cursor lean toward it.
// Draws only on pointer move, pan/zoom/theme change, or while the spring settles; no React render per frame.
export default function Grid({ host, view, size }) {
  const cv = useRef(null);
  const st = useRef({ view, size, cur: null, s: 0, v: 0, target: 0, raf: 0, idle: 0, rgb: null, last: 0 });
  const draw = useRef(null);
  st.current.view = view;
  st.current.size = size;

  useEffect(() => {
    const c = cv.current, S = st.current;
    const ctx = c.getContext('2d');
    const readColor = () => {
      Object.assign(S, gridColor(getComputedStyle(c).getPropertyValue('--dots')));
    };
    readColor();

    draw.current = () => {
      const { view: { x, y, k }, size: { w, h }, cur, s } = S;
      const dpr = devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const step = SPACING * k, off = SPACING / 2 * k;
      const i0 = Math.floor((-x - off) / step) - 1, i1 = Math.ceil((w - x - off) / step) + 1;
      const j0 = Math.floor((-y - off) / step) - 1, j1 = Math.ceil((h - y - off) / step) + 1;
      const base = `rgba(${S.rgb},${S.a})`;
      ctx.fillStyle = base;
      for (let j = j0; j <= j1; j++) {
        const py = y + off + j * step;
        for (let i = i0; i <= i1; i++) {
          let px = x + off + i * step, sy = py, d = 0;
          if (cur && s > 0.001) {
            const dx = cur.x - px, dy = cur.y - py;
            d = Math.hypot(dx, dy);
            if (d < RADIUS && d > 0.01) {
              const f = (1 - d / RADIUS) ** 2 * s;
              const m = Math.min(PULL * f, d);
              px += (dx / d) * m; sy += (dy / d) * m;
              ctx.fillStyle = `rgba(${S.rgb},${Math.min(1, S.a * (1 + 1.2 * f))})`;
              ctx.fillRect(px - 1, sy - 1, 2, 2);
              ctx.fillStyle = base;
              continue;
            }
          }
          ctx.fillRect(px - 1, sy - 1, 2, 2);
        }
      }
    };

    // Spring toward S.target (1 while the mouse moves, 0 after it rests or leaves); runs only until settled.
    const tick = (now) => {
      const dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
      const a = -2 * OMEGA * S.v - OMEGA * OMEGA * (S.s - S.target);
      S.v += a * dt; S.s += S.v * dt;
      if (Math.abs(S.s - S.target) < 0.004 && Math.abs(S.v) < 0.01) { S.s = S.target; S.v = 0; S.raf = 0; } else S.raf = requestAnimationFrame(tick);
      draw.current();
    };
    const kick = () => { if (!S.raf) { S.last = performance.now(); S.raf = requestAnimationFrame(tick); } };
    const settle = () => { S.target = 0; kick(); };

    const fine = matchMedia('(hover: hover) and (pointer: fine)'), calm = matchMedia('(prefers-reduced-motion: reduce)');
    const el = host.current;
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      S.cur = { x: e.clientX - r.left, y: e.clientY - r.top };
      S.target = 1; kick();
      clearTimeout(S.idle); S.idle = setTimeout(settle, IDLE);
    };
    const onLeave = () => { clearTimeout(S.idle); settle(); };
    const live = fine.matches && !calm.matches;
    if (live) { el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', onLeave); }

    // Theme tokens change with data-theme or the system scheme.
    const retheme = () => { readColor(); draw.current(); };
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const scheme = matchMedia('(prefers-color-scheme: light)');
    scheme.addEventListener('change', retheme);
    return () => {
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave);
      mo.disconnect(); scheme.removeEventListener('change', retheme);
      cancelAnimationFrame(S.raf); S.raf = 0; clearTimeout(S.idle);
    };
  }, [host]);

  useEffect(() => { draw.current?.(); }, [view.x, view.y, view.k, size.w, size.h]);

  return <canvas ref={cv} className="absolute inset-0 size-full pointer-events-none" aria-hidden="true" style={{ width: size.w, height: size.h }} />;
}
