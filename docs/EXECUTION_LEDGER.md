# LocalMiniDrama Execution Ledger

## 2026-10-15 已交付：专业策划到正文和独立评定

现有灯塔邮局作品通过3014自然语言发起，复用已完成Producer、Relationship Writer、Interactive Designer结果，Writer完整收到10,490字符策划（实际输入11,297字符）。独立候选 `cand_bb291a3d-d770-4fb7-b35d-dba1ff545e21`：4,024字符、七场；SHA256 `a0f1ba54b0282085fd4f7690bc675bc4fe13b4cfa65d931dd2e6c4aa7fcb9ec5`。Editor `CONDITIONAL PASS`，approval=`not_approved`。批次 `batch_a08902cb-bc9f-4d3b-908c-9cf5987846e7` completed=1/1。

新增Writer用时215.156秒，输入13,290/输出7,092/缓存2,872；Editor用时244.616秒，输入15,842/输出7,479/缓存3,896；各1请求。总新增输入29,132+输出14,571=43,703 Token，缓存6,768为输入分类不重复累加；端到端461.536秒（7分41.5秒）。复用的历史策划三请求输入22,075、输出23,687、缓存11,688，不算本轮新增调用。价格未配置，金额未知。

浏览器验收：3014实际发送、展开专业方案、等待逐集保存、刷新、打开真实Editor与Markdown正文、点击导出并下载到 `I:/Downloads/第1集 · 候选稿-草稿.md`；导出包含完全一致正文，哈希核验一致。证据位于Runtime `evidence/20261015-delivery/3014-review.png`，正文/策划/审核均独立保存。浏览器启动时有两条连接中断历史日志；本轮读取/导出操作未观察新增业务错误，不能宣称从启动起Console零错误。

质量：策划七场、三户、钥匙当众保管、九点两闪得到落实。Editor指出看灯约定、回执来源、徒手接触、船期时间四问题；人工阅读另发现邮袋已经取信后场5仍写铅封完好，需后续定向修订。预计六分钟目标尚未实测，CONDITIONAL PASS不是拍摄质量通过。遵用户要求交付审核即停止，没有自动修订、批准或Canon。

当前唯一下一动作：用户对这份候选提出具体修改时复用已保存策划与Editor意见定向返修；此单集交付已完成。原生Multi Agent接入和可靠并行多集生产仍未验收，不宣称整平台完工。官方协调器与独立Session本地调度已在报告明确区分；不继续扩建本地Agent架构。


## 2026-10-14 — Producer planning snapshot integration

- 新集批次新增 `planning_status`、`planning_task_id`、`planning_output`、`planning_hash`、`planning_completed_at` 字段，兼容旧 SQLite；有 plan/outline/beat 资料时直接形成可追溯本地快照，否则只提交一次受控 Producer 策划任务。
- Story Writer 读取批次策划快照、本集相关资料和明确绑定的前集候选；Independent Editor 输入包含策划及专业成品检查清单。Producer/Writer/Editor 均约束单轮文本任务，禁止工具、Skill、文件和网络探查。
- 批次范围默认上限从 5 集调整为可配置 50 集，仍保持逐集保存、前集 SHA 连续性绑定、未知任务暂停恢复和候选不自动批准。恢复批次时先恢复 Producer 策划 Session，不会绕过策划直接提交 Writer。
- 回归验证：Node 101/101，前端 `npm run build` 通过；本轮未新增收费模型调用。当前真实创作阻断和成本未配置状态保持原记录，不宣称速度或成本改善。
- 后续接入了已有关系/互动/故事专家白名单：Producer 计划可选择标签；本地编排器在受控并发上限内提交最多两名专家，回收全部结果后再组合策划快照。每集 Writer 从策划文本按集号提取目标、节拍、场次、冲突与钩子段落。既有单集候选与批次共用该输入路径。
- 真实小规模验收：`acceptance-lighthouse` 第1集仅提交 Producer `mat_87968c7e-610e-48a6-b02a-80d12b95a6b1` / Session `sesn-20261014130906-2ouj7`，约205秒后仍为 `span.model_request_start`、无正文/usage；没有重复提交或伪造专家/Writer/Editor 成果。价格未配置，金额不宣称。
- 只读恢复该批次后，Relationship Writer `mat_e5ef4660-cdef-44fa-b16c-e2163ca1b0cc` / Session `sesn-20261014131249-1sgu7` 已真实完成，usage 为输入 8,109、输出 7,712、缓存读取 3,896、1 次请求；费用仍因模型价格未配置而不可计算。Interactive Designer 原任务在服务重启前未建 Session，恢复时创建一次受控替代 `mat_8f72f774-4bac-44f7-b9d0-6dcb167cdc9d`，当前仍为 running、usage=0；未提交 Writer/Editor，也未再次提交 Producer。批次保持 `planning_status=experts`、queued。

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
- Resume control was exercised once on the paused 2—5 batch. It performed read-only recovery of the existing episode 2 Writer and kept the batch `paused` with episode 2 `awaiting_recovery`; episodes 3—5 stayed queued and no new paid task was created.

## 2026-10-14 — batch recovery state hardening

- After restarting 5688 with the existing Runtime/SQLite, the adaptation batch was rechecked. Episode 2 is a real completed candidate with 4,730 characters, pinned to episode 1 candidate `cand_2bf3b7f1-0f34-4daf-8765-537ec8d89404`, Editor review present, and approval still `not_approved`.
- Fixed batch resume for legacy state written before predecessor SHA binding: before a cloud submission, the executor re-pins an unsubmitted candidate to the completed predecessor in the same batch. A failed candidate with no Writer task is reset to `queued`; candidates with any existing task remain recovery-only and are never duplicated.
- Restarted 5688 safely (PID `26780`, Runtime config `m1-independent-runtime-20261012`, health `ok`), preserving 3013, 5679, SQLite and historical tasks. One bounded episode 3 Writer attempt was submitted after the repair; it stopped at `span.model_request_start` with no message/usage, so the batch is correctly `paused`, episode 3 `awaiting_recovery`, and episodes 4–5 remain queued. No retry was submitted.
- Focused backend tests remain 12/12 and full Node tests 99/99; frontend build passed. The real two-episode text is readable through the 3014 API/route and refresh-safe; complete interactive Chromium Console/Network evidence remains unavailable in this environment and is not claimed.
- Frontend follow-up: candidate reading now exposes the stored Editor review in the same reading dialog and states that review is not approval. Natural-language “write next episode” now includes persisted episode candidates when calculating the next number, preventing a refreshed workspace from scheduling a duplicate episode. Full Node tests remain 99/99 and the frontend build passes.
- Runtime readback after the latest restart cleared stale error text from completed episode 2 batch item; it now displays `completed` with no error, while episode 3 remains explicitly `awaiting_recovery` and episodes 4–5 remain queued. Unknown-task evidence is preserved.
- Added regression coverage for completed candidates clearing stale batch errors without changing `completed_count`. Script Assistant tests are now 13/13; full Node suite is 100/100. No model call was made for this change.
- Read-only recovery later found a real episode 3 Writer正文 for the existing task `mat_34147ae7-d250-42df-b87d-034ef5e4d203`; the existing Editor task `mat_d3a24352-1e9d-4204-8678-390bf86a3377` completed with `CONDITIONAL PASS`. Candidate `cand_3c2a5053-2121-42f7-9b09-a4dae3916cad` has SHA `838cde55c38bca5a9b7ec097bc75c10f1f7307052c2e70dfc6a7e220d25d2cbf`, is pinned to episode 2 SHA `b8fe72719ea765601371b16e1f42ca3fe3456e0bdae18496440e2c51fef077ba`, and remains `not_approved`.
- Resumed the same batch without resubmitting episodes 2 or 3. The batch reached `2/4` (episodes 2 and 3 completed) and submitted exactly one episode 4 Writer `mat_32491ff1-20bf-43ee-8196-1f08d5794e2d`. It returned no verifiable正文 (`user.message`,正文=0), so episode 4 is `awaiting_recovery`, the batch is paused, and episode 5 remains queued. No retry was submitted.
- Final verification after this recovery: episodes 1–3 all have immutable candidate SHA values, episode 2 is pinned to episode 1, episode 3 is pinned to episode 2, and all three approvals remain `not_approved`. Full Node tests are 100/100 and frontend build passes.
- A subsequent read-only recovery of episode 4 confirmed the same cloud state (`user.message`,正文=0) and did not create a retry. A local evidence snapshot `backend-node/episodes-1-3-quality-evidence.json` preserves the three real candidate texts, SHA/continuity bindings, Editor reviews, and approval states for the pending producer quality review.
- The next read-only recovery of episode 4 did not resubmit Writer and returned the precise dependent state: `Editor 尚无可验证审核终态，批次保持暂停`. Episode 4 remains `awaiting_recovery`; this is not treated as a terminal failure or approval.

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
