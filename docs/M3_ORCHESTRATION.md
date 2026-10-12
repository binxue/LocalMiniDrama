# M3 Producer 主导多 Agent 编排

## 实现

M3 复用 M1 Managed Agent 任务表和 M2 作品上下文。新增 `script_assistant_runs` 持久化编排记录，前端在 `/script-assistant` 增加“Producer 编排”模式。Producer 先制定计划，服务端从白名单中解析其选择的专家；专家结果进入 Independent Editor 输入，Editor 结果再进入 Producer 最终决策。编排最多选择两个专家，所有 Agent 任务顺序执行，任务与运行状态可刷新恢复。

每个编排结果都标记为 `candidate`，并明确 `approval=not_recorded`、`canon=not_established`。编排不会写入剧本正文、Store、Canon 或视频模块。失败运行保留在 SQLite，已完成的 Agent 不会因页面刷新重复调用。

## 真实验收

请求：检查《雨林》第三集连续性和人物关系，必要时提出局部修改建议，交给 Independent Editor，不写第四集。

- Run：`mar_ee549c65-98b9-4bfe-a6c3-2be9dbfb886a`
- Producer 计划：Task `mat_4ded8ba5-c8d8-47aa-82e8-c64c23e96f8a`，Session `sesn-20261012150426-x0dt0`
- Relationship Writer：Task `mat_9daba043-1016-46fa-8e02-3a75b543b2b5`，Session `sesn-20261012150553-ayww7`，状态 `completed`
- Interactive Designer：Task `mat_a93fc070-dbc4-4862-8301-3e88b861cdce`，Session `sesn-20261012150711-wl6y4`，状态 `completed`
- Independent Editor：Task `mat_d575cda9-69dd-446d-953e-f01f1a012427`，Session `sesn-20261012150816-2mvyc`，状态 `completed`
- Producer 最终决策：Task `mat_6a4d4876-6fca-444a-8fac-299f31a9037a`，Session `sesn-20261012150956-7lkyx`，状态 `completed`

Producer 选择了 `agent-20261011131626-3w9ao` 和 `agent-20261011131703-mbc7o`。Editor 实际意见为 `CONDITIONAL PASS`，指出节点2正文、四路径时长、安全顾问拍法、合流锁词及黎夏旧称清理仍需补证；Producer 最终状态为“需返修”。页面刷新读取同一 Run 及任务结果，未产生重复调用。

## 用量

计划 Producer：输入 25,515，输出 2,701，缓存读取 22,716；Relationship：10,298/3,282；Interactive：10,255/2,654；Editor：11,459/3,649；最终 Producer：11,474/2,310，缓存读取 7,992。合计输入 69,001，输出 14,596，缓存读取 30,708，6 requests，missing usage 0。无可核验账单，不估算人民币费用。

首次隔离尝试因专家输入叠加超过 8,000 字符而在本地拒绝，Run `mar_30c69f0d-7818-44dc-8ff2-a157541d7c22` 保留为失败证据；随后采用分层截断重试成功。该修复仍保留来源片段、计划和专家反馈，不伪称发送了省略内容。

## 验证与限制

后端全量测试 `82/82` 通过，前端测试 `10/10` 通过，生产构建成功。当前编排不自动返修、不调用 Story Writer 除非 Producer 计划明确选择，修订次数由单次运行上限约束；M3 本轮未启动第四集、未写 Canon。正式批准仍需用户明确决定。
