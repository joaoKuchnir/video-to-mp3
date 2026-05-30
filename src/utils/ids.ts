// Tiny ID generator. Monotonic per-session, collision-proof inside a single
// browser tab. Not cryptographic — domain doesn't need it.

let counter = 0;

export const newId = (prefix = "dl"): string => `${prefix}-${Date.now()}-${counter++}`;
