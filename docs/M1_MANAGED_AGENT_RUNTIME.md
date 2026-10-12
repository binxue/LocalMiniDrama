# AI 剧本创作助手 M1：独立运行基座

唯一源码：`H:/localminidrama-active/backend-node`。运行数据沿用 `H:/localminidrama-runtime-creative-20261011-source`。现有五个 Managed Agents 和云端 Skills 保持不变；`storyTeamService` 是普通模型 API 编排，不能称为 Managed Agent。

## 模块职责

剧本模块：构思、正文、关系、分支、连续性、评审、版本、人工批准和 Script Handoff。视频模块：分镜、镜头、视觉资产、视频生成、镜头质检、配音剪辑、成片时长和制作验收。《雨林》计时、救鸟拍法与样片转交视频模块待办，不阻塞 M1。

业务终点：创作目标 → Producer → 必要专业协作 → Writer → Editor → 用户批准 → Script Handoff。CONDITIONAL PASS 只是候选状态；task completed 只表示真实正文正常返回，不代表质量通过、用户批准或 Canon。

M1 不实现 M2 对话/长期记忆、不实现 M3 自主编排。此版本提供单 Agent 任务接口。Script Handoff 的后续契约应包含版本、正文、互动分支、连续性、目标时长、评审与人工批准状态；不包含视频生成职责。本轮未新增第二套 Store 或 Canon 写入入口。

## 运行

Node 24.15（本机验收版本）；better-sqlite3 13.0.3 与其 ABI 匹配。npm 安装按 package-lock；不得把 Node 22 的原生二进制直接用于 Node 24。依赖升级只涉及后端 SQLite 驱动，生产数据库不迁移。

PowerShell 普通终端：

```powershell
cd H:\localminidrama-active\backend-node
$env:LOCALMINIDRAMA_CONFIG='H:/localminidrama-runtime-creative-20261011-source/evidence/m1-independent-runtime-20261012/config.yaml'
node src/server.js
```

该配置仅使用 127.0.0.1:5688 和 Runtime/m1/data/m1.db，不使用5679或5687数据库。需要当前用户已安装 `@volcengine/ark-cli` 并完成 platform 认证。Windows 自动定位 APPDATA/npm 中官方二进制，可用服务端 `ARKCLI_BINARY` 指定真实二进制；不使用 shell 拼接。API Key 只由服务端 CLI/环境读取，不接受前端 Key、模型或 base URL 覆盖。Codex 不参与执行链。

## API

前缀 `/api/v1/managed-agent`：

- `GET /agents`：已有五个白名单 Agent 与环境信息。
- `POST /tasks/:task_id/refresh`：只回查既有 Session，不重新提交任务。
- `POST /tasks`：`{work_id,agent_id,input}`，201立即返回持久任务。
- `GET /tasks/:task_id`：结果、Session、输入/输出SHA256、事件、usage及错误。
- `GET /tasks?limit=50`：最近任务（最多200）。

五个白名单 Agent：Producer `agent-20261011131513-17rey`；Writer `agent-20261011131619-47ft8`；Relationship `agent-20261011131626-3w9ao`；Interactive `agent-20261011131703-mbc7o`；Editor `agent-20261011131710-ncebb`。默认已有 Environment `env-20261011083635-eeeu2`。本轮不创建Agent/Skills。

状态：queued → starting → submitted → running → completed/failed/incomplete。正文来自 agent.message；idle且无正文不得成功；模型错误可中断自动云端重试。服务重启将未收口记录置interrupted，保留Session/事件，**不自动重发**。已完成任务仍可查询；interrupted不等于云端已取消，需要后续人工确认/显式回查。

权限/预算：只允许loopback、同源（无Origin普通终端允许）；单在途任务；输入8000字符；work_id100字符；24小时最多5个任务；单任务最多40次事件查询，间隔5秒，轮询循环300秒边界（单次CLI请求另有超时）；没有模型任务自动重试。该上限不是人民币/token硬封顶；云端token可超预期，失败请求usage可能缺失。cache单列不重复相加；无账单不估算人民币。

任务表managed_agent_tasks是执行记录，不写episodes、剧本、Canon或视频表。事件每次查询落盘；未知创建/发送超时不能盲目重试，应查询官方Session/Events确定是否接收。原始事件可能包含创作材料，只留服务端本机边界。

## 验收与限制

真实验收证据在 Runtime/evidence/m1-independent-runtime-20261012。关闭Codex应用属于用户设备操作，本助手不能在持续执行时关闭自身；可证明独立Node进程HTTP调用与服务重启，不能伪报“已关闭Codex”。本机普通终端步骤与无Codex依赖代码供最后复核。

视频模块待办：三集各路径计时、第一集样片、救鸟顾问拍法、湿路安全、分镜视觉资产和制作验收。当前不调用、不批准视频生产。

## 启用与普通终端查询

模块默认关闭，只有服务端配置 `managed_agent.enabled: true` 才启用；默认生产配置保持不变。

在 backend-node 普通终端执行：

```powershell
node tools/managed-agent-task.js agents
node tools/managed-agent-task.js get mat_feb1962c-bfe0-4978-bdcf-12fb5afe5ba2
node tools/managed-agent-task.js refresh mat_feb1962c-bfe0-4978-bdcf-12fb5afe5ba2
# 新任务（发生真实调用，仅在需要时执行）
node tools/managed-agent-task.js create request.json
```

客户端默认访问5688；可用 LOCALMINIDRAMA_URL 指定本地服务。Node最低22（SQLite驱动要求），真实验收运行于24.15.0。

## 2026-10-12 最终收口补充

后续真实新任务 mat_72afb0d3-b031-489d-8a93-8d0245f39db5 / sesn-20261012114626-4lm5n 已completed，输入6282、输出163 tokens，重启后正文、事件、Session、哈希与用量不变。证据及更新报告：Runtime/evidence/m1-final-closeout-20261012/M1-final-closeout-report.md。

5688未运行时fetch failed底层为ECONNREFUSED，已恢复独立服务并补充客户端cause。旧进程退出原因未知。物理关闭Codex步骤未实做；独立Node自行执行云端全链路与重启恢复已自动化证明，不再要求用户手动排障。M1具备工程收口条件，M2等待下一步授权。
