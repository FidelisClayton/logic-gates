// Square and curved wire glyphs, drawn to match icons.jsx (24 grid, 1.6 stroke).
export function WireIcon({ style }) {
  return (
    <svg className="size-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {style === 'square' ? <path d="M3 17h5a2 2 0 0 0 2-2V9a2 2 0 0 1 2-2h9" /> : <path d="M3 17c8 0 10-10 18-10" />}
    </svg>
  );
}
