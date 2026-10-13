# 当前执行：A 镜工作台真实智能静态制作

2026-10-13：Codex 为主开发负责人，Claude Code 停止开发。唯一工程为 `H:\localminidrama-clean`，继续 `codex/localminidrama-provider-stabilization`。不关联 Zemora，不重建工程。

接手起点 `1891ec769b6cded4a2eac4b1a66c6e16ad17903f`，fetch 后与远程开发分支一致；它是在作者列出的 `8cf629a` 基线上延续的上一轮提交。

## 2026-10-14 当前结果：新候选 28 已交付并真实审核通过，等待制作人决定

- 本轮从 `b33d9bd` 继续；独立 run `static-46918c73-09bc-45fe-b556-bb4c9ba879ff` 为 READY_FOR_PRODUCER。工作台实际点击独立新图片请求入口，复用已完成 analysis-2，未重跑摄影分析或历史候选审核。
- 当前默认路由经过 wintun（综合 metric 6），物理网卡 metric 25。无鉴权、无模型/图片的同尺寸诊断包在两个方舟 IP 均正常返回 401；绑定物理网卡后 TLS 从约 1.1 秒降至 0.08 秒、响应从约 1.6 秒降至 0.15 秒。没有显式代理、证书错误或 13 秒应用超时证据。旧日志缺少 socket 阶段，无法证明 26/27 的唯一历史根因。
- 仅方舟图片请求通过环境变量 `LOCALMINIDRAMA_ARK_IMAGE_LOCAL_ADDRESS=192.168.1.51` 绑定当前物理网卡，使用独立 socket 并强制证书校验；不修改全机网络、模型、尺寸、导演方案或三张参考。重启保留 SAFE_RESTART 和既有证据目录。
- **新图片任务 28** 返回 HTTP 200，耗时 97889 ms；TLS 87 ms，upload_flushed 88 ms，完整响应 715 bytes。request ID：`021791933755370274564af00b8ed8c9fdfc012f2496079133f8a`。这是新请求成功证据，不是 26/27 恢复证据；原任务、费用预留和状态全部保留。
- 新媒体：`projects/0002_20261012_《路没了》EP01_v3/images/ig_dc45cf57.jpg`，实际 JPEG 1440×2560；SHA-256 `8028967fa6a23d5736047874a81e8c33c9611dcf817a6fe9b525b2e606ee0319`。
- 新候选由原视觉检查 Agent 实际审核：**APPROVE / 90**；session `sesn-20261013232425-qlyz0`，submit `sevt-20261013232447-grno5`，result `sevt-20261013232628-pdwab`，本地追踪 `exec-a6805d47-86d0-4729-8830-a86eb1bd1a23`。屏幕斜线、接触阴影、液位是非阻断优化建议；未继续收费修图或代制作人批准。
- 累计预留 ¥10（旧 ¥8 未释放，新图 ¥1、新审核 ¥1）。已返回用量和目录估算合计 ¥1.126818，**非实际结算且不包含未知图片费用**。按图片服务实际 API Key 查询 10 月 13 日账单仍返回未开通 split bill capability；26/27 受理与费用 UNKNOWN，实际费用保持 null。
- 原批准记录、first_last_frames、production_review、图/视频提示词、角色关联、三张参考 hash、任务 23/24/26/27 全行与本轮备份一致，SQLite quick_check=ok。保护目录新增前后一致性备份、无费用链路 JSON、`transport-result-20261014.json` 和真实响应日志，未新增大型报告。后端 113 项与前端 13 项通过，构建通过；测试不替代影视验收。

## 2026-10-13 历史结果：真实 Agent 链路已执行，图像传输受阻

- 正式入口：`http://127.0.0.1:3013/film/2?episode=2`，s01_01A 下的“启动智能制作”。已从浏览器实际点击并创建正式后台任务。
- 当前 run：`static-14066d27-04e2-440d-92ac-fddbc1f8d971`，BLOCKED / generation-2。
- 历史失败 run `static-b733fb9d-01ad-4d8b-b9cd-a810fa612363` 的 SSO 错误证据保留。作者完成新回调后，CLI 同账号 SSO refresh 成功，实际 Agent get 成功；认证已恢复，不再是当前阻塞。
- 已由工作台真实执行摄影分析/优化提示词、视觉审片、依据真实缺陷的修正分析，共三次 Managed Agent 调用，每次具有真实会话、提交及响应事件。
- 工作台自动选取符合模型、尺寸及三张有序参考合同的历史候选 22；真实视觉审核 **REVISE / 78**。主要缺陷为茶杯未明确在远侧右角滴水区，及袖口/前臂/疑似膝部越过“仅右手”限定。
- 新图请求 26（初次生成）与 27（真实缺陷驱动、不同提示词的修正）均为 `read ECONNRESET`，无图片交付。26 耗时 13038 ms、请求体 944831 bytes；27 耗时 12355 ms、请求体 945085 bytes。没有可用 HTTP 响应或 request_id，云端是否受理与收费均 UNKNOWN，不得视作未到云端或免费。
- 未生成视频，未记录制作人通过。新候选生成、修正候选复审、影视质量通过及最终接受未完成；不得宣称 A 镜智能制作闭环验收完成。
- 本地 UUID 是待调用记录的追踪标识，不是云端执行证明。真实完成必须具有远程 session、submit event、result event 和媒体 hash。

## 已落地的工作台路径

复用摄影指导和视觉检查 Managed Agent、现有 imageService、async_tasks、storyboard.description、quality-check/producer-decision API 与 FilmCreate。

工作台内部流程为分析 → 优化提示词 → 新候选（或自动选取符合固定合同的最新历史候选）→ 当前图片真实审片 → 必要时修正一轮 → 推荐最佳候选。未实际完成的步骤保持未完成，不把历史任务 22、硬编码评分或本地追踪 ID 当作成功证据。

固定 drama=2、episode=2、storyboard=3；Seedream `doubao-seedream-5-0-pro-260628`，1440×2560；批准方案 hash 与场景/手机/茶杯三张有序参考保持不变。显式参考图生成不再通过负面提示词推断并回写角色关联。

累计静态预算上限 ¥10：Agent 每次预留 ¥2、图片每张预留 ¥1；最多两轮。预留与基于返回用量的目录估算独立于实际结算。目录报价和返回用量证据已保存；本轮尚无可归因结算账单，不能把未知费用写成零。控制面失败且确认未创建 session/未提交 message 的预留可释放，原金额和原因保留。历史 23/24/25 云端状态及费用仍待核实，不自动重试。

当前累计预留 ¥8；三次已返回 Agent 用量估算 ¥0.347472，实际结算金额仍为 null。工作台实际账单查询返回账号未开通 split bill capability，costs.billing_status=UNAVAILABLE，原始响应落盘。图像 26/27 未知费用预留保留，不把估算当作实际费用。

| 已完成步骤 | 真实响应事件 | 估算 CNY（非结算） |
| --- | --- | --- |
| 摄影分析与提示词优化 | `sevt-20261013115551-z6ti8` | 0.089694 |
| 历史候选 22 视觉审核 | `sevt-20261013120805-c6ag2` | 0.158034 |
| 真实缺陷驱动修正分析 | `sevt-20261013121627-aehqy` | 0.099744 |

原事件列表会包含提交 cursor 本身，现已修正这一兼容行为；“继续查询”只读取原会话，不重发消息。未知图像仅可安全转用合规历史候选审片；新修正请求须依据真实审片、使用不同提示词、保留原未知费用预算。每一生成轮次只能提交一次，不能利用恢复入口重发 26 或 27。

官方 [图片 API](https://ark.volcengine.com/region:cn-beijing/docs/image-generation-api) 与 [Seedream 5.0 pro 教程](https://ark.volcengine.com/region:cn-beijing/docs/seedream-5-0-pro) 正文已通过 arkcli docs 核对：现用模型 ID、1440×2560（3686400 像素）与三图输入符合已读取约束。只读 HTTPS HEAD 可连接并返回 401（未带鉴权）；这不能证明收费 POST 已成功、未收费或其重置原因。没有因此继续收费测试或更改导演方案。

制作人通过、修正、重拍按钮复用既有决策 API；视频未授权。Agent APPROVE 只作为建议。

## 工程与数据保护

- 124 个 Claude 遗留未跟踪文件与被忽略的两份旧执行脚本已复制到私有保护目录；原文件全部保留，不代为提交。
- 数据库一致性备份、原分镜记录、批准方案、报价、运行日志与浏览器证据：`H:\localminidrama-takeover-20261013-1791886646027`。
- 已把一条模拟 88 分评分及模拟 approved 轮次移入同一 description 的隔离字段，保留原始对象；approval/production_review 不变。
- 正式后端以 `LOCALMINIDRAMA_SAFE_RESTART=1` 启动：跳过迁移、vendor lock 写入、启动失败标记及视频恢复，保护未知任务。未 reset/clean/merge main。
- 离线后端 109 项、前端 13 项通过；前端构建通过。测试仅证明工程行为，不证明影视质量或真实 Provider 成功。

## 唯一下一步

制作人可在正式工作台对新候选 28 选择通过、修正或重拍；Codex 不代为批准。继续保留 26/27 云端受理和费用 UNKNOWN，待可归因的账单或 Provider 证据出现再更新。不要重发未知任务、重复已完成 Agent 分析/审核或启动视频。

原始执行、事件、图片网络日志、账单错误和最新结果快照位于上述保护目录；当前真实结果快照为 `real-workbench-result.json`，Agent 证据为 `production-evidence/static-14066d27-04e2-440d-92ac-fddbc1f8d971/`。历史 SSO 错误文件继续保留。
