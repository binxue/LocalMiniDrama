# M4.2 Independent Editor 执行链诊断

日期：2026-10-13  
范围：仅修复 Managed Agent 事件回查与状态恢复，不修改剧本、Canon、视频模块或其他仓库。

## 证据

- M4 原 Editor Task `mat_3dae9350-f419-48dc-99a4-d65ac67ccafa` / Session `sesn-20261012152610-rwdqe` 执行了 5 次模型请求（输入 46553、输出 5118、缓存读取 40984），最终只有 thinking/tool 事件，没有 `agent.message`。事件记录显示本地在 2026-10-12 15:31:17 发送了 `user.interrupt`，因此不能形成可验证审核结论。
- M4.1 恢复 Task `mat_f79ec999-af08-41b7-98a9-7c8c6d8e0b1d` / Session `sesn-20261012155634-9ce2u` 返回官方错误：`managed_agent.invoke_data_plane: Post .../events: request cancelled: context deadline exceeded (Client.Timeout exceeded while awaiting headers)`；没有正文或可计量用量。
- 成功的 Producer、Relationship Writer、Interactive Designer 任务使用同一 Managed Agent 入口，但任务较短，未同时触发本地轮询窗口、事件列表子进程超时和主动中断的组合。

## 已确认根因

`backend-node/src/services/managedAgentService.js` 原实现把 `events list` 的 CLI 子进程限制为 30 秒；`poll()` 的总窗口为 300 秒/40 次，并在模型请求错误或轮询耗尽时发送 `user.interrupt`。事件暂时取不到时，`execute()`/`refreshTask()` 又把本地状态归类为 failed/incomplete，造成云端仍可查询与本地失败状态混淆。证据支持“本地等待/状态同步链路过早中断”，不支持把模型能力或 Prompt 作为已证实根因。

## 最小修复

在 `managedAgentService.js`：

1. 为 `agent session events list` 使用显式 120000ms 子进程上限，仍保留总轮询上限。
2. 删除模型请求错误和轮询耗尽后的自动 `user.interrupt`，保留 Session 供恢复查询。
3. 事件回查暂时失败时保留任务可恢复状态并记录明确错误；只有云端显式失败/终止/错误事件才标记 failed。
4. 只有存在真实 `agent.message` 且 Session idle 时才标记 completed；每次回查继续保存事件、usage、正文哈希。

## 验证状态

- 后端测试：82/82 通过。
- 本轮未重新提交 Editor 调用，因此新增 Managed Agent 调用次数为 0、Token 为 0；历史两次 Editor 尝试的用量如上，第二次无可计量正文用量。
- 尚未取得新的有效 Editor 终态，不能宣称 M4 业务验收完成，也不能进入批准或 Canon 写入。
- 原始 M4/M4.1 证据保留在 Runtime evidence 目录；未提交数据库、日志、密钥或原始对话。

## 下一步

在人工确认继续后，先回查两个既有 Session；仅在确认均无可恢复 `agent.message` 时，最多进行一次有界 Editor 复审。取得真实终态后再做页面刷新恢复验收。

## M4.3 有界复审结果（2026-10-13）

- 两个既有 Session 回查结果：`sesn-20261012152610-rwdqe` 为 idle 但 `agent.message=0`；`sesn-20261012155634-9ce2u` 事件为空，均不可复用。
- 依据既有 Writer Task `mat_80054521-fcdc-4317-b8e1-ef15dfaf021b`，仅提交一次 Editor recovery：Task `mat_bbab0fca-52d7-4ee0-8ed8-bb643d1e4b42`。
- 新任务记录到 1 次模型请求，输入 8,286、输出 210、未完成请求 1；没有 `agent.message`，没有 PASS/CONDITIONAL PASS/FAIL。
- 事件最终为 `session.status_idle`，但事件中出现 `user.interrupt`。这证明 5688 当前运行进程未加载 M4.2 修复后的服务代码，不能把本次运行作为修复后链路验证；没有再次提交或重试。
- Revision 仍为 reviewing，候选正文与原稿均未修改，批准状态为 `not_approved`。由于没有有效 Editor 终态，浏览器业务验收和 M4 人工审阅准入仍未完成。

## M4.3 Session 隔离治理（2026-10-13）

### 修复

- `managed_agent_tasks` 兼容迁移新增 `attempt_id`、`episode_id`、`revision_id`、`source_sha256`、`candidate_sha256`、`context_hash`，并为非空 `session_id` 建立唯一索引。
- 新任务在 SQLite 事务中生成唯一 Attempt 并检查活动任务，避免并发重复提交；已有 Attempt 不得重复使用。
- 修订 Writer/Editor 任务显式绑定作品、集数、Revision、原稿/候选哈希和上下文哈希；Editor 不再只靠 Prompt 传递身份。
- 拒绝把 Windows 本地路径传入云端；refresh 只回查原 Session，不创建新 Session。

### 专项测试

- Managed Agent 隔离专项：4/4 通过，覆盖 Session 唯一绑定、跨版本字段、Attempt 重复保护和 Windows 路径拒绝。
- 后端全量测试需在本次提交前复跑；历史 82/82 通过记录保留。

### 真实隔离复审

- 旧 Session 回查仍无可用 `agent.message`。
- 仅创建一次新的独立 Editor Attempt：Task `mat_03fc8cc1-1196-49f5-a0ab-0a588f59c38e`，Session `sesn-20261012171207-70hzq`，Attempt `att_f9f06b07-b3ee-4a08-a31a-14af134e78b6`。
- 绑定：`revision_id=rev_e310cfe1-f800-4854-bbb6-b81573f30311`、`episode_id=ep3`、原稿 SHA `159d798d88fcc5fdfb35590612f7f20c1b3ca4ae203a3745fe6c6668bcf10c8f`、候选 SHA `116c4fdeff6ac0fe9051a8b9cde78f212933b771c2efda02ceddcb191225b1bf`。
- 有界等待后仍为 `running`，事件只有 session running、model request start、thinking 和 user.message，没有 `agent.message` 或可核验用量；未再次提交。
- 本次新增真实调用次数：1 个 Editor Session；截至停止检查，已记录的模型请求/Token 为 0 个可完成请求（请求仍未终态）。

### 结论

隔离绑定和防重复提交已落地，但 Independent Editor 仍未取得有效终态；M4 不能进入人工审阅准入，原稿、候选稿和 Canon 均未改变。

## M4 阻塞收口与运行版本（2026-10-13）

- 5688 原运行进程命令行为 `H:\localminidrama-active\backend-node\src/server.js`，曾使用配置版本 `1.2.8-m1`，但没有可辨识的代码构建标识。
- 停止旧进程后，以当前仓库代码、Runtime 工作目录和既有 Runtime 配置重新启动；`/health` 现返回 `managed_agent_build=m4.3-session-isolation-recovery` 及实际 `process_cwd`，可证明后续验收使用了修复代码。
- `recoverOnStartup()` 现在对已有 `session_id` 的活动任务标记 `awaiting_recovery`，不写 `completed_at`；没有云端 Session 的任务才标记 `interrupted`。
- 指定 Editor Task `mat_03fc8cc1-1196-49f5-a0ab-0a588f59c38e` 只读回查仍无 `agent.message`，没有有效审核结论；没有创建新任务。
- 浏览器中原稿/候选/差异的页面能力未能进入审核验收，因为 Revision 没有可验证 Editor 终态；不宣称刷新恢复业务通过。
