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
