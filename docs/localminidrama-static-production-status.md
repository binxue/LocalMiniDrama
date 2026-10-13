# 当前执行：A 镜工作台真实智能静态制作

2026-10-13：Codex 为主开发负责人，Claude Code 停止开发。唯一工程为 `H:\localminidrama-clean`，继续 `codex/localminidrama-provider-stabilization`。不关联 Zemora，不重建工程。

接手起点 `1891ec769b6cded4a2eac4b1a66c6e16ad17903f`，fetch 后与远程开发分支一致；它是在作者列出的 `8cf629a` 基线上延续的上一轮提交。

## 当前业务结果：受外部认证阻塞，未通过验收

- 正式入口：`http://127.0.0.1:3013/film/2?episode=2`，s01_01A 下的“启动智能制作”。已从浏览器实际点击并创建正式后台任务。
- run：`static-b733fb9d-01ad-4d8b-b9cd-a810fa612363`，BLOCKED / analysis-1。
- 第一次制作请求在控制面读取摄影 Agent 时失败：`GetAgent requires Volcengine Ark SSO STS`；`STS 续期失败 ... refresh_token is invalid`。
- 已执行官方 CLI `auth login volc-sso` 恢复登录，返回 `OAuth 认证超时（5分钟），请重试`。
- 本次未创建远程 session，未发送 Agent message，未创建新图片任务，未生成视频。分析、提示词优化、候选生成、真实审片和最佳候选提交均未实际完成。
- 本地 UUID 是待调用记录的追踪标识，不是云端执行证明。真实完成必须具有远程 session、submit event、result event 和媒体 hash。

## 已落地的工作台路径

复用摄影指导和视觉检查 Managed Agent、现有 imageService、async_tasks、storyboard.description、quality-check/producer-decision API 与 FilmCreate。

工作台内部流程为分析 → 优化提示词 → 新候选（或自动选取符合固定合同的最新历史候选）→ 当前图片真实审片 → 必要时修正一轮 → 推荐最佳候选。未实际完成的步骤保持未完成，不把历史任务 22、硬编码评分或本地追踪 ID 当作成功证据。

固定 drama=2、episode=2、storyboard=3；Seedream `doubao-seedream-5-0-pro-260628`，1440×2560；批准方案 hash 与场景/手机/茶杯三张有序参考保持不变。显式参考图生成不再通过负面提示词推断并回写角色关联。

累计静态预算上限 ¥10：Agent 每次预留 ¥2、图片每张预留 ¥1；最多两轮。预留与基于返回用量的目录估算独立于实际结算。目录报价证据已保存；本轮尚无推理用量或结算账单，不能把未知费用写成零。控制面失败且确认未创建 session/未提交 message 的预留可释放，原金额和原因保留。历史 23/24/25 云端状态及费用仍待核实，不自动重试。

制作人通过、修正、重拍按钮复用既有决策 API；视频未授权。Agent APPROVE 只作为建议。

## 工程与数据保护

- 124 个 Claude 遗留未跟踪文件与被忽略的两份旧执行脚本已复制到私有保护目录；原文件全部保留，不代为提交。
- 数据库一致性备份、原分镜记录、批准方案、报价、运行日志与浏览器证据：`H:\localminidrama-takeover-20261013-1791886646027`。
- 已把一条模拟 88 分评分及模拟 approved 轮次移入同一 description 的隔离字段，保留原始对象；approval/production_review 不变。
- 正式后端以 `LOCALMINIDRAMA_SAFE_RESTART=1` 启动：跳过迁移、vendor lock 写入、启动失败标记及视频恢复，保护未知任务。未 reset/clean/merge main。
- 离线后端 107 项、前端 13 项通过；前端构建通过。测试仅证明工程行为，不证明影视质量或真实 Provider 成功。

## 唯一下一步

完成当前账号的方舟 SSO 登录后，继续从正式工作台执行本轮 A 镜静态制作；已有非视频调用授权和 ¥10 预算继续有效，无需重新询问预算。不要重发 UNKNOWN 执行；当前失败发生在控制面预检、尚未创建 session，可以在认证恢复后创建新的正式工作台尝试并保留原失败记录。

复核原始错误文件：
`production-evidence/static-b733fb9d-01ad-4d8b-b9cd-a810fa612363/exec-bf67ad07-51db-4adc-8453-1f81cc8af1de-agent.json`（位于上述保护目录）。
