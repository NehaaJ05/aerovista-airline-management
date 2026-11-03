/**
 * Lightweight, offline text embedding for the MongoDB vector feature.
 *
 * Feature hashing ("hashing trick"): text -> tokens -> synonym-normalised
 * concepts -> FNV-1a hash into a fixed 128-dimension vector -> L2-normalised.
 * Cosine similarity between two vectors is then just their dot product.
 * No external API or model download is needed, so it works in an exam hall.
 * (Swap embedText() for a real model's output to upgrade; dimension is the
 * only thing the Atlas index cares about.)
 */
export const EMBEDDING_DIM = 128;

const CONCEPTS: Record<string, string[]> = {
  beach: ['beach', 'beaches', 'coast', 'coastal', 'sea', 'seaside', 'ocean', 'shore', 'waterfront', 'promenade', 'marina'],
  food: ['food', 'foodie', 'cuisine', 'eat', 'eating', 'restaurants', 'dining', 'street', 'biryani', 'dosa', 'chaat', 'kebabs', 'sweets', 'cafe', 'cafes', 'coffee', 'seafood'],
  history: ['history', 'historic', 'heritage', 'monument', 'monuments', 'fort', 'forts', 'palace', 'palaces', 'colonial', 'museum', 'museums', 'architecture', 'ancient', 'mughal', 'tomb'],
  nightlife: ['nightlife', 'pubs', 'pub', 'bars', 'bar', 'party', 'clubs', 'brewery', 'breweries', 'craft', 'beer', 'night'],
  business: ['business', 'tech', 'startup', 'startups', 'it', 'corporate', 'conference', 'work', 'office', 'finance', 'meetings'],
  nature: ['nature', 'gardens', 'garden', 'parks', 'park', 'lakes', 'lake', 'hills', 'green', 'botanical', 'wildlife', 'trek'],
  shopping: ['shopping', 'shop', 'markets', 'market', 'bazaar', 'bazaars', 'malls', 'pearls', 'silk', 'handloom'],
  culture: ['culture', 'cultural', 'art', 'arts', 'music', 'festival', 'festivals', 'temple', 'temples', 'spiritual', 'theatre', 'literature', 'classical', 'dance', 'film', 'bollywood', 'cinema'],
  weekend: ['weekend', 'getaway', 'short', 'quick', 'break', 'relax', 'relaxing'],
  weather: ['winter', 'summer', 'monsoon', 'pleasant', 'cool', 'weather', 'climate'],
};
const TO_CONCEPT = new Map<string, string>();
for (const [c, words] of Object.entries(CONCEPTS)) for (const w of words) TO_CONCEPT.set(w, c);

const STOP = new Set(['the','a','an','and','or','of','to','in','on','for','with','is','are','i','want','some','good','best','place','places','city','trip','visit','me','my','at','by','from','that','this','its','it\'s','be','great','lots']);

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

export function embedText(text: string): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0);
  for (const tok of tokenize(text)) {
    const concept = TO_CONCEPT.get(tok);
    if (concept) v[fnv1a('c:' + concept) % EMBEDDING_DIM] += 2;   // shared meaning
    v[fnv1a('w:' + tok) % EMBEDDING_DIM] += 1;                     // exact word
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm ? v.map((x) => Math.round((x / norm) * 1e6) / 1e6) : v;
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

export function guideText(g: { city?: string; title?: string; summary?: string; highlights?: string[]; tags?: string[]; best_time?: string }) {
  return [g.city, g.title, g.summary, ...(g.highlights ?? []), ...(g.tags ?? []), ...(g.tags ?? []), g.best_time].filter(Boolean).join(' ');
}
