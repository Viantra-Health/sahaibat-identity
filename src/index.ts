// @sahaibat/identity
// Shared person-matching primitives. Pure functions, no I/O, no config.
//
// Imported by the server (sahaibat-healthcare) and by the field apps, so that
// "is this the same person?" has exactly one answer everywhere.

export { normaliseName, nameTokens, nameSimilarity, isStrongNameMatch } from './name';
export { normalisePhone, samePhone } from './phone';
export { matchPerson, rankCandidates } from './match';
export type { MatchTier, MatchResult, PersonKeys } from './match';
