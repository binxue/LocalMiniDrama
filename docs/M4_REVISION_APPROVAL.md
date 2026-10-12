# M4 定向修订与批准闭环

## 实现

M4 在 M3/M2 现有服务上新增 `script_assistant_revisions`。修订记录绑定原稿来源和 SHA-256，Story Writer 生成独立候选，Independent Editor 复审，候选正文、候选哈希、Editor 意见和批准状态均持久化。前端在 Producer 编排模式显示原稿哈希、候选正文、Editor 意见，并提供“批准为待发布版本”动作。批准只写入 `approved_pending_canon`，不写入 Canon；原始正文不变。

## 真实验收

以《雨林》第三集 v2（原稿 SHA-256 `159d798d88fcc5fdfb35590612f7f20c1b3ca4ae203a3745fe6c6668bcf10c8f`）启动：

- Revision：`rev_e310cfe1-f800-4854-bbb6-b81573f30311`
- Story Writer Task：`mat_80054521-fcdc-4317-b8e1-ef15dfaf021b`
- Story Writer Session：`sesn-20261012152242-q5zy3`
- Story Writer：真实完成并返回候选正文；其输出已保存在 Managed Agent 任务记录中。
- Independent Editor Task：`mat_3dae9350-f419-48dc-99a4-d65ac67ccafa`
- Independent Editor Session：`sesn-20261012152610-rwdqe`
- Editor 状态：在 5 次模型请求后未达到可验证终态，Revision 按有界执行标记 `failed`，错误为 `Editor 未完成`。

因此本轮不能报告 Editor PASS、CONDITIONAL PASS 或 FAIL，也没有批准动作。第三集 v2 原稿未修改，未写 Canon，未启动第四集或视频制作。页面和数据库已保留 Revision、Writer/Editor Task 与 Session 状态，刷新可恢复失败记录。

## 用量

Editor 失败前已记录输入 `46,553`、输出 `5,118`、缓存读取 `40,984`、5 requests、未完成请求 1。Story Writer 任务的完整用量和候选哈希保留在 SQLite；本轮没有可核验人民币账单，不估算费用。

## 阻塞与后续

当前阻塞是 Independent Editor 长任务未在既有轮询窗口内完成，不能进入人工批准。下一步应先针对 Editor 输入长度和最大执行时间做有界优化，再重新提交一次新的 M4 Revision；不得把本次运行标为通过，也不得自动批准候选。
