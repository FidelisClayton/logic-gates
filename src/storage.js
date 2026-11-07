// localStorage can throw (private mode, blocked data), so every access is wrapped.
const P = 'logic-gates:';
export function load(key) {
  try { return localStorage.getItem(P + key); } catch { return null; }
}
export function save(key, value) {
  try { localStorage.setItem(P + key, value); } catch { /* storage unavailable: the app still works */ }
}
