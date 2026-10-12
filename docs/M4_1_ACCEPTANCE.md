# M4.1 Independent Editor 恢复与复审

## 旧 Session 取证

旧 Editor Session `sesn-20261012152610-rwdqe` 已通过事件回查取得 `session.status_idle`，但事件中没有 `agent.message`，只有思考与工具调用。因此原任务 `mat_3dae9350-f419-48dc-99a4-d65ac67ccafa` 仍为不可验证的 `incomplete`，不能提取 PASS、CONDITIONAL PASS 或 FAIL。此前本地轮询在云端完成前发送了 `user.interrupt`，属于状态同步/轮询窗口问题，不是可用审核结果。

Writer 候选来自既有 Task `mat_80054521-fcdc-4317-b8e1-ef15dfaf021b`，原稿 SHA-256 为 `159d798d88fcc5fdfb35590612f7f20c1b3ca4ae203a3745fe6c6668bcf10c8f`。未重新调用 Story Writer。

## 一次恢复复审

新增只读回查接口不会重发旧任务；随后仅基于既有 Writer 候选发起一次结构化 Independent Editor 复审：

- 新 Editor Task：`mat_f79ec999-af08-41b7-98a9-7c8c6d8e0b1d`
- Session：`sesn-20261012155634-9ce2u`
- 输入：候选正文、原稿哈希、一次性 PASS/CONDITIONAL PASS/FAIL 要求，不读取文件、不调用工具
- 结果：`failed`，无正文、无裁定、无可用 token usage
- 官方错误：`managed_agent.invoke_data_plane: ... request cancelled: context deadline exceeded (Client.Timeout exceeded while awaiting headers)`

本次未继续重试。Revision `rev_e310cfe1-f800-4854-bbb6-b81573f30311` 仍未批准，原第三集 v2 未改，Canon 未写入。

## 业务结论

M4.1 尚未达到人工审阅准入条件，因为没有一次可验证的 Editor 终态。页面已有原稿哈希、候选差异文本、Task/Session 和失败状态；刷新恢复由现有 SQLite 记录支持。批准按钮只对 `completed` 修订开放，本轮没有批准记录。

后续应先解决 Independent Editor 数据面请求超时或使用可验证的官方服务状态，再进行一次新的有限复审；不得把旧 Session 或本次超时标为审核通过。
