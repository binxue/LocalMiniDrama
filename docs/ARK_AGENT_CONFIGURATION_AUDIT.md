
## 2026-10-15 子线程证据工程检查点

现已增加按官方CLI的session-thread-id查询各线程历史，保留thread_events_json；主/子事件按ID去重汇总用量，专家正文不拼成主交付正文。后端127/127，通过的用量测试为fixture，不是实际团队调用。尚未启用原生Multiagent或恢复Skills，未新增模型调用。

需要外部恢复的验收条件：cua访问现有3014页签被URL安全策略明确拒绝；停止并重启5688被自动执行策略以blocked by policy拒绝。已停止这些受拒动作，未通过其他浏览器、CDP或替代进程控制绕过。最新代码不能以旧进程HTTP200冒充部署成功。Tools官方文档CLI两次TLS握手超时，官方网页工具也不可读；没有依据时不移除安全限制。

下一步是恢复正常工作台访问与既有后端启动能力，再执行已选定的非雨林首集两处因果返修；随后验证专业Skills及原生协调。自动跨缺口全集生产、并发吞吐和速度成本对照仍未完成，整体目标不标完成。

# Managed Agent 真实配置核对 — 2026-10-15

证据来自 arkcli auth status 和五次 agent agent get 的完整 JSON，只读，无会话创建/消息/模型请求，无远端配置修改。

五个既有Agent均Version=1；Model.Id=doubao-seed-evolving-latest-version，Thinking=enabled，ReasoningEffort=high，ServiceTier=default。返回字段均为Id/Type/Name/DisplayName/Description/AccountId/ProjectName/Version/Model/System/Tools/Skills/CreateTime/UpdateTime，未返回原生Multi Agent配置字段；不能宣称Producer已配置原生协调。

|角色|ID末尾|服务端Skills|
|---|---|---|
|Producer|17rey|sw-writers-room、sw-story-structure、rainforest-interactive-adventure|
|Story Writer|47ft8|sw-story-structure、sw-scene-craft、sw-dialogue、rainforest-interactive-adventure|
|Relationship Writer|3w9ao|sw-character-conflict、sw-dialogue、rainforest-interactive-adventure|
|Interactive Designer|mbc7o|sw-story-structure、sw-workflow、rainforest-interactive-adventure|
|Independent Editor|ncebb|sw-writers-room、sw-character-conflict、sw-scene-craft、rainforest-interactive-adventure|

五个配置均启用agent_toolset_20260701的bash/read/write/edit/glob/grep/web_fetch/web_search。系统提示均为雨林专用，Relationship和Editor仍含阿棠旧称；Interactive设定固定90秒和短分支。未修改这些远端配置。

本地managedAgentService.createSession的controlledEpisodeAgent覆盖System，并传Skills: []；因此实际受控会话没有沿用云端挂载Skills。此举历史用于阻止工具探查/incomplete循环，不能未经官方契约及有界真实验证直接删除。当前业务角色Prompt及本地分阶段Session串联，不等于原生Multi Agent或已使用专业Skills。

唯一相关下一步：核对官方Session运行时工具限制与Multi Agent配置契约，选择能够保留专业方法又不引入无界工具任务的最小接入方式；隔离作品做一次有界验证后再调整默认。不得为证明Skills而盲目重新提交未知Session，不改模型、不重建Agent、不覆盖雨林。

## 官方Multi Agent契约核对

已读取官方《编排Multi Agent》完整正文（revision 638）：https://ark.volcengine.com/region:cn-beijing/docs/multi-agent 。官方提供协调器委派、独立子线程上下文、子Agent各自模型/系统/Skills/Tools、消息返回汇总及子线程自动重调度。本地应保留作品资料、业务范围、剧本保存、版本/批准与UI，不应再复制委派或线程生命周期。

配置使用multiagent.type=coordinator和multiagent.agents（固定子Agent ID/版本）。更新已有协调器需携带当前version并整体提交匹配的system与agents列表；现有Session不自动切换。无需创建第六个Agent即可更新既有Producer，但尚未进行远端更新。

成功必须同时具备：主线程最终agent.message、Session以stop_reason.type=end_turn进入idle、无running/rescheduling子线程、本轮无thread_status_terminated。主/子事件流独立，需按线程ID关联，不能靠跨流到达顺序。requires_action需处理stop_reason.event_ids，重调度时不得并行手动重试。

当前本地已检查end_turn，但未集成子线程查询与完整成功门槛，因此不能直接启用原生协作并沿用当前完成判定。下一步应先接入官方线程结果证据，再对既有Producer配置做最小变更；不能简单删除Skills:[]就声称完成。Skills安全保留与工具限制仍需官方Session/Tools正文依据，未核定前不改默认。

## 本次工程结果与未完成项

managedAgentService在观察到session.thread_created后，使用已核验CLI命令threads list（全分页）查询并持久保存threads_json；线程未知、非idle或出现thread_status_terminated时不记completed。现有单Agent任务保留原完成门槛。后端126/126通过，新增线程判定为fixture测试，不是真实多Agent协作。

仍未接入每个子线程的完整正文与独立usage聚合，也未远端启用Multiagent，不能称为已完成原生协作。Tools正文读取两次因active.json TLS handshake timeout失败；未猜测字段，未删除Skills清空或放开工具。真实Skill受控验证未开始。浏览器与运行重启的策略拒绝仍保持，不绕过。

## 2026-10-15 受控请求配置纠正

依据已读取的arkcli-agent配套references/session-files.md，Session overrides中的Tools/Skills是替换语义；references/agent.md明确空Tools数组可关闭工具。受控单轮任务现在显式Tools: []，不再只靠System的禁止文字，同时继承云端全部工具。未改云端Agent配置、未修改既有Session、未恢复Skills，也未启用原生Multiagent。

createSession与测试使用同一个sessionArgs构造器，移除此前单独复制给测试的请求构造代码。普通会话不增加覆盖，仍继承已有配置。后端129/129通过，仅证明本地请求结构；未真实提交新Session，服务端空数组生效与实际运行仍待验证。新增收费调用0。
