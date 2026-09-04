// @sahaibat/identity · match.ts
// Decides whether two records are the same person, and how confident we are.
//
// THE ASYMMETRY THAT SHAPES EVERYTHING HERE. A duplicate person is an
// annoyance a supervisor can merge later. A false merge puts two women's
// pregnancies in one clinical record. So this never auto-merges on anything
// that could plausibly be two people — it hands those to the worker, who is
// standing in front of the patient and is a better disambiguator than any
// scoring function.

import { nameSimilarity } from './name';
import { normalisePhone } from './phone';

export type MatchTier =
  | 'auto'     // link silently — a false positive here is near-impossible
  | 'confirm'  // show the worker this candidate and let her decide
  | 'none';    // not a candidate

export interface PersonKeys {
  name?: string | null;
  nik?: string | null;
  phone?: string | null;
  dob?: string | null;        // YYYY-MM-DD
  ageYears?: number | null;
  regionId?: number | null;   // village
  motherName?: string | null; // "Siti anaknya Bu Rohmah" — a real field signal
}

export interface MatchResult {
  tier: MatchTier;
  score: number;              // 0..1, for ranking within a tier
  reasons: string[];          // why — surfaced to the worker and logged
}

function cleanNik(n: string | null | undefined): string | null {
  if (!n) return null;
  const d = String(n).replace(/\D/g, '');
  return d.length === 16 ? d : null;
}

function sameDob(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function ageClose(a?: number | null, b?: number | null, within = 2): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= within;
}

/**
 * `query` is what the worker has in front of her; `candidate` is a register row.
 */
export function matchPerson(query: PersonKeys, candidate: PersonKeys): MatchResult {
  const reasons: string[] = [];

  // ── Tier: auto, on NIK ─────────────────────────────────────────────────────
  // Unique by construction. The only identifier that stands alone.
  const qNik = cleanNik(query.nik);
  const cNik = cleanNik(candidate.nik);
  if (qNik && cNik) {
    if (qNik === cNik) return { tier: 'auto', score: 1, reasons: ['NIK sama'] };
    // Two valid, different NIKs are positive evidence of two people — and it
    // outranks any name similarity, which is the whole point of collecting it.
    return { tier: 'none', score: 0, reasons: ['NIK berbeda'] };
  }

  const nameScore = nameSimilarity(query.name, candidate.name);
  const qPhone = normalisePhone(query.phone);
  const cPhone = normalisePhone(candidate.phone);
  const phoneEq = !!qPhone && qPhone === cPhone;
  const dobEq = sameDob(query.dob, candidate.dob);
  const sameVillage =
    query.regionId != null && candidate.regionId != null &&
    query.regionId === candidate.regionId;
  const motherEq =
    !!query.motherName && !!candidate.motherName &&
    nameSimilarity(query.motherName, candidate.motherName) >= 0.85;

  // ── Tier: auto, on phone WITH a corroborator ───────────────────────────────
  // Phone alone is NOT enough and must never be. One handset routinely serves a
  // whole household in rural Indonesia, so a bare phone match happily unifies a
  // woman with her sister-in-law. It needs a second, independent signal.
  if (phoneEq) {
    if (dobEq) {
      return { tier: 'auto', score: 0.98, reasons: ['nomor HP sama', 'tanggal lahir sama'] };
    }
    if (nameScore >= 0.85) {
      return { tier: 'auto', score: 0.95, reasons: ['nomor HP sama', 'nama sangat mirip'] };
    }
    reasons.push('nomor HP sama (mungkin satu keluarga)');
    return {
      tier: 'confirm',
      score: 0.7 + 0.2 * nameScore,
      reasons: [...reasons, nameScore > 0 ? `nama mirip ${(nameScore * 100).toFixed(0)}%` : 'nama berbeda'],
    };
  }

  // ── Tier: confirm — name plus at least one corroborator ───────────────────
  // Never name alone, however close. In a population of mononyms, three women
  // called Siti in one village is ordinary.
  if (nameScore >= 0.7) {
    const corroborators: string[] = [];
    if (dobEq) corroborators.push('tanggal lahir sama');
    else if (ageClose(query.ageYears, candidate.ageYears)) corroborators.push('usia berdekatan');
    if (motherEq) corroborators.push('nama ibu sama');
    if (sameVillage) corroborators.push('desa sama');

    if (corroborators.length > 0) {
      const bonus = Math.min(0.15, 0.05 * corroborators.length);
      return {
        tier: 'confirm',
        score: Math.min(0.94, nameScore * 0.8 + bonus),
        reasons: [`nama mirip ${(nameScore * 100).toFixed(0)}%`, ...corroborators],
      };
    }
  }

  return { tier: 'none', score: nameScore * 0.5, reasons: [] };
}

/**
 * Rank candidates for the search list. Everything above 'none' is shown; the
 * caller decides how many. Sorted best-first.
 */
export function rankCandidates<T extends PersonKeys>(
  query: PersonKeys,
  candidates: T[]
): Array<{ candidate: T; match: MatchResult }> {
  return candidates
    .map((candidate) => ({ candidate, match: matchPerson(query, candidate) }))
    .filter((r) => r.match.tier !== 'none' || r.match.score > 0.15)
    .sort((a, b) => b.match.score - a.match.score);
}
