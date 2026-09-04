// @sahaibat/identity · name.ts
// Indonesian name normalisation and comparison. Pure — no I/O, no config.
//
// Used by BOTH the server (familyRegistry) and the field apps (offline search).
// If the two ever normalise differently they will disagree about who exists,
// which is why this lives in a package rather than being written twice.

// ── Honorifics ───────────────────────────────────────────────────────────────
// Stripped only from the FRONT, and only while something remains. "Bu Siti" is
// Siti; a woman actually recorded as "Bu" alone keeps it rather than becoming
// an empty string.
const HONORIFICS = new Set([
  'bu', 'ibu', 'pak', 'bapak', 'mba', 'mbak', 'mas',
  'ny', 'nyonya', 'tn', 'tuan', 'sdr', 'sdri',
  'hj', 'h', 'dr', 'drg', 'ns', 'br', 'bd',
]);

// ── Old orthography (Ejaan Van Ophuijsen) → modern (EYD, 1972) ───────────────
// ONLY the unambiguous rules. Deliberately excluded:
//
//   j  → y   "Djoko" normalises to "joko"; a blanket j→y would then produce
//            "yoko". Modern j is /dʒ/, old j was /j/, and nothing in the string
//            tells them apart.
//   nj → ny  "Njonja" → "nyonya" is right, but "Anjani" → "anyani" is wrong —
//            modern nj is n+j.
//   ch → kh  "ch" appears in modern loanwords. Handled in VARIANTS instead,
//            where Achmad/Ahmad can be mapped without touching everything else.
//
// The four kept below have no modern Indonesian usage, so they cannot misfire.
const SPELLING: Array<[RegExp, string]> = [
  [/oe/g, 'u'],   // Soekarno  → sukarno
  [/tj/g, 'c'],   // Tjipto    → cipto
  [/dj/g, 'j'],   // Djoko     → joko
  [/sj/g, 'sy'],  // Sjarif    → syarif
];

// ── Variant families ─────────────────────────────────────────────────────────
// Spelling variants of the SAME name, collapsed to one canonical token so that
// "Muhamad Yusup" and "Mohammad Yusuf" compare as equal.
//
// Conservative on purpose: multi-character forms only. Single letters and very
// short abbreviations ("M.", "St.") are excluded — "M" could be Muhammad or
// Maria or an initial, and guessing merges strangers.
const VARIANTS: Record<string, string> = {};
function family(canonical: string, ...forms: string[]) {
  for (const f of [canonical, ...forms]) VARIANTS[f] = canonical;
}
family('muhammad', 'muhamad', 'mohammad', 'mohamad', 'mochamad', 'mochammad', 'muchamad', 'muhammed');
family('ahmad', 'achmad', 'akhmad', 'ahmed');
family('siti', 'sitti', 'syiti');
family('nur', 'noor', 'nor');
family('abdul', 'abdoel', 'abdull');
family('aisyah', 'aisah', 'aishah', 'aisyiah');
family('yusuf', 'yusup', 'jusuf', 'yusuff');
family('rahmat', 'rachmat', 'rakhmat');
family('sulaiman', 'sulaeman', 'suleman');
family('khadijah', 'khodijah', 'hadijah');
family('maryam', 'mariam', 'maryamah');
family('fatimah', 'fatimatun', 'patimah');
family('ramadhan', 'ramadan', 'romadhon');
family('syarif', 'sarif', 'syarief');
family('wulandari', 'wulan');
family('setiawan', 'setyawan');
family('cahyani', 'tjahjani');

// ── Core normalisation ───────────────────────────────────────────────────────
export function normaliseName(raw: string | null | undefined): string {
  if (!raw) return '';
  let t = String(raw).toLowerCase();

  // Strip diacritics (é → e) without touching the base letters.
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Punctuation and digits become separators, not deletions: "Siti/Aminah"
  // is two tokens, and "M.Yusuf" is two, not "myusuf".
  t = t.replace(/[^a-z\s]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return '';

  for (const [re, to] of SPELLING) t = t.replace(re, to);

  let tokens = t.split(' ').filter(Boolean);

  // Leading honorifics only, and never all of them.
  while (tokens.length > 1 && HONORIFICS.has(tokens[0])) tokens.shift();

  tokens = tokens.map((tok) => VARIANTS[tok] ?? tok);

  return tokens.join(' ');
}

export function nameTokens(raw: string | null | undefined): string[] {
  const n = normaliseName(raw);
  return n ? n.split(' ') : [];
}

// ── Similarity ───────────────────────────────────────────────────────────────
// Indonesian names are token sets, not ordered first/last pairs: the same woman
// is recorded as "Siti Aminah", "Aminah", and "Aminah Siti". So the primary
// signal is token overlap, and trigrams only rescue typos WITHIN a token
// ("aminah" vs "aminh").

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** Best trigram similarity of `tok` against any token in `pool`. */
function bestTokenMatch(tok: string, pool: string[]): number {
  let best = 0;
  const tg = trigrams(tok);
  for (const other of pool) {
    if (tok === other) return 1;
    best = Math.max(best, dice(tg, trigrams(other)));
  }
  return best;
}

/**
 * 0..1. 1 means the same normalised token set.
 *
 * Asymmetry is deliberate on the SHORTER side: "Siti" against "Siti Aminah"
 * scores high, because a register holding a full name should still surface for
 * a worker who typed only part of it. Being too strict here is what sends her
 * to "register new" and creates the duplicate.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];

  // Every token on the shorter side needs a home on the longer side.
  let total = 0;
  for (const tok of short) total += bestTokenMatch(tok, long);
  const coverage = total / short.length;

  // Extra tokens on the longer side dilute, but only mildly — one shared
  // distinctive name is meaningful evidence even amid other differences.
  const lengthPenalty = short.length / long.length;
  return coverage * (0.75 + 0.25 * lengthPenalty);
}

/** Does this look like the same person by name alone? Never sufficient by itself. */
export function isStrongNameMatch(a: string, b: string): boolean {
  return nameSimilarity(a, b) >= 0.85;
}
