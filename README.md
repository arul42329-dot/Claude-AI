# Claude-AI

MQL5 Expert Advisor work — **TITAN EDGE / RAGE SURGE / PHOENIX FLIP (Triple Mode) HFT** by Mr AP.

## Files

- [`EA/TITAN_TRIPLE_MODE_v39.mq5`](EA/TITAN_TRIPLE_MODE_v39.mq5) — current version (v39: signal-accuracy filter layer + trailing-stop bug fixes)
- [`EA/TITAN_TRIPLE_MODE_v38_original.mq5`](EA/TITAN_TRIPLE_MODE_v38_original.mq5) — original EA exactly as shared (rollback / A-B baseline)
- [`EA/CHANGELOG_v39.md`](EA/CHANGELOG_v39.md) — what changed, why, and how to tune & test it

## Quick start

1. Compile `TITAN_TRIPLE_MODE_v39.mq5` in MetaEditor (F7).
2. Read `EA/CHANGELOG_v39.md` section 3 (tuning) — the ATR band is inactive until you set symbol-appropriate values.
3. A/B test against the v38 original as described in section 4 before going live.
