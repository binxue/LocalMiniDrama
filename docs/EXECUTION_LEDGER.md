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

## Open evidence and blockers

- Second episode Task `mat_177d7139-fca6-4b3c-a83c-75682a586060`, Session `sesn-20261014043634-864i3`: `incomplete`, no `agent.message`, no正文, no Editor; candidate remains `awaiting_recovery`.
- Real two-episode continuity, five-episode flow, original/adaptation intake, and complete Chromium acceptance are not passed.
- The current 5688 process must be restarted after this source change before browser execution can observe the updated intent routing; no Agent call is needed for that restart.
- Model price is unconfigured. New calls must record token usage; unknown cost must remain explicit.

## Current action

Implement and test persistent original/adaptation work intake and the smallest natural-language routing gaps that do not call the blocked second-episode Session. Then update this ledger with tests and browser evidence. Do not touch Rainforest Canon, frozen text, 3013, or historical records.
