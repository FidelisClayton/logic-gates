let n = 0;
export const newId = (p = 'n') => p + Date.now().toString(36) + (n++).toString(36);
