# @sahaibat/identity

Person-matching primitives shared by the SahAIbat server and the field apps.
Pure functions: no I/O, no config, no dependencies.

```ts
import { normaliseName, nameSimilarity, normalisePhone, matchPerson } from '@sahaibat/identity';
```

## Why it is a package

The server (`sahaibat-healthcare`) and the field apps (`sahaibat-kader`,
`sahaibat-bidan`) both have to answer "is this the same person?". If they
answer differently, a worker's offline search and the server's sync-time match
disagree about who already exists — which produces exactly the duplicates the
matching is meant to prevent. One definition, imported everywhere.

## The rule that shapes the design

A duplicate person is an annoyance a supervisor can merge later. A false merge
puts two women's pregnancies in one clinical record. So matching is
deliberately asymmetric:

| Tier | Meaning | Requires |
|---|---|---|
| `auto` | link silently | NIK, or phone **plus** a corroborator |
| `confirm` | show the worker, let her decide | name **plus** a corroborator |
| `none` | not a candidate | anything weaker |

Name alone never matches, however close — in a population of mononyms, three
women called Siti in one village is ordinary. Phone alone never auto-merges
either: one handset routinely serves a whole household.

## Name normalisation

Applies the four old-orthography rules that cannot misfire (`oe→u`, `tj→c`,
`dj→j`, `sj→sy`), strips leading honorifics, collapses spelling variants
(Mohammad/Muhamad/Mochamad), and compares as a token set so "Siti Aminah" and
"Aminah Siti" are the same person.

It deliberately does **not** apply `j→y` or `nj→ny`. Those are correct for old
spellings and wrong for modern ones, and nothing in the string distinguishes
them — a blanket rule turns Joko into Yoko. Add specific words to the variant
table instead.

## Tests

```
npm test
```

No framework, 57 assertions, real Indonesian name cases.

## Install

```json
"@sahaibat/identity": "github:Viantra-Health/sahaibat-identity"
```

Source-only, like `@sahaibat/growth-engine`. Consumers add it to
`transpilePackages` in `next.config.js`.

Note: npm cloning a **private** GitHub dependency needs a token that Vercel
does not supply automatically. `@sahaibat/growth-engine` works on Vercel today
because it is public — this repo needs to be public too, or the Bidan build
needs a PAT in its environment.
