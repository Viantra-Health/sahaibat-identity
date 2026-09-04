// @sahaibat/identity · phone.ts
// Canonical Indonesian mobile numbers.
//
// Phone is the only identifier that unifies a person across Kader, Bidan,
// Kasih and DOK, so both sides of every comparison must reduce to the same
// string. This mirrors the normaliser that grew up inside familyRegistry;
// the server should migrate to this one so there is a single definition.

export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let p = String(raw).replace(/[\s\-()./]/g, '');
  if (!p) return null;

  // WhatsApp/Twilio prefixes leak into hand-entered fields.
  p = p.replace(/^whatsapp:/i, '');

  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '62' + p.slice(1);          // 0812… → 62812…
  else if (p.startsWith('8')) p = '62' + p;              // 812…  → 62812…

  if (!/^\d+$/.test(p)) return null;

  // Indonesian mobile numbers are 62 + 9 to 12 digits. Anything outside that is
  // a landline, a typo, or a test value — and a wrong number that still LOOKS
  // valid is worse than a rejected one, because it silently becomes a match key.
  if (!p.startsWith('62')) return null;
  const national = p.slice(2);
  if (national.length < 9 || national.length > 12) return null;
  if (!national.startsWith('8')) return null;            // all ID mobiles do

  return '+' + p;
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalisePhone(a);
  return !!na && na === normalisePhone(b);
}
