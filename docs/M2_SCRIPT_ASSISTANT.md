# M2 AI 剧本创作助手

## 范围

M2 在现有 LocalMiniDrama 工作台中增加 `/script-assistant` Producer 对话入口。它复用 M1 Managed Agent 服务，只允许讨论与建议，不写入 Canon、不修改正式剧本，也不启动 Writer、Relationship、Interactive 或 Editor 协作。

作品上下文来自服务端配置的真实资料索引。服务端读取并校验来源 SHA-256，向 Producer 发送有行号的原文片段，并在回答中要求使用 `[S:source-id:Lx-y]` 引用。候选版本、Editor 结论、人工批准和 Canon 状态在上下文中分开表示。

用户消息、任务关联和上下文快照保存到现有 SQLite 数据库。刷新页面或重启前端后，历史消息通过后端重新读取；云端任务状态、Session、模型、输出、用量和错误沿用 M1 任务表。

## 真实验收

- Producer Agent：`agent-20261011131513-17rey`
- Task：`mat_f4854006-f51a-4556-ba2e-12fb4b68d5cc`
- Session：`sesn-20261012125418-ajw2e`
- 状态：`completed`
- 模型：`doubao-seed-evolving-latest-version`
- 用量：输入 `22816`，输出 `2706`，缓存读取 `10040`，2 requests，missing usage `0`
- 输入 SHA-256：`b0db3c089a216051356062323293c44abfd244cd7935ea34791a280a3c50432c`
- 输出 SHA-256：`d248dc1f7d016c502b4d918e78601f6e93361f398718512945369f71ff42f466`

浏览器验收确认《雨林》显示第一集《路没了》v3、第二集《给雨让个座》v1、第三集《鸟有回信》v2，三集均为 `CONDITIONAL PASS` 候选状态，并明确未记录人工批准、未确立 Canon。刷新/重新打开后，历史问题和真实 Producer 回复仍可恢复。原始 Agent 回复、数据库、密钥和临时日志保留在 Runtime 证据目录，不进入 Git。

证据目录：`H:/localminidrama-runtime-creative-20261011-source/evidence/m2-assistant-20261012`

## 验证

- 后端 M1/M2 测试：`82/82` 通过。
- 前端单元测试：`10/10` 通过。
- `npm run build`：通过，生成 `ScriptAssistant` chunk。

## 成本与边界

本次真实请求输入 22,816 tokens，说明完整上下文仍有压缩空间。M2 已用按问题类型限额的片段选择、历史轮数上限和 8,000 字符输入保护；后续可在 M3 之前继续优化资料摘要与缓存复用，但本轮不扩大范围重构。没有可核验账单时不估算人民币费用。

当前缺口是引用尚未实现点击后直接打开本地文件并定位行号；界面显示真实来源路径、SHA-256 和行号，可人工核对。M3 尚未启动。
