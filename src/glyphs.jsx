// Gate outlines from the approved draft. XNOR = the NOR outline plus the XOR back curve.
export const BODY = {
  AND: 'M-26,-20H-2A20,20 0 0 1 -2,20H-26Z',
  OR: 'M-26,-20Q-2,-20 22,0Q-2,20 -26,20Q-14,0 -26,-20Z',
  XOR: 'M-26,-20Q-2,-20 22,0Q-2,20 -26,20Q-14,0 -26,-20Z M-33,-20Q-21,0 -33,20',
  NOT: 'M-22,-18L14,0L-22,18Z',
  NAND: 'M-26,-20H-2A20,20 0 0 1 -2,20H-26Z',
  NOR: 'M-26,-20Q-2,-20 18,0Q-2,20 -26,20Q-14,0 -26,-20Z',
  XNOR: 'M-26,-20Q-2,-20 18,0Q-2,20 -26,20Q-14,0 -26,-20Z M-33,-20Q-21,0 -33,20',
};
const TIP = { AND: 18, AND3: 18, NAND: 18, OR: 22, XOR: 22, NOR: 18, XNOR: 18, NOT: 14 };
// Bubble centre x for inverting gates.
const BUBBLE = { NOT: 18, NAND: 22, NOR: 22, XNOR: 22 };
export const bodyPath = (type) => BODY[type === 'AND3' ? 'AND' : type];
export const bubbleX = (type) => BUBBLE[type];
export const tipX = (type) => TIP[type];

export function GateIcon({ type }) {
  let inner;
  if (type === 'INPUT') inner = <><rect x="-26" y="-12" width="52" height="24" rx="12" /><circle cx="14" cy="0" r="6.5" fill="currentColor" stroke="none" /></>;
  else if (type === 'OUTPUT') inner = <><circle r="15" /><circle r="5" fill="currentColor" stroke="none" /></>;
  else {
    const ins = type === 'NOT' ? [0] : type === 'AND3' ? [-12, 0, 12] : [-9, 9];
    const bx = BUBBLE[type];
    const s = bx ? bx + 4 : TIP[type];
    inner = <>
      {ins.map((y) => <path key={y} d={`M-34,${y}H-24`} />)}
      <path d={bodyPath(type)} />
      {bx !== undefined && <circle cx={bx} cy="0" r="4" />}
      <path d={`M${s},0H${s + 10}`} />
    </>;
  }
  return <svg className="g h-[18px] w-[30px] flex-none text-gate" viewBox="-36 -22 76 44" aria-hidden="true">{inner}</svg>;
}
