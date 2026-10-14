# 雨林：仅故事内核真实创作验收 · 2026-10-15

结果：同一雨林作品内保存独立测试第一集，候选 completed，批次 completed 1/1，Editor CONDITIONAL PASS，approval=not_approved。没有生成第二集、没有人工批准或Canon更新。

唯一源：H:/互动剧/雨林/故事内核_v1.md，SHA256 `d7e17e433dde4414c0d2b41c17d4ed11a100a266da2904158603885efbb4f05a`。策划13,675字符，完整正文4,979字符；正文SHA256 `fc74a5d12bb0e19d4832c909ef44f52e2aba525d0ad30516e5e5077dffc59cab`。

Producer统一规划；Relationship负责人物关系；Interactive负责选择、分支、汇合和状态；既有Story Writer另开独立Session承担结构设计，随后正文Writer执行完整策划。三项专家并行。未创建Agent或其他作品。Agent成果原样保存，Codex未代写。

## 输入验证与边界

隔离scope不加载作品旧manifest、旧分集资料、历史聊天、旧审核或旧Session正文。Writer实际请求15,827字符，按唯一内核+本轮全部专业输出+任务约束重建，逐字匹配=true；前文候选引用为空。六个本轮Session皆独立；Skills运行时为空，本轮事件无tool/skill事件。工具并非在平台配置上禁用，不冒称能力。源核验及实际输入文件在Runtime保存。

本轮Producer和专家中出现的“Canon”措辞只属于新测试提案，不能建立正式事实；总集数候选12/36/58未确认。本轮只执行第一集。历史作品资料未打开、修改或删除。原有正文与Canon保持原文件；没有把新稿注册为旧source，没有调用批准接口。历史候选元数据基线为空，不能据此宣称已对所有旧文件做全文哈希比对。

## 真实调用

| 阶段 | 云端模型耗时 | 输入Token | 输出Token | 缓存读取Token（输入分类） | Task |
|---|---:|---:|---:|---:|---|
| Producer | 284.7s | 6,932 | 10,129 | 3,896 | mat_bd6b1e60-a14f-4c9e-a153-a2d853756c7f |
| Relationship Writer | 227.2s | 10,137 | 6,886 | 3,896 | mat_c193764d-5188-419b-870e-39df8d80f3f8 |
| Interactive Designer | 341.2s | 10,137 | 10,458 | 3,896 | mat_34ed69b7-68da-4d84-944a-3f717b20dea1 |
| Story Writer（结构设计） | 279.2s | 10,133 | 9,036 | 4,920 | mat_9321e093-ff0c-4006-b3b0-86945a0bbcf8 |
| Story Writer（正文） | 319.5s | 16,524 | 12,533 | 4,920 | mat_a401991d-e67a-499b-974b-86d78faa8b17 |
| Independent Editor | 365.1s | 8,926 | 12,304 | 4,920 | mat_f4fe9802-b3d9-41a5-8447-f997c809a5e1 |

六次模型请求、输入62,789 + 输出61,346 = 124,135 Token；缓存读取26,448不重复加到总量。无缺失用量、无未完成请求。模型doubao-seed-evolving-latest-version，价格未配置，金额未知而非0元。

云端第一请求开始到Editor模型请求结束1,386.552秒（23分06.6秒），Editor云端于北京时间01:47:16完成。此口径包含阶段衔接，不是后续本地恢复确认耗时。互动、Writer、Editor本地等待窗口结束后通过原Session取回，未重复提交。本地服务后来中断、用户继续后恢复5688/3014，因此数据库completed_at包含后续回查延迟；不能当作模型耗时。

## 成果质量

新稿具备第三日断路、藤索抉择、刻痕/腕绳呼应、雾寨、行李牌与“别念出声”钩子；两选择、四路径、两个汇合。Interactive纠正Producer公共段66s算术错误为63s；Writer落实63+6+21=90秒装配。尚无实拍时长验证，用户停留选择时间另需产品明确。

Editor真实五项意见：CP1-B选择后果未延续；救援站位与落地因果不清；客观空镜破坏POV；手机动作结果含混；帘影可能被风解释而削弱硬钩子。CONDITIONAL PASS不等于拍摄合格或商业质量批准。未自动重写以追求PASS。

Editor本次由恢复路径收到完整正文，未收到独立策划快照；不能宣称Editor独立比对过全剧策划。其全文质量评定有效，策划落实由本轮输入与人工阅读核验。恢复路径现已补齐策划和详细审核维度供后续使用，未为验证修复重复收费审核。

## 浏览器与工程验证

3014隔离视图实际展开策划、打开新稿与Editor、刷新恢复、下载专业策划/剧本/评定；三下载均保留完整原始输出（附未批准封面），逐字尾部匹配=true。Console本次页面error日志为空。截图Runtime/3014-review.png。后端仅重启5688，没有操作3013/5679；Runtime数据库保留。105项自动测试通过、前端构建通过。修复独立Markdown评定标题漏解析；审核完成仍not_approved。

工作台： http://127.0.0.1:3014/script-assistant?work=rainforest&kernelTest=batch_30df930d-a129-4b18-a65f-e19619fe0eea

Runtime交付目录：H:/localminidrama-runtime-creative-20261011-source/evidence/20261015-rainforest-kernel。professional-plan.md / first-episode.md / editor-review.md / audit.json。候选 `cand_f9680c40-ad8b-4b53-9322-29dc5bc72514`。后台和云端任务ID留在技术证据，普通用户页面只显示策划、正文、审核和导出。

当前边界：本轮真实单集链通过；全剧详细逐集策划和并行生产未在此单集测试验收。下一动作是用户审阅新提案与Editor意见；未经新授权不续写、不自动批准。
