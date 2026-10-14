# LocalMiniDrama Master Execution Plan

This is the single continuing plan for the product goal. Status is evidence-based and is updated with the ledger.

| ID | User-visible goal | Status | Next evidence |
|---|---|---|---|
| G1 | Create an original work and first episode | partial | Persisted work/source registration, real 3014 flow, review and export |
| G2 | Adapt a lawful test novel | partial | `adapted-intake` has source provenance and a real reviewed episode 1; adaptation batch episode 2 is paused on an incomplete Writer Session |
| G3 | Continue next episode and ranges | partial | Second real episode, pinned continuity, range batch evidence; deterministic routing now ready |
| G4 | Preserve continuity across episodes | implemented/tested | Real multi-episode content and producer quality review |
| G5 | Automatically review Writer output | partial | Real second-episode Editor result; bounded repair evidence |
| G6 | Natural-language revision | partial | Existing revision chain is real; connect next/range/revise UX without technical forms |
| G7 | Long-running reliable tasks | partial | SQLite recovery, pause/resume, explicit terminal retry, browser restart proof |
| G8 | Ordinary-user 3014 experience | partial | Work creation, episode progress, reading, review and export in Chromium; progress controls now exposed |
| G9 | Real isolated five-episode acceptance | partial | Real adapted episode 1 passed Writer→Editor; real range batch 2—5 was created and paused safely at episode 2 incomplete Writer, episodes 3—5 remain queued |

## Ordered work

1. **Foundation and records**: durable goal, plan, ledger; preserve current IDs and Runtime provenance. (in progress, this turn)
2. **Work intake**: add a persistent, provenance-aware original/adaptation work registration path using the existing SQLite and manifest boundary. Do not create a second Agent system.
3. **Natural-language execution**: route next episode, explicit range and known-total “remaining episodes” requests to existing candidate/batch services; clarify only when total range or major direction is unknown.
4. **Batch reliability**: finish atomic claiming, pause/resume, restart recovery, terminal-only bounded retry, and dependency invalidation tests.
5. **Review and export UX**: show per-episode candidate/review state, preserve approval boundary, and export only selected non-Canon drafts.
6. **Real isolated acceptance**: run one bounded real first episode, then a real second episode and a small five-episode sequence; record every call and quality check. Never use Rainforest as a test target.
7. **Novel adaptation acceptance**: import a short lawful fixture, retain source hash/rights note, generate and review one episode through the same pipeline.
8. **Product closeout**: browser evidence, independent review, regression, docs, commit, push, and remote verification.

## Decision rule

An external `incomplete` Session pauses only its dependent work. It does not block deterministic implementation, tests, browser work on existing evidence, or isolated fixtures. A replacement call is allowed only after explicit terminal evidence and only once for the attempt.
