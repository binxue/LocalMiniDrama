# LocalMiniDrama Product Goal

## Outcome

LocalMiniDrama is a script-first workspace where an ordinary producer can use natural language to create an original short drama, adapt a lawful test novel, continue one episode or a range, request review and revision, read the resulting drafts, explicitly confirm a version, and export it. The front end presents works, conversation, episode scripts, progress, review summaries, and confirmation/export actions. Agent, Session, Task, Attempt, hashes, raw events, and recovery controls remain auditable but are advanced details.

## Non-negotiable boundaries

- Candidates and drafts never become Canon without explicit user confirmation.
- `CONDITIONAL PASS` is not approval and does not trigger Script Handoff or video production.
- Existing source, candidate, cost, Runtime, SQLite, and audit records are preserved.
- Every independent task has an isolated Session and immutable Task/Attempt identity.
- Unknown cloud state is recovered by read-only lookup before any bounded retry.
- Cross-episode context is pinned to an identified candidate and SHA-256.
- 3013 and the historical 5679 instance remain outside this product's write path.

## Acceptance gates

The long-term goal is accepted only when all of these have real evidence:

1. Original story idea to work context, first episode, review, revision, confirmation and export.
2. Lawful test novel import to an auditable adaptation plan and reviewable episode.
3. Real next-episode and range/batch creation with per-episode persistence and continuity checks.
4. A small isolated five-episode flow with real text, automatic Editor review, bounded retry, pause/resume and restart recovery.
5. 3014 browser evidence for natural-language creation, reading, review summary, refresh recovery and export.
6. Usage, cost-estimate status, missing-usage evidence and model/price provenance for each call.

Current status is tracked in `MASTER_EXECUTION_PLAN.md` and `EXECUTION_LEDGER.md`; this file is the durable product contract, not a claim that the gates have passed.
