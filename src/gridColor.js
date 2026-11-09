export function gridColor(token) {
  token = token.trim();
  // --dots is rgba in source CSS and hex after production minification.
  const hex = token.match(/^#([\da-f]{6})([\da-f]{2})?$/i);
  if (hex) {
    return { rgb: hex[1].match(/../g).map((h) => parseInt(h, 16)).join(','), a: hex[2] ? parseInt(hex[2], 16) / 255 : 1 };
  }
  const rgba = token.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*\.?\d+)\s*\)$/i);
  if (rgba) {
    const m = rgba.slice(1).map(Number);
    if (m.slice(0, 3).every((n) => n <= 255) && m[3] <= 1) return { rgb: m.slice(0, 3).join(','), a: m[3] };
  }
  return { rgb: '255,255,255', a: 0.075 };
}
