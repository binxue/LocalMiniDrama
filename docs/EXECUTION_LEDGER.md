# LocalMiniDrama Execution Ledger

## 2026-10-14 — baseline handoff

- Repository: `binxue/LocalMiniDrama`; branch: `codex/localminidrama-quality`.
- HEAD at handoff: `c7e540cdba61e9f9ac7a16361531d558f12a13bc`; remote branch matched after fetch.
- Dirty files pre-existing and preserved: cost ledger, historical UI edits, deleted example ZIP, Runtime logs/request fixtures and comparison tool.
- 5688 current process: PID `27404`, `H:\localminidrama-active\backend-node`, Runtime config `m1-independent-runtime-20261012`, health build `m4.3-session-isolation-recovery`. 3014 returned HTTP 200; 3013 and 5679 preserved.

## Completed evidence

- Producer conversation and existing Revision chain are real and persisted.
- First isolated episode candidate `cand_f97b6eb3-b6bb-4564-9c2e-9fce640ee3a3`: real Writer output about 6,011 characters, SHA-256 `8aa06a0d55d9656e79d9ede65a8ef934f3d02cb5cd7b8a8b3e03e018f0adff75`; Editor returned `CONDITIONAL PASS`; approval remains `not_approved`.
- Candidate/batch persistence, pinned continuity IDs/hashes, read-only recovery, conditional completion counts, and terminal-only retry are implemented. Backend regression suite: 95/95.
- Retry of second episode is correctly refused while original task is `incomplete` without a cloud terminal event.
- 3014 progress UI now exposes user-language batch states, pause/continue, read-only recovery, and candidate draft export; the backend intent classifier routes explicit episode ranges and “next episode” as executable requests without a model call. Frontend build passed and script-assistant regression tests remain green.
- When a continuity/core source explicitly contains `共 N 集`, `写全集` now routes to the remaining range; without that declaration the API conservatively asks for the total instead of guessing. The isolated acceptance manifest currently has no such declaration, so its real endpoint correctly remains clarification-required.

## Open evidence and blockers

- Second episode Task `mat_177d7139-fca6-4b3c-a83c-75682a586060`, Session `sesn-20261014043634-864i3`: `incomplete`, no `agent.message`, no正文, no Editor; candidate remains `awaiting_recovery`.
- Real two-episode continuity, five-episode flow, original/adaptation intake, and complete Chromium acceptance are not passed.
- 5688 was restarted after the source change; current PID is `4784`, health build remains `m4.3-session-isolation-recovery`, and explicit range routing is live. No Agent call was needed for that restart.
- Model price is unconfigured. New calls must record token usage; unknown cost must remain explicit.

## Current action

## 2026-10-14 — lawful adaptation and range batch evidence

- Real lawful test adaptation completed for `adapted-intake`: candidate `cand_2bf3b7f1-0f34-4daf-8765-537ec8d89404`, Writer task/session `mat_41339582-b6ed-4bc3-bc82-a9a208943326` / `sesn-20261014095104-0mmg4`, Editor task/session `mat_e7ceda50-f254-410f-a92e-00bab3f52eec` / `sesn-20261014095348-368dw`, candidate SHA `1c8b56fa5196a2861a349d023fa278fc393becd7442014e2a55a48b0c1317234`, real `CONDITIONAL PASS`, approval `not_approved`.
- Fixed review parsing for the valid Chinese heading `评定：CONDITIONAL PASS`; the already completed Editor task was reused through recovery and the candidate became `completed`. Added a regression test; no extra Editor call was made.
- Started real batch `batch_95d4741c-7912-4a5e-82ac-f1cb115e2104` for episodes 2—5. Episode 2 Writer `mat_dd4b6347-c934-48de-9057-f17a4be067a1` / Session `sesn-20261014100336-85kz2` stopped at `span.model_request_start` with no正文 and one unfinished request. The batch is correctly `paused`; item 2 is `awaiting_recovery`, items 3—5 remain `queued`; no retry was submitted.
- New measured usage: adaptation episode 1 Writer 5,533 input / 4,981 output / 4,920 cache-read; Editor 8,183 / 6,620 / 3,896; episode 2 Writer 0 / 0 / 0 with one unfinished request. Price remains unconfigured.
- Frontend review found the same localization edge in `ScriptAssistant.vue`: `评定：CONDITIONAL PASS` was previously shown as an unverified verdict. Added `评定` to the UI parser, rebuilt successfully, and reopened the 3014 adaptation workspace. API evidence shows the candidate is completed with the real review and `not_approved` after refresh.

## 2026-10-14 — batch recovery state hardening

- Fixed `executeBatch` so an episode candidate in `awaiting_recovery` pauses the batch and item with resumable evidence instead of being converted to permanent `failed` by the outer catch. Completed items remain counted once through the existing conditional update. Added a regression test for the paused batch state.
- Restarted 5688 with the retained Runtime config at `H:\localminidrama-runtime-creative-20261011-source\evidence\m1-independent-runtime-20261012\config.yaml`; health reports `m4.3-session-isolation-recovery`, process cwd `H:\localminidrama-active\backend-node`, PID `2744`. 3014 returned HTTP 200; 3013 and historical 5679 remained running.
- Read-only verification after restart: episode 1 candidate `cand_583f67be-273d-47df-afe8-5e0e0e8cd7f6` remains completed with real Writer/Editor output and `not_approved`; episode 2 candidate `cand_6a8f276e-630b-4072-9577-349a3c5f4c58` remains `awaiting_recovery`, Writer `mat_ece67f91-c3ff-4289-9273-ba000ee310ba` / Session `sesn-20261014085621-rcat2` remains incomplete with one unfinished request and no正文. No new Agent call was submitted.
- Focused Script Assistant tests: 12/12; frontend build passed. Full two-episode real continuity, batch browser interaction, adaptation Writer/Editor acceptance and Chromium console evidence remain open; no claim of product completion is made.

Persistent original/adaptation intake is implemented and API-verified on isolated works `acceptance-intake` and `adapted-intake`; frontend build and Script Assistant route load pass. First isolated work episode 1 completed with real Writer and controlled Editor: candidate `cand_583f67be-273d-47df-afe8-5e0e0e8cd7f6`, candidate SHA `7e424d71a21beee5bc61983f8d97aad5111895364b55f594fa34149035671acd`, Editor `CONDITIONAL PASS`, approval `not_approved`. The first Editor attempt was preserved as incomplete after four tool-seeking requests; the bounded controlled retry completed with one request and five evidence items. The second episode candidate `cand_6a8f276e-630b-4072-9577-349a3c5f4c58` is pinned to episode 1 candidate/SHA but its sole Writer session `sesn-20261014085621-rcat2` remains `incomplete` with one unfinished model request and no正文; read-only recovery confirmed the same state and no retry was submitted. Current code commit `c8d918c` controls both episode Writer and Editor sessions and bounds Editor recovery to one retry; 17 focused backend tests pass. Next action is deterministic batch/restart/UI evidence and lawful adaptation acceptance without touching Rainforest Canon, frozen text, 3013, or historical records.

## 2026-10-14 — isolated creative evidence

- Episode 1 Writer task `mat_3c054c5b-8554-4560-b1ae-b0a7d952c829`: completed, 5,506 input / 7,596 output / 3,896 cache-read tokens, one request; output 3,061 characters.
- Episode 1 first Editor task `mat_dad1d721-8171-44b8-8a98-9dc832496712`: incomplete, four requests, 39,398 input / 9,699 output / 27,048 cache-read tokens, one unfinished request; events show tool exploration and no final message. Preserved as failed evidence.
- Episode 1 controlled Editor retry `mat_4f9d24ba-6632-4157-9dc0-cd9bbaed365a`: completed `CONDITIONAL PASS`, one request, 7,597 input / 6,162 output / 3,896 cache-read tokens. Price remains unconfigured; no amount is claimed.
- Episode 2 Writer task `mat_ece67f91-c3ff-4289-9273-ba000ee310ba`: incomplete, one unfinished request, no output or terminal event. Recovery endpoint returned `Writer云端任务未完成`; no new task was created.
