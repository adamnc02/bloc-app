// A seeded random source for the demo clients (TECHNICAL §164): the same seed gives
// the same numbers on every run, in every runtime. Seeds are strings such as
// `maya:37` (persona and day of the story), never a calendar date.

/** FNV-1a hash of a string, as a 32-bit seed. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 over the seed's hash: numbers in [0, 1). */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
