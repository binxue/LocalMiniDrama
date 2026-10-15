<template>
  <div class="assistant-page">
    <header class="assistant-header">
      <el-button @click="$router.push('/')" :icon="ArrowLeft">工作台</el-button>
      <div><h1>AI 剧本创作助手</h1><p>与 AI 创作助手讨论作品，查看剧本、修改和审核结果。</p></div>
      <el-tag effect="plain">AI 创作助手</el-tag>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <section class="product-start">
      <h2>继续创作已有作品</h2>
      <p>选择作品，阅读剧本或修改版本；直接告诉 AI 创作助手你希望改善什么。团队协作会创建独立草稿，原稿保持不变。</p>
      <el-button @click="mode='chat'">开始对话</el-button>
      <el-button v-if="!route.query.kernelTest" link @click="mode='team'">查看高级审阅</el-button>
      <el-button v-if="!route.query.kernelTest" link @click="showIntake = true">登记原创 / 小说改编</el-button>
      <p class="muted">直接告诉助手你想创作、修改或审核什么；后台会按需安排专业协作。</p>
    </section>
    <div class="assistant-layout" v-loading="loading">
      <aside class="context-panel">
        <h2>当前作品</h2>
        <el-select v-model="selected" placeholder="选择作品" @change="changeWork" aria-label="选择作品">
          <el-option v-for="work in works" :key="work.id" :value="work.id" :label="work.title" />
        </el-select>
        <p v-if="!works.length && !loading" class="muted">尚未关联作品资料。请由服务端配置原文件索引。</p>
        <div v-for="script in context?.scripts" :key="script.id" class="script-card">
          <strong>{{ script.title }}</strong>
          <el-tag type="warning" size="small">{{ editorLabel(`结论：${script.review_status}`) }}</el-tag>
          <p>草稿版本 · 尚未最终确认</p>
          <el-button link type="primary" @click="openSource(script.id)">查看原文</el-button>
        </div>
        <el-alert v-if="context" :title="context.approval_notice" type="info" :closable="false" />
        <el-alert v-for="gap in context?.gaps" :key="gap.id" :title="`${gap.title}：${gap.error}`" type="error" :closable="false" />
        <h2>作品资料</h2>
        <div v-for="source in context?.sources" :key="source.id" class="source-item">
          <el-button link @click="openSource(source.id)">{{ source.title }}</el-button>
          <small :class="source.available ? 'muted' : 'error-text'">{{ source.available ? `已核对 · ${source.sha256?.slice(0, 10)}…` : source.error }}</small>
        </div>
      </aside>
      <main class="conversation-panel">
        <div class="conversation-top">
          <h2>与 AI 创作助手对话</h2>
          <el-button size="small" @click="reload" :disabled="loading">刷新记录</el-button>
        </div>
      <p class="conversation-note">直接描述创作目标。明确的单集修改会自动生成独立候选并安排审核；分镜、视频生成及制作验收由视频模块负责。</p>
      <CreativeWorkflow ref="workflow" :revisions="revisions" :work-id="selected" :isolated="!!route.query.kernelTest" @reload="reload" :batches="batches" :candidates="episodeCandidates" :context="context" :render="renderReply" @open-candidate="openEpisodeCandidate" @export="exportText" />
      <section v-if="revisions.length" class="creation-progress">
        <h3>最近创作成果</h3>
        <article v-for="revision in revisions.slice(0, 3)" :key="revision.revision_id" class="progress-row">
          <div><strong>{{ revision.source_title || '剧本修改稿' }} · {{ revision.status === 'completed' ? '候选稿已完成' : statusLabel(revision.status) }}</strong><p class="muted">审核：{{ editorLabel(revision.editor_review) }} · {{ revision.approval_status === 'not_approved' ? '尚未确认' : '已确认，待发布' }}</p></div>
          <div><el-button v-if="revision.candidate_text" size="small" @click="openRevision(revision.revision_id)">查看剧本与审核</el-button><el-button v-if="revision.status==='awaiting_recovery'" size="small" @click="recoverRevision(revision.revision_id)">恢复进度</el-button></div>
        </article>
      </section>
      <section v-if="episodeCandidates.length || batches.length" class="creation-progress">
        <h3>分集创作进度</h3>
        <article v-for="batch in batches.slice(0, 3)" :key="batch.batch_id" class="progress-row"><div><strong>第 {{ batch.episode_start }}—{{ batch.episode_end }} 集 · {{ batch.planning_status === 'running' ? '正在故事策划' : batch.planning_status === 'experts' ? '正在专业团队设计' : batchStatusLabel(batch.status) }}</strong><p class="muted">已完成 {{ batch.completed_count }}/{{ batch.total_count }} · 当前第 {{ batch.current_episode || '等待' }} 集</p><details v-if="batch.planning_output"><summary>查看本次专业创作方案</summary><el-button size="small" @click="exportText(context?.title + ' · 专业策划',batch.planning_output)">导出专业策划</el-button><div class="markdown-body" v-html="renderReply(batch.planning_output, null)"></div></details><p v-if="batch.error_text" class="error-text">{{ batch.error_text }}</p></div><div class="progress-actions"><el-button v-if="['queued','running','pause_requested'].includes(batch.status)" size="small" @click="pauseBatch(batch)">暂停</el-button><el-button v-if="['paused','failed'].includes(batch.status)" size="small" type="primary" @click="resumeBatch(batch)">继续</el-button></div></article>
        <article v-for="candidate in episodeCandidates.slice(0, 5)" :key="candidate.candidate_id" class="progress-row"><div><strong>第 {{ candidate.episode_no }} 集 · {{ candidateStatusLabel(candidate.status) }}</strong><p class="muted">审核：{{ editorLabel(candidate.editor_review) }} · {{ candidate.approval_status === 'not_approved' ? '尚未确认' : '已确认，待发布' }}</p><p v-if="candidate.error_text" class="error-text">{{ candidate.error_text }}</p></div><div class="progress-actions"><el-button v-if="candidate.candidate_text" size="small" @click="openEpisodeCandidate(candidate)">阅读剧本与审核</el-button><el-button v-if="candidate.candidate_text" size="small" @click="exportText(`${route.query.kernelTest ? '雨林 · 故事内核独立测试 · ' : ''}第${candidate.episode_no}集 · 候选稿`,candidate.candidate_text)">导出草稿</el-button><el-button v-if="candidate.status==='awaiting_recovery'" size="small" @click="recoverEpisode(candidate)">回查原任务</el-button></div></article>
      </section>
        <p v-if="lastIntentNotice" class="intent-notice">{{ lastIntentNotice }}</p>
        <details v-if="mode === 'team' && !route.query.kernelTest" open class="advanced-tools">
        <summary>高级创作与审阅工具</summary>
        <section class="orchestration-panel">
          <h3>AI 团队协作</h3>
          <p class="muted">主编分析需求后按需组织编剧、人物关系或互动专家，并交给独立审核。结果是草稿，等待你的最终确认。</p>
          <el-input v-model="runRequest" type="textarea" :rows="3" :maxlength="1200" placeholder="例如：检查《雨林》第三集的连续性和人物关系，必要时提出局部修改建议，交给独立 Editor 审核，不要写第四集。" />
          <el-button type="primary" :loading="runSending" :disabled="!runRequest.trim()" @click="startRun">提交团队创作任务</el-button>
          <details v-for="run in runs" :key="run.run_id" class="run-card"><summary>团队创作记录 · {{ statusLabel(run.status) }}</summary>
            <div><strong>{{ run.status }}</strong><span class="muted"> · {{ run.run_id }}</span></div>
            <p class="muted">所选 Agent：{{ run.selected_agents?.join(', ') || 'Producer 正在制定计划' }}</p>
            <p v-if="run.result?.editor_review" class="reply-text"><strong>Independent Editor：</strong>{{ run.result.editor_review }}</p>
            <p v-if="run.result?.producer_decision" class="reply-text"><strong>Producer 决策：</strong>{{ run.result.producer_decision }}</p>
            <p v-if="run.error_text" class="error-text">{{ run.error_text }}</p>
            <p class="muted">草稿 · 尚未最终确认</p>
          </details>
        </section>
        <section class="orchestration-panel">
          <h3>阅读和审阅修改版本</h3><p class="muted">查看现有修改稿与独立审核意见。逐项决定不会批准整集，继续修订只记录你的要求。</p>
          <el-select v-model="revisionTarget" aria-label="选择要修改的剧本"><el-option v-for="s in context?.scripts" :key="s.id" :label="s.title" :value="s.id" /></el-select><el-input v-model="revisionGoal" type="textarea" :maxlength="1200" placeholder="说明你希望改善的情节、人物或节奏，以及必须保持不变的内容" /><el-button type="warning" :loading="revisionSending" @click="startRevision">让主编安排独立修改稿</el-button>
          <article v-for="revision in revisions" :key="revision.revision_id" :data-revision="revision.revision_id" class="run-card"><header class="revision-heading"><strong>{{ revision.revision_id.startsWith('acceptance_test_') ? '验收测试副本（不代表真实审阅） · ' : '' }}{{ revision.source_id === 'ep3' ? '第三集 · 修改版本' : revision.source_id }} · {{ statusLabel(revision.status) }}</strong><span>Editor：{{ editorLabel(revision.editor_review) }} · 最终确认：{{ revision.approval_status === 'not_approved' ? '尚未最终确认' : '已确认，待发布' }}</span></header><div v-if="revision.candidate_text" class="diff-toolbar"><el-radio-group v-model="diffMode[revision.revision_id]" size="small"><el-radio-button label="changes">只看修改</el-radio-button><el-radio-button label="all">查看全文</el-radio-button></el-radio-group><el-button size="small" @click="exportText((revisionSource[revision.revision_id]?.title || revision.source_id) + ' · 独立修改稿',revision.candidate_text)">导出修改稿（草稿）</el-button><span>{{ diffBlocks(revision).filter(b => b.type !== 'unchanged').length }} 处修改 · {{ decisions[revision.revision_id]?.length || 0 }} 项审阅决定</span></div><div class="revision-workbench"><div v-if="revision.candidate_text" class="diff-blocks"><section v-for="block in visibleDiffBlocks(revision)" :key="block.id" class="diff-block" :class="block.type"><div class="block-label">{{ block.type === 'added' ? '新增' : block.type === 'removed' ? '删除' : block.type === 'unchanged' ? '未修改' : '修改' }} · 原稿第 {{ block.oldLine }} 行 / 修改稿第 {{ block.newLine }} 行</div><div class="revision-diff"><pre class="source-document"><span v-for="(part,i) in block.oldParts" :key="i" :class="{ 'diff-removed-text': part.removed }">{{ part.value }}</span></pre><pre class="source-document"><span v-for="(part,i) in block.newParts" :key="i" :class="{ 'diff-added-text': part.added }">{{ part.value }}</span></pre></div><el-input v-if="block.type !== 'unchanged'" v-model="reviewNotes[block.id]" type="textarea" :maxlength="2000" placeholder="填写你的修改意见（可选）" /><div v-if="block.type !== 'unchanged'" class="review-actions"><el-button size="small" @click="decideRevision(revision,block,'accept')">接受修改</el-button><el-button size="small" @click="decideRevision(revision,block,'reject')">退回修改</el-button><el-button size="small" @click="decideRevision(revision,block,'revise')">要求继续修订</el-button><el-button size="small" @click="decideRevision(revision,block,'undecided')">暂不决定</el-button><span>{{ decisionLabel(decisions[revision.revision_id],block.id) }}</span></div></section></div><div v-else class="revision-diff"><pre class="source-document">{{ revisionSource[revision.revision_id]?.text || '原稿加载中…' }}</pre><pre class="source-document">{{ revision.candidate_text || '候选稿尚未生成' }}</pre></div><aside v-if="revision.editor_review" class="editor-review"><h4>Independent Editor · 全局意见 / 待定位</h4><div class="markdown-body" v-html="renderReply(revision.editor_review, null)"></div></aside></div><details class="trace"><summary>技术详情</summary><p>Revision：{{ revision.revision_id }}<br>原稿 SHA256：{{ revision.source_sha256 }}<br>候选 SHA256：{{ revision.candidate_sha256 || '等待生成' }}<br>Writer Task：{{ revision.writer_task_id || '无' }} · Editor Task：{{ revision.editor_task_id || '无' }}</p></details><el-button v-if="['failed','awaiting_recovery','awaiting_next_authorization'].includes(revision.status) && (revision.editor_task_id || revision.writer_task_id || revision.producer_task_id)" size="small" @click="recoverRevision(revision.revision_id)">恢复原任务状态（不重发）</el-button><el-button v-if="revision.status === 'completed' && revision.approval_status === 'not_approved' && ['审核通过','审核有条件通过，仍需修改或确认'].includes(editorLabel(revision.editor_review))" type="primary" size="small" @click="approveRevision(revision.revision_id)">确认完整修改版本</el-button></article>
        </section>
        </details>
        <div v-if="!route.query.kernelTest && !messages.length" class="empty-chat">
          <el-icon :size="32"><ChatDotRound /></el-icon>
          <h3>从已有作品开始聊</h3>
          <p>发送问题时，会读取并核对原始资料，按长度预算提供片段；未提供的内容会明确列出。</p>
          <el-button v-for="prompt in prompts" :key="prompt" @click="draft = prompt" plain>{{ prompt }}</el-button>
        </div>
        <article v-for="m in messages" :key="m.id" class="chat-turn">
          <section class="user-message"><span>你</span><p>{{ m.content }}</p></section>
          <section class="agent-message">
            <div class="agent-label"><strong>AI 创作助手</strong><el-tag :type="m.task?.task_status === 'completed' ? 'success' : 'info'" size="small">{{ statusLabel(m.task?.task_status) }}</el-tag></div>
            <div v-if="m.task?.output_text" class="reply-text markdown-body" v-html="renderReply(m.task.output_text, m.context)"></div>
            <p v-else-if="isActive(m.task)" class="muted">任务由本地服务执行中，可以离开页面，稍后恢复结果。</p>
            <p v-else class="error-text">{{ m.task?.error_text || '尚未取得完整正文。执行状态不代表剧本质量通过。' }}</p>
            <p v-if="m.task?.output_text && m.task?.error_text" class="error-text">{{ m.task.error_text }}</p>
            <el-button v-if="!isActive(m.task) && m.task?.task_status !== 'completed' && m.task?.session_id" size="small" @click="refreshTask(m)">回查原 Session（不重发）</el-button>
            <details class="trace"><summary>资料依据与任务记录 · {{ m.context.input_chars }} / 8000 字符</summary>
              <p class="muted">{{ m.context.omission_notice }}</p>
              <p>使用历史轮次：{{ m.context.history_included.join(', ') || '无' }}；省略轮次：{{ m.context.history_omitted.join(', ') || '无' }}</p>
              <p>Task：{{ m.task?.task_id }}<br>Session：{{ m.task?.session_id || '尚未开始' }}<br>模型：{{ m.task?.model_id || '尚未返回' }}<br>输入哈希：{{ m.task?.input_version }}<br>输出哈希：{{ m.task?.output_version || '尚未取得' }}</p>
              <p v-if="m.task?.usage">tokens：输入 {{ m.task.usage.input_tokens || 0 }} / 输出 {{ m.task.usage.output_tokens || 0 }} / 缓存读取 {{ m.task.usage.cache_read_input_tokens || 0 }}；请求 {{ m.task.usage.requests || 0 }}，缺失 {{ m.task.usage.missing_usage_requests || 0 }}。</p>
              <p v-if="m.task?.cost?.status === 'calculated' || m.task?.cost?.status === 'partial'">费用：{{ m.task.cost.currency }} {{ m.task.cost.amount.toFixed(6) }}（{{ m.task.cost.status === 'partial' ? '已覆盖费用；总费用未知' : '按价格版本计算' }}）</p>
              <p v-else-if="m.task?.cost?.status === 'unconfigured'" class="muted">费用：价格未配置（模型 {{ m.task.cost.model_id || '未知' }}），仅展示真实 Token 用量。</p>
              <div v-for="source in m.context.sources" :key="source.id" class="source-proof">
                <strong>[S:{{ source.id }}] {{ source.title }}</strong>
                <p class="muted">提供 {{ source.included_chars }} / {{ source.total_chars }} 字符；省略 {{ source.omitted_chars }} 字符。SHA256 {{ source.sha256 }}</p>
                <pre v-for="part in source.excerpts" :key="part.start_line">[S:{{ source.id }}:L{{ part.start_line }}-{{ part.end_line }}]
{{ part.text }}</pre>
              </div>
            </details>
          </section>
        </article>
        <form class="composer" @submit.prevent="send">
          <p v-if="readingCandidate">当前阅读第{{ readingCandidate.episode_no }}集；未指定集数的修改意见将用于这一集。</p>
          <el-input v-model="draft" type="textarea" :rows="3" :maxlength="1200" show-word-limit placeholder="告诉我想写什么，或打开剧本后提出修改意见" aria-label="创作要求" />
          <div class="composer-footer"><span>作品对话 · 发送前会显示费用配置状态 · 不自动重试</span>
            <el-button native-type="submit" type="primary" :loading="sending" :disabled="!canSend">发送给创作助手</el-button></div>
          <p class="muted">发送前费用预估：价格未配置；将显示真实 Token 用量，无法可靠估算金额。</p>
          <p v-if="lastIntentNotice" class="muted">{{ lastIntentNotice }}</p>
        </form>
      </main>
    </div>
    <el-dialog v-model="showIntake" title="登记一个创作作品" width="min(620px, 94vw)">
      <p class="muted">登记只保存作品设定和合法测试原文，不会调用模型或修改已有作品。</p>
      <el-form label-position="top">
        <el-form-item label="作品 ID"><el-input v-model="intake.work_id" placeholder="例如: lighthouse-story" /></el-form-item>
        <el-form-item label="作品标题"><el-input v-model="intake.title" /></el-form-item>
        <el-form-item label="创作类型"><el-radio-group v-model="intake.kind"><el-radio-button label="original">原创</el-radio-button><el-radio-button label="adaptation">小说改编</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="故事设定"><el-input v-model="intake.premise" type="textarea" :rows="4" maxlength="12000" show-word-limit /></el-form-item>
        <el-form-item v-if="intake.kind === 'adaptation'" label="合法测试原文"><el-input v-model="intake.source_text" type="textarea" :rows="6" maxlength="50000" show-word-limit /></el-form-item>
        <el-form-item v-if="intake.kind === 'adaptation'" label="原文名称"><el-input v-model="intake.source_label" placeholder="例如: lawful-fixture.txt" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showIntake = false">取消</el-button><el-button type="primary" :loading="intakeSending" @click="submitIntake">保存并打开作品</el-button></template>
    </el-dialog>
    <el-dialog v-model="showSource" :title="sourceView?.title || '作品原文件'" width="min(850px, 94vw)">
      <details class="trace"><summary>来源详情</summary><p class="muted">{{ sourceView?.path }}<br>SHA256：{{ sourceView?.sha256 }}</p></details>
      <el-button :disabled="!sourceView?.available" @click="exportText(sourceView.title,sourceView.raw_text || sourceView.text)">导出当前剧本草稿</el-button>
      <el-button v-if="sourceView?.editor_review" @click="exportText(sourceView.title + ' · 专业评定',sourceView.editor_review)">导出专业评定</el-button>
      <el-alert v-if="sourceView?.is_candidate && !sourceView?.editor_review" title="当前版本尚无独立审核结果，正文可阅读和导出，但不能视为审核通过。" type="warning" :closable="false" />
      <template v-if="sourceView?.editor_review"><el-divider /><h3>Independent Editor 审核意见</h3><div class="markdown-body" v-html="renderReply(sourceView.editor_review, null)"></div><p class="muted">审核结论不等于人工批准：当前版本仍需明确确认。</p></template>
      <el-alert v-if="citationNotice" :title="citationNotice" type="warning" :closable="false" />
      <div v-if="sourceView?.is_candidate && sourceView?.available" class="markdown-body" v-html="renderReply(sourceView.text, null)"></div><pre v-else class="source-document">{{ sourceView?.available ? sourceView.text : sourceView?.error }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ElMessageBox } from 'element-plus'
import CreativeWorkflow from '@/components/CreativeWorkflow.vue'
import { revisionDiff } from '@/utils/revisionDiff'
import { readableEpisodes, nextEpisodeNumber } from '@/utils/scriptResults'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, ChatDotRound } from '@element-plus/icons-vue'
import { createCreativePlan, getKernelTest, getAssistantWorks, registerAssistantWork, getAssistantContext, getAssistantIntent, getAssistantMessages, sendAssistantMessage, refreshAssistantMessage, getAssistantSource, getAssistantRuns, createAssistantRun, getAssistantRevisions, createAssistantRevision, createAssistantCandidateRevision, approveAssistantRevision, refreshAssistantRevision, recoverAssistantEditor, getReviewDecisions, saveReviewDecision, getAssistantCandidates, getAssistantBatches, createAssistantEpisode, createAssistantBatch, pauseAssistantBatch, resumeAssistantBatch, recoverAssistantEpisode } from '@/api/scriptAssistant'

const router = useRouter(), route = useRoute()
const works = ref([]), selected = ref(''), context = ref(null), messages = ref([]), draft = ref(''), budget = ref({})
const workflow = ref(null)
const readingCandidate = ref(null)
const loading = ref(false), sending = ref(false), error = ref(''), showSource = ref(false), sourceView = ref(null), citationNotice = ref('')
const mode = ref('chat'), runRequest = ref(''), runs = ref([]), runSending = ref(false)
const revisions = ref([]), revisionSending = ref(false), revisionTarget = ref('ep3'), revisionGoal = ref(''), episodeCandidates = ref([]), batches = ref([])
const showIntake = ref(false), intakeSending = ref(false), intake = ref({ work_id: '', title: '', kind: 'original', premise: '', source_text: '', source_label: '' })
const revisionSource = ref({}), decisions = ref({})
const diffMode = ref({}), reviewNotes = ref({})
const lastIntentNotice = computed(() => {
  const intent = messages.value.at(-1)?.context?.request_intent
  if (!intent || intent.status === 'ready' && intent.intent === 'chat') return ''
  if (intent.status === 'clarification_required') return intent.reason || '这个创作请求需要先确认范围。'
  if (intent.intent === 'revise_episode') return `已识别为第${intent.episode || '指定'}集修改请求；可在高级审阅中启动候选版本。`
  if (intent.intent === 'review') return '已识别为审核请求；助手会基于当前作品资料给出可追溯建议。'
  return ''
})
const prompts = ['我们前三集剧本现在是什么状态？', '第一集和第三集之间，有哪些需要注意的连续性问题？', '你建议先修改前三集，还是开始第四集？说明依据。']
let timer, requestKey = null, submittedText = null, generation = 0, alive = true
const isActive = task => ['queued', 'starting', 'submitted', 'running'].includes(task?.task_status)
const canSend = computed(() => selected.value && draft.value.trim() && !sending.value && !messages.value.some(m => isActive(m.task)) && (!budget.value.chat?.limit || budget.value.chat.remaining > 0) && !context.value?.gaps?.length)
const statusLabel = state => ({ queued: '排队', starting: '创建 Session', submitted: '已提交', running: '执行中', planning: '正在策划', writing: '正在修改', reviewing: '正在审核', awaiting_recovery: '等待恢复', completed: '回复已返回', failed: '执行失败', incomplete: '正文不完整', interrupted: '服务重启中断' }[state] || state)
const batchStatusLabel = state => ({ queued: '等待创作', running: '创作中', pause_requested: '即将暂停', paused: '已暂停', completed: '已完成', failed: '需要处理' }[state] || state)
const candidateStatusLabel = state => ({ queued: '等待创作', writing: '正在创作', reviewing: '正在审核', awaiting_recovery: '等待恢复', completed: '候选已完成', failed: '创作失败' }[state] || state)
async function pauseBatch(batch) { try { await pauseAssistantBatch(batch.batch_id); await reload() } catch (e) { error.value = e.message } }
async function resumeBatch(batch) { try { await resumeAssistantBatch(batch.batch_id); await reload() } catch (e) { error.value = e.message } }
async function recoverEpisode(candidate) { try { await recoverAssistantEpisode(candidate.candidate_id); await reload() } catch (e) { error.value = e.response?.data?.error?.message || e.message } }
async function submitIntake() {
  if (intakeSending.value) return
  intakeSending.value = true; error.value = ''
  try {
    const payload = { ...intake.value }
    const data = await registerAssistantWork(payload)
    showIntake.value = false
    const refreshed = await getAssistantWorks(); works.value = refreshed.works; budget.value = refreshed.budget
    selected.value = data.id || payload.work_id
    intake.value = { work_id: '', title: '', kind: 'original', premise: '', source_text: '', source_label: '' }
    await changeWork()
  } catch (e) { error.value = e.response?.data?.error?.message || e.message } finally { intakeSending.value = false }
}
async function reloadMessages() {
  if(route.query.kernelTest) return

  const id = selected.value, token = generation
  const data = await getAssistantMessages(id)
  if (!alive || token !== generation || id !== selected.value) return
  messages.value = data.messages; budget.value = data.budget
}
async function reload() {
  if(route.query.kernelTest){messages.value=[];runs.value=[];revisionSource.value={};decisions.value={};const x=await getKernelTest(route.query.kernelTest);selected.value=x.work_id;works.value=[{id:x.work_id,title:x.title}];context.value={title:x.title,sources:[x.source],scripts:[],approval_notice:'本轮仅使用故事内核，旧规划与旧稿未加载；新测试版本未批准。'};batches.value=x.batches;episodeCandidates.value=x.candidates;revisions.value=(await getAssistantRevisions(x.work_id,route.query.kernelTest)).revisions;return;}
  if (!selected.value) return
  error.value = ''
  try { await reloadMessages(); context.value = await getAssistantContext(selected.value); runs.value = (await getAssistantRuns(selected.value)).runs; revisions.value = (await getAssistantRevisions(selected.value)).revisions; episodeCandidates.value=(await getAssistantCandidates(selected.value)).candidates; batches.value=(await getAssistantBatches(selected.value)).batches; await loadRevisionDetails() } catch (e) { error.value = e.message }
}
async function loadRevisionDetails() {
  for (const r of revisions.value) {
    decisions.value[r.revision_id] = (await getReviewDecisions(r.revision_id)).decisions; for (const d of decisions.value[r.revision_id]) reviewNotes.value[d.block_id] = d.note || ''
    if (r.source_text_snapshot) revisionSource.value[r.revision_id] = { title:r.source_title, text:r.source_text_snapshot, sha256:r.source_sha256, available:true }
    else if (r.candidate_text) revisionSource.value[r.revision_id] = await getAssistantSource(selected.value, r.source_id)
  }
}
async function changeWork() {
  const preferred=works.value.find(w=>w.id===selected.value)?.preferred_kernel_test
  if(selected.value==='rainforest' && preferred && !route.query.kernelTest) {
    await router.replace({query:{work:selected.value,kernelTest:preferred}})
    await reload();return
  }
  if(route.query.kernelTest){await reload();return;}
  generation++; readingCandidate.value = null; messages.value = []; context.value = null; error.value = ''; loading.value = true
  requestKey = null; submittedText = null
  await router.replace({ query: { work: selected.value } })
  try { context.value = await getAssistantContext(selected.value); await reloadMessages(); runs.value = (await getAssistantRuns(selected.value)).runs; revisions.value = (await getAssistantRevisions(selected.value)).revisions; episodeCandidates.value=(await getAssistantCandidates(selected.value)).candidates; batches.value=(await getAssistantBatches(selected.value)).batches; for (const r of revisions.value) { decisions.value[r.revision_id] = (await getReviewDecisions(r.revision_id)).decisions; for (const d of decisions.value[r.revision_id]) reviewNotes.value[d.block_id] = d.note || ''; if (r.source_text_snapshot) revisionSource.value[r.revision_id] = { title:r.source_title, text:r.source_text_snapshot, sha256:r.source_sha256, available:true }; else if (r.candidate_text) { const s = context.value.sources.find(x => x.id === r.source_id); if (s) revisionSource.value[r.revision_id] = await getAssistantSource(selected.value, s.id) } } } catch (e) { error.value = e.message } finally { loading.value = false }
}
async function startRevision() { if (revisionSending.value) return; revisionSending.value=true; error.value=''; try { await createAssistantRevision(selected.value,revisionTarget.value,revisionGoal.value); revisionGoal.value=''; await reload() } catch(e) { error.value=e.message } finally { revisionSending.value=false } }
async function approveRevision(id) { const r = revisions.value.find(x => x.revision_id === id); const version = {source_sha256:r.source_sha256,candidate_sha256:r.candidate_sha256}; try { await ElMessageBox.confirm('确认指定的完整修改版本？逐项接受不是整集批准。本操作仅记录待发布确认，不写入正式版本或视频制作。', '最终版本确认', { confirmButtonText: '明确确认此版本', cancelButtonText: '继续审阅' }); await approveAssistantRevision(id, version); await reload() } catch(e) { if (e !== 'cancel' && e !== 'close') error.value=e.message } }
function diffBlocks(revision) {
  const source = revisionSource.value[revision.revision_id]
  if (!source?.available || source.sha256 !== revision.source_sha256) return []
  return revisionDiff(source.text, revision.candidate_text || '', revision.source_sha256, revision.candidate_sha256)
}
function visibleDiffBlocks(revision) { const blocks = diffBlocks(revision); return diffMode.value[revision.revision_id] === 'all' ? blocks : blocks.filter(b => b.type !== 'unchanged') }
function editorLabel(text) { const heading = String(text || '').split('\n').slice(0,4).join('\n'); const m = heading.match(/(?:结论|裁定|判定|评定|Verdict)[^\n:：]*[:：]\s*(?:\*\*)?(CONDITIONAL PASS|PASS|FAIL)\b/i) || heading.match(/^\s*(?:#{1,6}\s+)?(?:\*\*)?(CONDITIONAL PASS|PASS|FAIL)(?:\*\*)?\s*$/im); return m ? ({ PASS: '审核通过', 'CONDITIONAL PASS': '审核有条件通过，仍需修改或确认', FAIL: '审核发现问题' }[m[1].toUpperCase()]) : '审核结论待核实' }
function exportText(title, text) {
  const body = `# ${title}\n\n> 草稿导出，尚未最终确认；AI 审核不替代人工批准。\n\n${text}`
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `${title.replace(/[\\/:*?"<>|]/g,'_')}-草稿.md`; link.click(); URL.revokeObjectURL(url)
}
function decisionLabel(items = [], blockId) { return items.find(x => x.block_id === blockId)?.action ? ({accept:'已接受此项（不是整集批准）',reject:'已退回此项',revise:'已记录继续修订要求',undecided:'暂不决定'}[items.find(x => x.block_id === blockId).action]) : '未决定' }
async function decideRevision(revision, block, action) { try { decisions.value[revision.revision_id] = (await saveReviewDecision(revision.revision_id, { block_id: block.id, action, note: reviewNotes.value[block.id] || '', source_sha256: revision.source_sha256, candidate_sha256: revision.candidate_sha256 })).decisions } catch(e) { error.value=e.message } }
async function recoverRevision(id) { try { await refreshAssistantRevision(id); await reload() } catch(e) { error.value=e.message } }
async function recoverEditor(id) { try { await recoverAssistantEditor(id); await reload() } catch(e) { error.value=e.message } }
async function startRun() {
  if (!runRequest.value.trim() || runSending.value) return
  runSending.value = true; error.value = ''
  try { await createAssistantRun(selected.value, runRequest.value.trim()); runRequest.value = ''; await reload() } catch (e) { error.value = e.message } finally { runSending.value = false }
}
function openRevision(id) {
  const revision = revisions.value.find(item => item.revision_id === id)
  if (!revision?.candidate_text) return
  const candidate = episodeCandidates.value.find(item => item.candidate_id === revision.candidate_id)
  if (candidate) readingCandidate.value = { candidate_id: candidate.candidate_id, episode_no: Number(candidate.episode_no) }
  sourceView.value = { title: revision.source_title || '剧本修改稿', text: revision.candidate_text,
    is_candidate: true, available: true, sha256: revision.candidate_sha256, editor_review: revision.editor_review }
  showSource.value = true
}
function openEpisodeCandidate(candidate) { readingCandidate.value = { candidate_id:candidate.candidate_id, episode_no:Number(candidate.episode_no) }; sourceView.value = { title: `${route.query.kernelTest ? '雨林 · 故事内核独立测试 · ' : ''}第${candidate.episode_no}集候选稿`, text: candidate.candidate_text, is_candidate: true, available: true, sha256: candidate.candidate_sha256, editor_review: candidate.editor_review }; showSource.value = true }
function routeScope(){return route.query.kernelTest || undefined}
async function send() {

  if (!canSend.value) return
  const text = draft.value.trim()
  sending.value = true; error.value = ''
  try {
    const route = await getAssistantIntent(selected.value, text, routeScope())
    if(routeScope() && !['read_plan','export_plan','read_scripts','export_script','revise_episode'].includes(route.intent?.intent)) throw new Error('当前只处理这份故事内核版本的第一集。请提出修改意见，或查看、导出现有成果。')
    if(route.intent?.intent==='export_plan') {
      if(!workflow.value?.exportPlan(route.intent.stage)) throw new Error('尚无可导出的策划，请先打开已有方案或完成策划。')
      draft.value='';return
    }
    if(route.intent?.intent==='read_plan') {
      workflow.value?.showPlan(route.intent.stage)
      document.querySelector('.creative-workflow')?.scrollIntoView({behavior:'smooth'})
      draft.value='';return
    }
    if (['read_scripts','export_script'].includes(route.intent?.intent)) {
      const number=route.intent.episode || (route.intent.intent==='export_script' ? readingCandidate.value?.episode_no : null)
      const unique=readableEpisodes(episodeCandidates.value,revisions.value,number)
      if(!unique.length) throw new Error('没有找到可阅读的候选正文，请先完成创作或指定已有集数。')
      if(route.intent.intent==='export_script') exportText(context.value?.title || '剧本',unique.map(c=>`# 第${c.episode_no}集\n\n${c.candidate_text}`).join('\n\n'))
      else if(number) openEpisodeCandidate(unique[0])
      else {workflow.value?.showScripts(); document.querySelector('.creative-workflow')?.scrollIntoView({behavior:'smooth'})}
      draft.value='';return
    }

    if (route.intent?.intent === 'plan' && route.intent.status === 'ready') { await createCreativePlan(selected.value,{episode_start:route.intent.episode_start,episode_end:route.intent.episode_end,request:text}); draft.value='';await reload();return }
    if (route.intent?.intent === 'create_episode') { await createAssistantEpisode(selected.value,route.intent.episode,text);draft.value='';await reload();return }
    if (route.intent?.intent === 'revise_episode' && route.intent.status === 'ready') {
      const n = route.intent.episode || readingCandidate.value?.episode_no || (routeScope()?1:null)
      if (!n) throw new Error('请先打开要修改的剧本，或说明集数，例如：优化第二集。')
      const numeral = ({1:'一',2:'二',3:'三',4:'四',5:'五',6:'六',7:'七',8:'八',9:'九',10:'十'})[n]
      const source = context.value?.scripts?.find(s => new RegExp(`(?:第\\s*(?:${n}|${numeral})\\s*集|\\bep0*${n}\\b)`, 'i').test(`${s.title} ${s.id}`))
      const reading = !route.intent.episode && readingCandidate.value ? episodeCandidates.value.find(c=>c.candidate_id===readingCandidate.value.candidate_id) : null
      const candidate = reading || [...episodeCandidates.value].filter(c => Number(c.episode_no) === n && c.status === 'completed' && c.candidate_text).sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      if (candidate) await createAssistantCandidateRevision(selected.value, candidate.candidate_id, text)
      else if (source) await createAssistantRevision(selected.value, source.id, text)
      else throw new Error(`当前作品资料中没有可核验的第${n}集原稿或候选稿，未启动修改。`)
      draft.value = ''; mode.value = 'chat'; await reload(); return
    }
    if (['next_episode','continue_episodes'].includes(route.intent?.intent)) {
      const next = nextEpisodeNumber(context.value?.scripts,episodeCandidates.value)
      const pending = episodeCandidates.value.find(c => ['queued','writing','reviewing','awaiting_recovery'].includes(c.status));
      if (pending) throw new Error(`第${pending.episode_no}集仍在处理中或等待恢复，请先继续原创作任务，避免跳过剧情。`)
      if (route.intent.intent === 'continue_episodes') await createAssistantBatch(selected.value, next, next + route.intent.count - 1, text)
      else await createAssistantEpisode(selected.value, next, text)
      draft.value = ''; await reload(); return
    }
    if (route.intent?.intent === 'create_episode_range') {
      await createAssistantBatch(selected.value, route.intent.episode_start, route.intent.episode_end, text); draft.value = ''; await reload(); return
    }
    if (route.intent?.intent === 'create_all' && route.intent?.status === 'ready') {
      const start = nextEpisodeNumber(context.value?.scripts,episodeCandidates.value)
      const later=episodeCandidates.value.find(c=>c.candidate_text && Number(c.episode_no)>start && Number(c.episode_no)<=route.intent.total_episodes)
      if(later) throw new Error(`第${start}集尚缺失，但后面已有候选。请先创作第${start}集并检查连续性，再继续全集；已有成果不会被静默重写。`)
      if (start > route.intent.total_episodes) throw new Error(`已存在第${route.intent.total_episodes}集或更高集数，没有可创建的剩余集数。`)
      await createAssistantBatch(selected.value, start, route.intent.total_episodes, text); draft.value = ''; await reload(); return
    }
    if (route.intent?.status === 'clarification_required') { error.value = route.intent.reason; return }
  if (submittedText !== draft.value.trim()) { requestKey = crypto.randomUUID(); submittedText = draft.value.trim() }
    await sendAssistantMessage(selected.value, submittedText, requestKey); draft.value = ''; requestKey = null; submittedText = null; await reloadMessages()
  } catch (e) { error.value = e.message; await reloadMessages().catch(() => {}) }
  finally { sending.value = false }
}
async function refreshTask(m) {
  try { await refreshAssistantMessage(selected.value, m.id); await reloadMessages() } catch (e) { error.value = e.message }
}
async function openSource(id) {
  if(route.query.kernelTest){sourceView.value=context.value.sources.find(x=>x.id===id);showSource.value=true;return;}
  try { sourceView.value = await getAssistantSource(selected.value, id); showSource.value = true } catch (e) { error.value = e.message }
}
function renderReply(text, context) {
  const refs = new Map((context?.sources || []).map(s => [s.id, s]))
  const normalized = String(text || '').replace(/\[S:([A-Za-z0-9_-]+):L(\d+)(?:-(\d+))?\]/g, (full, id, start, end) => {
    const source = refs.get(id); if (!source || !source.available) return full
    const a = Number(start), b = Number(end || start)
    const valid = source.excerpts?.some(e => a >= e.start_line && b <= e.end_line)
    if (!valid) return full
    return `<button class="citation-link" data-source="${id}" data-start="${a}" data-end="${b}">${full}</button>`
  })
  const html = marked.parse(normalized, { breaks: true })
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-source', 'data-start', 'data-end'] })
}
async function openCitation(sourceId, start, end) {
  citationNotice.value = ''
  const source = context.value?.sources?.find(s => s.id === sourceId)
  if (!source || !source.available) { citationNotice.value = '资料不可用，无法验证该引用。'; return }
  try {
    const view = await getAssistantSource(selected.value, sourceId)
    const lines = String(view.text || '').split(/\r?\n/)
    if (start < 1 || end > lines.length) { citationNotice.value = '引用行号超出原始资料范围，未定位。'; return }
    sourceView.value = { ...view, raw_text: view.text, text: lines.map((line, i) => `${String(i + 1).padStart(4, ' ')} ${i + 1 >= start && i + 1 <= end ? '▸ ' : '  '}${line}`).join('\n') }
    showSource.value = true
  } catch (e) { citationNotice.value = e.message }
}
function onCitationClick(event) { const el = event.target.closest?.('.citation-link'); if (el) openCitation(el.dataset.source, Number(el.dataset.start), Number(el.dataset.end)) }
onMounted(async () => {
  document.addEventListener('click', onCitationClick)
  loading.value = true
  try {
    if(route.query.kernelTest){await reload()} else {
    const data = await getAssistantWorks(); works.value = data.works; budget.value = data.budget
    selected.value = works.value.find(w => w.id === route.query.work)?.id || works.value.find(w=>w.id==='rainforest')?.id || works.value[0]?.id || ''
    if (selected.value) await changeWork()
    }
  } catch (e) { error.value = e.response?.status === 404 ? '本服务尚未启用剧本助手，请使用已配置的 M1 工作台服务。' : e.message }
  finally { loading.value = false }
  timer = setInterval(() => { if (selected.value && (batches.value.some(b => ['queued','running','pause_requested'].includes(b.status)) || episodeCandidates.value.some(c => ['writing','reviewing'].includes(c.status)) || messages.value.some(m => isActive(m.task)) || runs.value.some(r => ['queued','planning','experts','reviewing','deciding'].includes(r.status)) || revisions.value.some(r => ['queued','planning','writing','reviewing'].includes(r.status)))) reload().catch(e => { error.value = e.message }) }, 5000)
})
onUnmounted(() => { alive = false; clearInterval(timer); document.removeEventListener('click', onCitationClick) })
</script>

<style scoped>
.assistant-page { max-width: 1400px; margin: auto; padding: 26px; }
.assistant-header { display: flex; gap: 22px; align-items: center; padding-bottom: 24px; }
.assistant-header h1 { font-size: 24px; margin: 0 0 7px; }
.assistant-header p { margin: 0; color: var(--text-secondary); }
.assistant-header > .el-tag { margin-left: auto; }
.assistant-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 24px; }
.context-panel, .conversation-panel { background: var(--bg-card, white); border: 1px solid var(--border-color, #ddd); border-radius: 14px; padding: 22px; }
h2 { font-size: 16px; margin: 0 0 16px; } .context-panel h2:not(:first-child) { margin-top: 24px; }
.script-card { margin: 16px 0; padding: 14px; border: 1px solid var(--border-color, #ddd); border-radius: 9px; }
.script-card strong { display: block; margin-bottom: 8px; } .script-card p, .muted, .conversation-note { font-size: 12px; color: var(--text-secondary); line-height: 1.7; }
.context-panel .el-select { width: 100%; } .source-item { margin: 10px 0; } .source-item small { display: block; }
.source-item .el-button { white-space: normal; text-align: left; height: auto; }
.conversation-top, .agent-label, .composer-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.conversation-top h2 { margin: 0; } .conversation-note { margin-bottom: 25px; }
.mode-switch { margin-bottom: 18px; } .orchestration-panel { border: 1px solid var(--border-color, #ddd); border-radius: 9px; padding: 16px; margin-bottom: 22px; } .orchestration-panel h3 { margin: 0 0 8px; } .orchestration-panel .el-button { margin-top: 12px; } .run-card { border-top: 1px solid var(--border-color, #ddd); margin-top: 16px; padding-top: 14px; }
.empty-chat { text-align: center; padding: 50px 12px; color: var(--text-secondary); }
.empty-chat .el-button { display: block; margin: 12px auto; white-space: normal; height: auto; padding: 12px; }
.chat-turn { margin-bottom: 28px; } .user-message { padding: 14px 18px; border-radius: 10px; background: var(--bg-page); margin-left: 35px; }
.user-message span { font-size: 12px; color: var(--text-secondary); } .user-message p { white-space: pre-wrap; line-height: 1.65; margin: 6px 0; }
.agent-message { padding: 20px 0; } .agent-label { justify-content: flex-start; }
.reply-text { line-height: 1.85; font-size: 14px; } .revision-heading,.diff-toolbar { display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap; } .revision-workbench { display:grid; grid-template-columns:minmax(0,2fr) minmax(260px,1fr); gap:16px; } .revision-diff { display:grid; grid-template-columns:1fr 1fr; gap:12px; } .diff-block { border-left:3px solid var(--el-border-color); padding:8px; margin:10px 0; } .diff-block.added { border-color:var(--el-color-success); } .diff-block.removed { border-color:var(--el-color-danger); } .diff-block.modified { border-color:var(--el-color-warning); } .diff-added-text { background:#d9f2df; } .diff-removed-text { background:#f8dada; text-decoration:line-through; } .block-label { font-weight:600; } .review-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:10px 0; } .editor-review { border-left:1px solid var(--el-border-color); padding-left:14px; } .markdown-body :deep(p) { margin: 8px 0; } .markdown-body :deep(pre) { overflow: auto; padding: 10px; background: var(--bg-page); border-radius: 6px; } .markdown-body :deep(blockquote) { border-left: 3px solid var(--el-color-primary); padding-left: 12px; color: var(--text-secondary); } .citation-link { border: 0; background: transparent; color: var(--el-color-primary); cursor: pointer; padding: 0 2px; text-decoration: underline; }
.trace { border-top: 1px solid var(--border-color, #ddd); padding-top: 14px; font-size: 12px; overflow-wrap: anywhere; }
.trace summary { cursor: pointer; color: var(--text-secondary); } .trace p { line-height: 1.6; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.7; }
.source-proof { padding: 10px 0; } .source-proof pre { background: var(--bg-page); border-radius: 6px; padding: 12px; }
.source-document { max-height: 65vh; overflow-y: auto; }
.composer { border-top: 1px solid var(--border-color, #ddd); padding-top: 18px; } .composer-footer { margin-top: 12px; font-size: 12px; color: var(--text-secondary); }
.creation-progress { border-bottom: 1px solid var(--border-color, #ddd); padding: 0 0 12px; margin-bottom: 16px; }
.creation-progress h3 { font-size: 15px; margin: 0 0 8px; }
.progress-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border-color, #ddd); }
.progress-row p { margin: 4px 0 0; }
.advanced-tools { border-top: 1px solid var(--border-color, #ddd); padding: 10px 0; margin: 16px 0; }
.advanced-tools > summary { cursor: pointer; font-weight: 600; }
.error-text { color: var(--el-color-danger); }
@media (max-width: 850px) { .assistant-layout { grid-template-columns: 1fr; } .assistant-page { padding: 14px; } .assistant-header { flex-wrap: wrap; } .assistant-header > .el-tag { margin-left: 0; } }
@media (max-width: 1100px) { .revision-workbench { grid-template-columns: 1fr; } .editor-review { border-left:0; border-top:1px solid var(--el-border-color); padding:12px 0; } } @media (max-width:700px) { .assistant-layout,.revision-diff { grid-template-columns:1fr; } .source-document { overflow-wrap:anywhere; } }
</style>
