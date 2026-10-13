# LocalMiniDrama 接手与真实 Agent 审核接入

日期：2026-10-13。继续现有里程碑 1 的 A/B 专业制作闭环，不重启产品规划。

## 接手基线与文件所有权

- 正式工程：`H:\localminidrama-clean`；远程：`binxue/LocalMiniDrama`。
- 分支：`codex/localminidrama-provider-stabilization`。
- 接手 HEAD 与 fetch 后远程分支 HEAD：`8cf629afbdacb8e813c2865ab7b20de8db02396d`。
- Windows 原生 Git 确认接手时已跟踪文件无改动。WSL Git 的 291 项差异来自 CRLF 和 LFS 处理，不能拿它们当 Claude 代码变更或批量提交。
- Claude 的未跟踪文件包括 `volcengineAgentService.js`、角色/视频规格辅助代码与测试、制作报告、日志、配置备份、审片媒体。全部保留，未加入本次提交。忽略目录中的旧制作脚本也保留。
- 本次只拥有新增审核证据服务、CLI、两份测试、本记录与质检 API 的证据/去重补充。
- 未执行 reset、clean、覆盖遗留文件、数据库迁移、服务重启、历史任务重试或收费调用。

## 实际 Runtime 状态

通过原生 Node v24.15.0 + 已安装 better-sqlite3 的只读连接确认：

- 数据库 `PRAGMA quick_check = ok`。
- A：storyboard 3；图片 22 completed，`ig_9353b1a6.jpg`；视频 7 completed，`vg_7_036ef3a3.mp4`。已存在资产不表示影视质量已验收。
- B：storyboard 4；已有图片 14 completed；视频 5 failed。
- 图片 23、24 仍为 processing；未改状态、未重发。
- storyboards 3/4 原有 approval 等内容未修改。本轮没有向正式库导入测试数据。
- SQLite 一致性备份与接手记录：`H:\localminidrama-handoff-20261013-1791886308643`。备份通过 readonly connection 的 SQLite backup API 完成。

旧文档中的 AWAITING_A_FIRST_FRAME、Agent APPROVE/88 分和“完整闭环完成”不能作为当前真实验收结论。旧脚本 `execute-production-round.js` 硬编码质量评分；`execute-real-agent-review.js` 未附图且将总导演 ID 当成视觉检查 Agent。原文件保留作遗留证据，不作为本轮执行入口。部分旧脚本含凭证，禁止输出或提交这些脚本。

## 本轮交付

新增 `backend-node/tools/managed-agent-review.cjs`，复用现有 CLI Managed Agent 数据面与现有 quality-check API：

1. prepare：只读核对候选归属、completed 状态、媒体文件、批准记录和 A/B 方案 SHA-256，保存独立执行包。
2. send：核对 Platform 认证、Agent/session 身份与 idle 状态；把实际图片附给 Agent。收费写之前持久化 UNKNOWN，避免响应丢失后重发；无自动重试。
3. collect：仅拉取提交 cursor 之后的升序事件，要求当前绑定的 JSON 回复和 idle。拒绝陈旧输入、缺图、失败、并发 turn、未完成或不完整分页。
4. collect --import yes：通过既有 quality-check API 回流建议。保存 Agent/session、提交/结果 event、输入/媒体/方案/批准记录 hash。导入去重且拒绝同 execution_id 的冲突结果。

不创建第二套数据库、Agent 系统、生成任务或制作人批准机制。Agent APPROVE 仅为建议，不生成制作人决策，不自动进入视频制作。质检导入仍属于可信外部证据输入；其 JSON metadata 本身不是远端签名证明。

## 已验证的真实接入对象

通过现有 CLI auth status、Agent list、session list/get 的只读返回确认：

- 已登录 Platform profile：`platform_cn-beijing_default`。
- 视觉检查：`agent-20261011103929-0cx2g` / `film-visual-inspector`。
- 历史审核会话：`sesn-20261011140558-ta14a`，查询时 idle，绑定上述视觉检查 Agent。
- `agent-20261011103843-pr16z` 实为 `film-chief-director`。
- CLI get 返回 `Result.Agent.Id` / `Result.Status`；已据实适配，不沿用猜测字段。

实际图片 22 的 prepare 已成功：
`H:\localminidrama-handoff-20261013-1791886308643\a22-review`。
其中 execution.json 仍为 PENDING，prompt.txt 已生成；没有上传文件或发送事件。

## 验证

- 后端 `node --test test/*.test.js`：99/99 通过，包括本轮 9 项测试。遗留未跟踪测试一起运行，未代为提交。
- 前端 `node --test test/*.test.js`：13/13 通过。
- CLI 语法检查和 Git diff --check 通过。
- 原生 DB 读取、批准方案 hash、真实候选媒体读取与 prepare 通过。
- 新导入测试只用内存 SQLite，验证批准内容保留、建议与决策分离、重复导入和冲突拒绝。
- 未验证：本轮 Agent 收费执行、真实视觉质量结论、浏览器交互、B 视频连续性；未宣称完成完整制作闭环。

## 唯一下一步

按 CLAUDE.md 的预算/制作人批准边界，获得本轮 Agent 审核调用预算授权后，使用已准备目录执行一次 send；随后只 collect，不重发。图片和视频新生成不包含在这次审核中。

在 `backend-node` 中使用原生 Windows Node 执行：

    node tools/managed-agent-review.cjs send --output H:/localminidrama-handoff-20261013-1791886308643/a22-review --cli-entry C:/Users/Bynn/AppData/Roaming/npm/node_modules/@volcengine/ark-cli/scripts/run.js --profile platform_cn-beijing_default --authorize-agent-call yes

    node tools/managed-agent-review.cjs collect --output H:/localminidrama-handoff-20261013-1791886308643/a22-review --cli-entry C:/Users/Bynn/AppData/Roaming/npm/node_modules/@volcengine/ark-cli/scripts/run.js --profile platform_cn-beijing_default

Agent 尚未 idle 时保留证据并稍后继续 collect。鉴权/业务错误停止；UNKNOWN 无提交 cursor 时先只读回查事件，不再次 send。若 CLI 响应形状变化，保留原始私有证据，不用默认成功或历史评估降级。

正式 API 导入需运行包含本次修改的后端代码；本轮未重启现有服务。部署后可在 collect 命令追加 `--import yes`，继续复用既有工作台质检展示和制作人决策流程。
