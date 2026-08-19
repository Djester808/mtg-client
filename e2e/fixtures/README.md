# AI deck builder replay fixtures

Recorded server output for the AI deck builder, so its screens can be driven and measured
without spending an AI call.

The builder is the most expensive path in the app: three Opus 5 calls per journey
(suggestions → build → assessment), around three minutes end to end. Because the model
reasons adaptively it consumes close to the whole token ceiling on every call — measured,
twice: a 6,000-token ceiling returned exactly 6,000, and a 16,000 ceiling returned exactly
16,000. A ceiling is the bill, not a cap. Driving a live build to check a tab strip or a
phone layout pays that price for an answer the client alone decides.

Only the network is faked. The SSE framing in `utils/sse.ts`, the service, the component's
stage/plan/final handling, the review tabs and the card modal all run for real.

## `ai-build-stream.sse`

A real recorded response from `POST /api/decks/{id}/ai-build/plan/stream`, captured
2026-08-19 for **Chief of the Wilds** on the brief "wolf tribal": 16 frames, 99 cards, no
shortfall and nothing rejected, in 156 seconds. It carries the intermediate `stage` frames
with their live `named` counts and the `assessment` in the `final` frame.

The deck itself is worth knowing, because it is the fixture's second job — it is the
evidence for the tribe-hint fix. It holds 22 Wolf and Werewolf creatures plus 8 cards that
pay off Wolves, a tribal density of 30 against the doctrine's threshold of 12 (§7). The
capture it replaced was taken before that fix and had almost none.

It is also the deck that shows the review list stacking: 36 lands, most of them repeats, so
the Lands tab draws 27 rows for 38 cards.

## `ai-build-suggestions.json`

Ten commanders. Every card field — name, mana cost, type line, oracle text, images, colour
identity, oracle ids — is real data from `/api/cards/search` (`t:legendary t:creature c:bg`,
filtered to exact `{B,G}` identity). The first tile is Chief of the Wilds, so clicking
straight through lands on the commander the recorded stream was actually built for.

Ten is deliberate: the shortlist is capped at twelve and had only ever been looked at with
four, so the fixture exercises the count the layout has to survive.

Three fields are authored rather than recorded, because in production the model writes
them: `reason`, `archetype`, `plan`. `owned` is alternated so the owned badge appears on
some tiles and not others, and `discarded: 2` with a populated `skippedByReason` is set on
purpose — the empty case was the only one ever rendered.

## Refreshing

```
node capture-ai-build.js --commander=<oracleId> --strategy="wolf tribal"
```

Records a new stream from a live build and rewrites `ai-build-stream.sse`. It costs one
real build, and it refuses to write a capture that came back with no cards. Worth doing
when the plan DTO gains a field, or when the recorded deck stops being representative. If
you change the commander, regenerate the shortlist too so the first tile still matches.
