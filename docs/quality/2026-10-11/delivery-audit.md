# LocalMiniDrama delivery audit — 2026-10-11

## Provenance

Source H:\localminidrama-active, branch codex/localminidrama-quality, HEAD 254a6034cf308db80c8d74ca5cf8a5babfad266a, origin https://github.com/binxue/LocalMiniDrama.git. Official comparison commit 755192a70517fa392e034c58f2e92da41e7fc56a. `git merge-base` finds no ancestor: inherited delivery commits are an independent root history, not an upstream descendant. HEAD tree differs from official only in story Prompt and its test (35 insertions, 4 deletions). No history repair performed.

Independent index used: .git/index-quality. Observed unrelated deletion example_drama/衣服设计天才302.zip and untracked task runner; neither staged by this audit.

Runtime baseline-promptI18n.js full file SHA256 6ea3c8f4be60f2565148eb18233159274f2948018f14324c61259faa7e78241c; official Prompt SHA256 25113401ffb24f16c08cf688f97af544ef28564a4102fb439a76a137bac3e3b4. Byte mismatch is line endings. Both story expansion functions are identical after CRLF→LF normalization. Saved native request system content also equals official getStoryExpansionSystemPrompt({},3) after line-ending normalization. Thus native story-generation Prompt has verified official provenance; full-file byte identity is not claimed. Temporary official source copy: runtime/official-promptI18n-audit.js.

## Actual call ledger

All three saved story requests use deepseek-flash, temperature 0.8, max_tokens 8192. All raw SSE finish_reason values are stop (no token truncation). These are native service outputs, not fixture scripts.

| Call | Prompt tokens | Completion tokens (including reasoning) | Reasoning tokens | Cache hit / miss | Total tokens | Elapsed ms |
|---|---:|---:|---:|---:|---:|---:|
| native original three episodes | 426 | 7495 | 5265 | 0 / 426 | 7921 | 52825 |
| enhanced three episodes | 544 | 7002 | 5310 | 0 / 544 | 7546 | 39158 |
| reconstructed three episodes | 1022 | 7386 | 6074 | 256 / 766 | 8408 | 34516 |
| Browser character extraction | unknown | unknown | unknown | unknown | unknown | unknown |
| Browser scene extraction | unknown | unknown | unknown | unknown | unknown | unknown |

Known story subtotal: input 1992, output 21883, total 23875 tokens; cache hit 256, cache miss 1736. Three story calls plus two paid UI extraction calls = at least five actual paid calls. UI extraction token usage/raw requests were not captured; must not treat them as free or invent usage. No retries observed in saved runner attempts. Reconstruction is a separately disclosed event-redesign input, not a same-input original/enhanced comparison arm.

Actual account billing and current official deepseek-flash price have not been independently verified. Therefore no numeric charged cost is asserted. Exact known-story estimate can be calculated as (1736 × uncached-input rate + 256 × cached-input rate + 21883 × output rate) / 1,000,000, plus the unmeasured extraction calls. Reasoning tokens are already included in completion tokens; do not double-count. A monetary total remains incomplete until trustworthy pricing/account evidence exists.

Raw SSE SHA256:
- native ca16b031f4ef7ead91a174f0fd7207892991ab2e45d5979382009cf17da31d1f
- enhanced dc62fdea686cfd21cf3875e695869e145fca5f25022e759d036c28ee192c0696
- reconstructed 2a3f4a4be1ae975fd0823e5dba1258cd1f8a04647c1d97201c94181de66bf691

## 5679 isolation boundary

Read-only Windows TCP evidence identifies listener PID 34700. Previous evidence identified relative command src/server.js. Win32_Process lookup did not establish cwd or SQLite path during this audit. Both remain UNKNOWN; neither process nor database was modified. A relative executable command is insufficient to infer engineering ownership. Isolated instance at 5687 uses runtime data/drama.db and remains the safe test boundary.

## Scope and honesty

Native/enhanced story length differs materially (954/962/1059 vs 894/678/661 characters); common requested length does not establish equal realized length. Reconstruction 540/576/526 is still shorter, so completeness/short-form content quality must be judged by actual reading, not valid=true (a parser/length threshold only). Original/enhanced independent review rejects commercial acceptance. No production adoption or commercial quality acceptance follows from this audit. No Provider call, key reading/output, source modification, staging, commit, or process termination performed.
