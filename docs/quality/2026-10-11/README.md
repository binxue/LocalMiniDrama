# LocalMiniDrama real-work evidence

Active source: H:\localminidrama-active, v1.2.8, codex/localminidrama-quality. Fork: binxue/LocalMiniDrama. Historical independent root ancestry is disclosed in delivery-audit.md; no shared history rewritten.

Isolated service: http://127.0.0.1:5687. Runtime cwd H:\localminidrama-runtime-20261011; configs/config.yaml; SQLite data/drama.db. Existing 5679 listener left untouched; its cwd/database are unproven. Use installed Node 22.22.2 (default Node 24 has incompatible SQLite ABI). Start with WEB_DIST_PATH pointing to source frontweb/dist and optional RESEARCH_CAPTURE_DIR pointing outside source; node -r <source>/backend-node/tools/capture-research-provider.js <source>/backend-node/src/server.js. Never commit runtime config, keys or database.

## Actual results

Native and enhanced use the same premise/model/temperature/token ceiling. Native Prompt is verified against official 755192a. Both complete three episodes, but realized lengths differ, and independent review rejects both commercial drafts. Enhanced improves action progression while harming factual credibility. Reconstruction and browser-final are disclosed event-redesign interventions, not fair same-input arms. Reviewed manuscript is an Agent Writer's complete human-style rewrite, not raw Provider output. No model superiority claim follows.

Readable manuscripts and exact hashes are in manifest.json. Raw requests/SSE remain in isolated Runtime; no authentication headers captured. Actual calls: four story generations plus character/scene extraction = six; no retries. Four measured calls total 31,441 tokens. Official 2026-10-11 off-peak estimate is $0.017342586 for measured calls only; two extraction usages unknown, so total charged cost is not asserted. See cost-ledger.json.

## Browser evidence

Real Generate button created and saved three episodes in project 4; original sample projects 1–3 remain. Editor title change/save/restore/reload passed on project 2. Real character and scene extraction yielded five/four persisted resources; refresh passed. Manual storyboard creation/prompt editor save was exercised, but rendered preview still says no image prompt: do not claim full storyboard prompt persistence accepted. Image/video generation was not executed; video-chain tests passed, paid production unverified. Project 5 contains separately labelled Agent-edited three-episode review draft; no Canon or author adoption.

Follow-up: optimized storyboard prompt was confirmed present in the re-opened editor after refresh. List preview incorrectly showed only image_prompt; fixed it to use polished_prompt first, matching actual image generation precedence. Build and real browser reload confirmed the saved prompt displayed. No paid image/video generation performed.

production-candidate.txt/json is a further Agent Writer revision, not a new Provider result. Project address/photo is a disclosed ordinary connecting detail added by that editor, not a fact evidenced in raw Provider output. Keep it outside Canon. Independent review remains the acceptance authority for this frozen candidate; commercial author acceptance is not implied.

Tests: backend 78/78, frontend 10/10; frontend build passed; research scripts syntax checks passed. Unrelated missing example ZIP and default-index defect preserved; independent index used. No production data or Zemora Novel modified.
