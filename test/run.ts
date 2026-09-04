// @sahaibat/identity · test/run.ts
//   npx tsx test/run.ts
//
// No framework: this package has zero dependencies and should keep them.

import { normaliseName, nameSimilarity } from '../src/name';
import { normalisePhone } from '../src/phone';
import { matchPerson, rankCandidates } from '../src/match';

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass++;
  else failures.push(`${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else failures.push(label);
}
function gte(actual: number, min: number, label: string) {
  if (actual >= min) pass++;
  else failures.push(`${label}\n     expected >= ${min}, got ${actual.toFixed(3)}`);
}
function lt(actual: number, max: number, label: string) {
  if (actual < max) pass++;
  else failures.push(`${label}\n     expected < ${max}, got ${actual.toFixed(3)}`);
}

// ── normaliseName ────────────────────────────────────────────────────────────
eq(normaliseName('Siti Aminah'), 'siti aminah', 'basic lowercase');
eq(normaliseName('  Siti   Aminah  '), 'siti aminah', 'collapses whitespace');
eq(normaliseName('Bu Siti Aminah'), 'siti aminah', 'strips leading honorific');
eq(normaliseName('Ibu Hj. Siti'), 'siti', 'strips stacked honorifics');
eq(normaliseName('Bu'), 'bu', 'never strips the only token');
eq(normaliseName('M.Yusuf'), 'm yusuf', 'punctuation separates, not deletes');
eq(normaliseName('José'), 'jose', 'strips diacritics');
eq(normaliseName(''), '', 'empty is empty');
eq(normaliseName(null), '', 'null is empty');
eq(normaliseName('Siti 2'), 'siti', 'digits dropped');

// Old orthography — the four rules that cannot misfire
eq(normaliseName('Soekarno'), 'sukarno', 'oe → u');
eq(normaliseName('Tjipto'), 'cipto', 'tj → c');
// Documents a KNOWN limitation rather than hiding it: 'Tjahaja' becomes
// 'cahaja', not 'cahaya', because the trailing old-orthography j→y is the
// ambiguous rule we refuse to apply (it would turn Joko into Yoko). Names
// spelled this way are rare in modern registration data; if they turn up, add
// the specific word to VARIANTS rather than reinstating a blanket rule.
eq(normaliseName('Tjahaja'), 'cahaja', 'tj → c, but trailing j is left alone');
eq(normaliseName('Djoko'), 'joko', 'dj → j');
eq(normaliseName('Sjarif'), 'syarif', 'sj → sy');

// The rules deliberately NOT applied — these must survive untouched
eq(normaliseName('Joko'), 'joko', 'modern j is left alone (not → yoko)');
eq(normaliseName('Anjani'), 'anjani', 'modern nj is left alone (not → anyani)');

// Variant families
eq(normaliseName('Mohammad Yusup'), 'muhammad yusuf', 'variant collapse, both tokens');
eq(normaliseName('Muhamad'), 'muhammad', 'muhamad → muhammad');
eq(normaliseName('Achmad'), 'ahmad', 'achmad → ahmad');
eq(normaliseName('Noor Aisah'), 'nur aisyah', 'nur + aisyah families');
ok(normaliseName('M') === 'm', 'single initial is NOT expanded to muhammad');

// ── nameSimilarity ───────────────────────────────────────────────────────────
eq(nameSimilarity('Siti Aminah', 'Siti Aminah'), 1, 'identical → 1');
gte(nameSimilarity('Siti Aminah', 'siti  aminah'), 1, 'whitespace-insensitive');
gte(nameSimilarity('Mohammad Yusup', 'Muhamad Yusuf'), 0.99, 'variants score as identical');
gte(nameSimilarity('Siti Aminah', 'Aminah Siti'), 0.99, 'token order does not matter');
gte(nameSimilarity('Siti', 'Siti Aminah'), 0.7, 'partial name still surfaces the full record');
gte(nameSimilarity('Aminah', 'Aminh'), 0.6, 'typo inside a token still matches');
lt(nameSimilarity('Siti Aminah', 'Siti Nurhaliza'), 0.85, 'shared first token is not a match');
lt(nameSimilarity('Budi', 'Siti'), 0.4, 'unrelated names score low');
eq(nameSimilarity('', 'Siti'), 0, 'empty scores 0');

// ── normalisePhone ───────────────────────────────────────────────────────────
eq(normalisePhone('081234567890'), '+6281234567890', 'leading 0');
eq(normalisePhone('6281234567890'), '+6281234567890', 'leading 62');
eq(normalisePhone('+6281234567890'), '+6281234567890', 'already canonical');
eq(normalisePhone('0812-3456-7890'), '+6281234567890', 'dashes');
eq(normalisePhone('0812 3456 7890'), '+6281234567890', 'spaces');
eq(normalisePhone('81234567890'), '+6281234567890', 'bare 8 prefix');
eq(normalisePhone('whatsapp:+6281234567890'), '+6281234567890', 'strips whatsapp: prefix');
eq(normalisePhone('021555000'), null, 'landline rejected');
eq(normalisePhone('123'), null, 'too short rejected');
eq(normalisePhone('abc'), null, 'non-numeric rejected');
eq(normalisePhone(null), null, 'null');
eq(normalisePhone(''), null, 'empty');

// ── matchPerson ──────────────────────────────────────────────────────────────
const NIK_A = '3201234567890001';
const NIK_B = '3201234567890002';

eq(
  matchPerson({ name: 'Siti', nik: NIK_A }, { name: 'Completely Different', nik: NIK_A }).tier,
  'auto',
  'same NIK → auto, whatever the name says'
);
eq(
  matchPerson({ name: 'Siti Aminah', nik: NIK_A }, { name: 'Siti Aminah', nik: NIK_B }).tier,
  'none',
  'different NIKs → none, and it outranks an identical name'
);

// Phone alone must never auto-merge: households share one handset.
eq(
  matchPerson(
    { name: 'Siti Aminah', phone: '081234567890' },
    { name: 'Rohmah Wati', phone: '081234567890' }
  ).tier,
  'confirm',
  'shared handset, different names → confirm, never auto'
);
eq(
  matchPerson(
    { name: 'Siti Aminah', phone: '081234567890', dob: '1998-05-15' },
    { name: 'Siti Aminah', phone: '0812-3456-7890', dob: '1998-05-15' }
  ).tier,
  'auto',
  'phone + DOB → auto'
);
eq(
  matchPerson(
    { name: 'Mohammad Yusup', phone: '081234567890' },
    { name: 'Muhamad Yusuf', phone: '081234567890' }
  ).tier,
  'auto',
  'phone + strong name → auto'
);

// Name alone is never enough, however close.
eq(
  matchPerson({ name: 'Siti Aminah' }, { name: 'Siti Aminah' }).tier,
  'none',
  'identical name with no corroborator → none'
);
eq(
  matchPerson(
    { name: 'Siti Aminah', regionId: 12 },
    { name: 'Siti Aminah', regionId: 12 }
  ).tier,
  'confirm',
  'name + same village → confirm'
);
eq(
  matchPerson(
    { name: 'Siti Aminah', regionId: 12 },
    { name: 'Siti Aminah', regionId: 99 }
  ).tier,
  'none',
  'same name, different village → not a candidate'
);
eq(
  matchPerson(
    { name: 'Siti', motherName: 'Rohmah' },
    { name: 'Siti Aminah', motherName: 'Bu Rohmah' }
  ).tier,
  'confirm',
  "mother's name corroborates — 'Siti anaknya Bu Rohmah'"
);
eq(
  matchPerson(
    { name: 'Siti Aminah', ageYears: 26 },
    { name: 'Siti Aminah', ageYears: 27 }
  ).tier,
  'confirm',
  'close age corroborates'
);
eq(
  matchPerson(
    { name: 'Siti Aminah', ageYears: 26 },
    { name: 'Siti Aminah', ageYears: 45 }
  ).tier,
  'none',
  'far apart in age → not the same person'
);

// ── rankCandidates: the "five Sitis" case ────────────────────────────────────
const query = { name: 'Siti', regionId: 12, motherName: 'Rohmah' };
const register = [
  { id: 'a', name: 'Siti Aminah',    regionId: 12, motherName: 'Bu Rohmah' },
  { id: 'b', name: 'Siti Nurhaliza', regionId: 12, motherName: 'Bu Yani'   },
  { id: 'c', name: 'Siti',           regionId: 99, motherName: null        },
  { id: 'd', name: 'Budi Santoso',   regionId: 12, motherName: null        },
];
const ranked = rankCandidates(query, register);
eq(ranked[0].candidate.id, 'a', 'the right Siti ranks first');
ok(ranked.every((r) => r.candidate.id !== 'd'), 'unrelated name excluded');
ok(ranked[0].match.reasons.length > 0, 'top hit explains why it matched');

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('  all green\n');
