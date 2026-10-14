# LocalMiniDrama isolated stage checkpoint

Date: 2026-10-15 (Asia/Shanghai). Stage: INCOMPLETE.

## Source and ownership

Formal source: H:/localminidrama-clean, branch
codex/localminidrama-provider-stabilization. Start HEAD and freshly fetched
feature remote: 2cbd9f47552c029c083e7492a9108f8cc2fa1e31.
The source had 76 Windows-native porcelain entries. WSL status additionally
misreports CRLF/LFS differences and must not be used to stage this source.
All inherited source changes remain outside this delivery.

Independent worktree: H:/localminidrama-rebuild, branch
codex/localminidrama-rebuild, rooted at the current feature commit rather
than replacing it with main. Existing main already contains the native
production surface; the feature adds real single-Agent adapters and
preservation logic. Runtime, dependencies and output are isolated.

Owned changes: explicit config path, environment-selectable Vite proxy and
strict port, snapshot/isolated startup tools, official coordinator payload,
bounded team verification tools, file-based Managed Agent message input,
corresponding focused tests and this checkpoint. No source worktree edits,
merge, reset, main push, source-service termination or source DB writes.

## Verified local result

Snapshot: runtime/snapshot.json. All 24 tables have identical row counts and
content hashes at snapshot time. All 24 copied media files have identical
SHA-256 hashes. Source remained unchanged during the snapshot; quick_check
passed for source and copy. No source credentials or row contents are emitted
by the snapshot report. Runtime stays ignored by Git.

Start with ./start-isolated.ps1. Frontend 3015; backend 5681; bind localhost.
Database and storage are under this worktree's runtime directory. Startup
uses SAFE_RESTART=1 to skip migrations, vendor sync, orphan marking and video
resume. Occupied ports cause an error; no process is killed.

HTTP health and proxied author page passed; browser displayed the retained
script, 2 project characters, 8 props, 8 scenes and 48 storyboard entries,
with original prompt editors, media and production controls. Backend offline
baseline: 120 tests passed. Frontend baseline: 10 tests passed; build passed.
Final backend regression including isolation/file-input checks: 122/122.
These establish bounded runnable evidence, not a paid native-production or
whole-scene acceptance claim.

## Official Multi Agent evidence and blocker

Read official body: https://ark.volcengine.com/region:cn-beijing/docs/multi-agent
(revision 625). Coordinator must carry Multiagent.Type=coordinator and pinned
child Agent versions; success requires main result, end_turn idle and ended
child threads, without terminated threads. HTTP receipt alone is insufficient.

Existing chief director agent-20261011103843-pr16z v4 has no Multiagent field.
Created separate coordinator agent-20261014170642-fd355 v1, then independently
read it back to runtime/coordinator-definition.json. Model unchanged from the
existing director; coordinator tools limited to read, no generation tool or
Skill. Pinned children: photographer nbhv3 v4, continuity 12siy v3,
visual inspector 0cx2g v3. Existing five Agents were not updated.

Team run: scene-team-eb2f3788-a354-420c-901a-18e35e4702d5.
Session: sesn-20261014170908-tmnat.
The first send could not launch its local subprocess (ENAMETOOLONG).
After verifying empty remote history and idle Session, the same reservation
and Session were retained for a single file-input submission attempt.
This attempt timed out at POST /api/v3/files. No user.message receipt,
main result or child execution proof was obtained. Recheck returned empty
event history; recent file list (20 entries, partial pagination) contains no
new identifiable upload from this attempt. A subsequent complete bounded
file-list traversal finished with has_more=false; it has no filename match
for the uploaded original identity reference. Do not substitute old generated
character images based on their similar names. Cloud upload acceptance and
Session/environment billing remain unknown. Do not resubmit this run.

Private evidence: runtime/evidence/<run_id>, runtime/team-verification.json,
runtime/team-events-after-upload-timeout.json and
runtime/recent-files-after-upload-timeout.json. The complete file-reuse audit
is runtime/file-reuse-audit.json. The initial long prompt and
error are preserved; bounded input drops historical audit payloads without
altering the original script or stored records.

## Production and budget

Lixia is characters.id=2; POV tourist is id=3. Preserve the uploaded original
identity reference and its active ModelArk asset. Neutral reference clothing
does not replace the scripted LOOK01 costume. Prior rejected images 31/35/36/37
are not permitted as identity anchors. First scene is existing shots 3/4/5/6,
not a new script or shot breakdown. Actual consecutive compliant media and
producer viewing acceptance have not been delivered.

Existing reservation 13 CNY plus team audit reservation 10 CNY = 23 CNY in the
same copied static_production_runs ledger. Budget cap 100 CNY, warning 80 CNY.
Reservation is not actual settlement. Actual new charge remains null; no
unknown reservation was released and no old ledger was cleared. No image or
video generation request was submitted by this stage.

## Next action

Resolve the current Files upload acceptance/transport using read-only evidence
and reusable existing file IDs with verified source identity. Retain the
current Session and UNKNOWN record. Complete real child-thread verification
and its bound native-workbench result before further media production. Then
continue original first-scene generation with identity/LOOK01/space/prop gates,
whole-scene review and an ordered preview. Never resume historical UNKNOWN
generation jobs or call paid video. Final producer acceptance is still pending.
