import { GATES } from './logic.js';

export const ORDER = ['INPUT', 'OUTPUT', null, 'NOT', 'AND', 'AND3', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR'];
export const TYPES = ORDER.filter(Boolean);
export const REPLACEABLE = ['NOT', 'AND', 'AND3', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR'];
export const KEYS = Object.fromEntries(TYPES.map((k) => [GATES[k].key, k]));
// Input, Output and the 3-input AND are translated by type key; gate symbols are not.
export const partName = (t, type) => (['INPUT', 'OUTPUT', 'AND3'].includes(type) ? t(`part.${type}`) : type);
