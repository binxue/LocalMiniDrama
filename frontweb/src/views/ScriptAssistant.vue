<template>
  <div class="assistant-page">
    <header class="assistant-header">
      <el-button @click="$router.push('/')" :icon="ArrowLeft">工作台</el-button>
      <div><h1>AI 剧本创作助手</h1><p>与 Producer 讨论作品，保留每次对话的资料依据。</p></div>
      <el-tag effect="plain">Producer · 真实 Managed Agent</el-tag>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="assistant-layout" v-loading="loading">
      <aside class="context-panel">
        <h2>当前作品</h2>
        <el-select v-model="selected" placeholder="选择作品" @change="changeWork" aria-label="选择作品">
          <el-option v-for="work in works" :key="work.id" :value="work.id" :label="work.title" />
        </el-select>
        <p v-if="!works.length && !loading" class="muted">尚未关联作品资料。请由服务端配置原文件索引。</p>
        <div v-for="script in context?.scripts" :key="script.id" class="script-card">
          <strong>{{ script.title }}</strong>
          <el-tag type="warning" size="small">{{ script.review_status }}</el-tag>
          <p>候选版本 · 人工批准未记录 · 未确立 Canon</p>
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
          <h2>与 Producer 对话</h2>
          <el-button size="small" @click="reload" :disabled="loading">刷新记录</el-button>
        </div>
        <p class="conversation-note">讨论与建议不会改写剧本。分镜、视频生成及制作验收由视频模块负责。</p>
        <el-radio-group v-model="mode" size="small" class="mode-switch">
          <el-radio-button label="chat">普通问答</el-radio-button>
          <el-radio-button label="team">Producer 编排</el-radio-button>
        </el-radio-group>
        <section v-if="mode === 'team'" class="orchestration-panel">
          <h3>多 Agent 创作协作</h3>
          <p class="muted">Producer 先制定计划，再按计划调用白名单专家和 Independent Editor。结果始终是候选稿，等待人工批准。</p>
          <el-input v-model="runRequest" type="textarea" :rows="3" :maxlength="1200" placeholder="例如：检查《雨林》第三集的连续性和人物关系，必要时提出局部修改建议，交给独立 Editor 审核，不要写第四集。" />
          <el-button type="primary" :loading="runSending" :disabled="!runRequest.trim()" @click="startRun">启动编排</el-button>
          <article v-for="run in runs" :key="run.run_id" class="run-card">
            <div><strong>{{ run.status }}</strong><span class="muted"> · {{ run.run_id }}</span></div>
            <p class="muted">所选 Agent：{{ run.selected_agents?.join(', ') || 'Producer 正在制定计划' }}</p>
            <p v-if="run.result?.editor_review" class="reply-text"><strong>Independent Editor：</strong>{{ run.result.editor_review }}</p>
            <p v-if="run.result?.producer_decision" class="reply-text"><strong>Producer 决策：</strong>{{ run.result.producer_decision }}</p>
            <p v-if="run.error_text" class="error-text">{{ run.error_text }}</p>
            <p class="muted">候选稿 · 人工批准未记录 · 未确立 Canon</p>
          </article>
        </section>
        <section v-if="mode === 'team'" class="orchestration-panel">
          <h3>第三集定向修订</h3><p class="muted">基于最近一次 Editor 意见调用 Story Writer，原稿保持不变，候选版本独立复审。</p>
          <el-button type="warning" :loading="revisionSending" @click="startRevision">修订第三集 v2</el-button>
          <article v-for="revision in revisions" :key="revision.revision_id" class="run-card"><strong>{{ revision.status }}</strong><span class="muted"> {{ revision.revision_id }}</span><p>原稿 SHA256：{{ revision.source_sha256 }}<br>候选 SHA256：{{ revision.candidate_sha256 || '等待生成' }}<br>批准状态：{{ revision.approval_status }}</p><pre v-if="revision.candidate_text" class="source-document">{{ revision.candidate_text }}</pre><p v-if="revision.editor_review" class="reply-text"><strong>Editor：</strong>{{ revision.editor_review }}</p><el-button v-if="revision.status === 'failed' && revision.editor_task_id" size="small" @click="recoverRevision(revision.revision_id)">回查原 Editor Session</el-button><el-button v-if="revision.status === 'completed' && revision.approval_status === 'not_approved'" type="primary" size="small" @click="approveRevision(revision.revision_id)">批准为待发布版本</el-button></article>
        </section>
        <div v-if="!messages.length" class="empty-chat">
          <el-icon :size="32"><ChatDotRound /></el-icon>
          <h3>从已有作品开始聊</h3>
          <p>发送问题时，会读取并核对原始资料，按长度预算提供片段；未提供的内容会明确列出。</p>
          <el-button v-for="prompt in prompts" :key="prompt" @click="draft = prompt" plain>{{ prompt }}</el-button>
        </div>
        <article v-for="m in messages" :key="m.id" class="chat-turn">
          <section class="user-message"><span>你</span><p>{{ m.content }}</p></section>
          <section class="agent-message">
            <div class="agent-label"><strong>Producer</strong><el-tag :type="m.task?.task_status === 'completed' ? 'success' : 'info'" size="small">{{ statusLabel(m.task?.task_status) }}</el-tag></div>
            <div v-if="m.task?.output_text" class="reply-text markdown-body" v-html="renderReply(m.task.output_text, m.context)"></div>
            <p v-else-if="isActive(m.task)" class="muted">任务由本地服务执行中，可以离开页面，稍后恢复结果。</p>
            <p v-else class="error-text">{{ m.task?.error_text || '尚未取得完整正文。执行状态不代表剧本质量通过。' }}</p>
            <p v-if="m.task?.output_text && m.task?.error_text" class="error-text">{{ m.task.error_text }}</p>
            <el-button v-if="!isActive(m.task) && m.task?.task_status !== 'completed' && m.task?.session_id" size="small" @click="refreshTask(m)">回查原 Session（不重发）</el-button>
            <details class="trace"><summary>资料依据与任务记录 · {{ m.context.input_chars }} / 8000 字符</summary>
              <p class="muted">{{ m.context.omission_notice }}</p>
              <p>使用历史轮次：{{ m.context.history_included.join(', ') || '无' }}；省略轮次：{{ m.context.history_omitted.join(', ') || '无' }}</p>
              <p>Task：{{ m.task?.task_id }}<br>Session：{{ m.task?.session_id || '尚未创建' }}<br>模型：{{ m.task?.model_id || '尚未返回' }}<br>输入哈希：{{ m.task?.input_version }}<br>输出哈希：{{ m.task?.output_version || '尚未取得' }}</p>
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
          <el-input v-model="draft" type="textarea" :rows="3" :maxlength="1200" show-word-limit placeholder="向 Producer 提问，例如：前三集现在是什么状态？" aria-label="给 Producer 的消息" />
          <div class="composer-footer"><span>聊天额度：{{ budget.chat?.limit ? `${budget.chat.remaining} / ${budget.chat.limit}` : '不限' }} · 编排额度：{{ budget.orchestration?.limit ? `${budget.orchestration.remaining} / ${budget.orchestration.limit}` : '不限' }} · 不自动重试</span>
            <el-button native-type="submit" type="primary" :loading="sending" :disabled="!canSend">发送给 Producer</el-button></div>
          <p class="muted">发送前费用预估：价格未配置；将显示真实 Token 用量，无法可靠估算金额。</p>
          <p v-if="budget.chat?.limit && budget.chat.remaining === 0" class="muted">聊天额度已达到配置上限，请等待24小时滚动窗口恢复。</p>
        </form>
      </main>
    </div>
    <el-dialog v-model="showSource" :title="sourceView?.title || '作品原文件'" width="min(850px, 94vw)">
      <p class="muted">{{ sourceView?.path }}<br>SHA256：{{ sourceView?.sha256 }}</p>
      <el-alert v-if="citationNotice" :title="citationNotice" type="warning" :closable="false" />
      <pre class="source-document">{{ sourceView?.available ? sourceView.text : sourceView?.error }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, ChatDotRound } from '@element-plus/icons-vue'
import { getAssistantWorks, getAssistantContext, getAssistantMessages, sendAssistantMessage, refreshAssistantMessage, getAssistantSource, getAssistantRuns, createAssistantRun, getAssistantRevisions, createAssistantRevision, approveAssistantRevision, refreshAssistantRevision, recoverAssistantEditor } from '@/api/scriptAssistant'

const router = useRouter(), route = useRoute()
const works = ref([]), selected = ref(''), context = ref(null), messages = ref([]), draft = ref(''), budget = ref({})
const loading = ref(false), sending = ref(false), error = ref(''), showSource = ref(false), sourceView = ref(null), citationNotice = ref('')
const mode = ref('chat'), runRequest = ref(''), runs = ref([]), runSending = ref(false)
const revisions = ref([]), revisionSending = ref(false)
const prompts = ['我们前三集剧本现在是什么状态？', '第一集和第三集之间，有哪些需要注意的连续性问题？', '你建议先修改前三集，还是开始第四集？说明依据。']
let timer, requestKey = null, submittedText = null, generation = 0, alive = true
const isActive = task => ['queued', 'starting', 'submitted', 'running'].includes(task?.task_status)
const canSend = computed(() => selected.value && draft.value.trim() && !sending.value && !messages.value.some(m => isActive(m.task)) && (!budget.value.chat?.limit || budget.value.chat.remaining > 0) && !context.value?.gaps?.length)
const statusLabel = state => ({ queued: '排队', starting: '创建 Session', submitted: '已提交', running: '执行中', completed: '回复已返回', failed: '执行失败', incomplete: '正文不完整', interrupted: '服务重启中断' }[state] || state)
async function reloadMessages() {
  const id = selected.value, token = generation
  const data = await getAssistantMessages(id)
  if (!alive || token !== generation || id !== selected.value) return
  messages.value = data.messages; budget.value = data.budget
}
async function reload() {
  if (!selected.value) return
  error.value = ''
  try { await reloadMessages(); context.value = await getAssistantContext(selected.value); runs.value = (await getAssistantRuns(selected.value)).runs; revisions.value = (await getAssistantRevisions(selected.value)).revisions } catch (e) { error.value = e.message }
}
async function changeWork() {
  generation++; messages.value = []; context.value = null; error.value = ''; loading.value = true
  requestKey = null; submittedText = null
  await router.replace({ query: { work: selected.value } })
  try { context.value = await getAssistantContext(selected.value); await reloadMessages(); runs.value = (await getAssistantRuns(selected.value)).runs; revisions.value = (await getAssistantRevisions(selected.value)).revisions } catch (e) { error.value = e.message } finally { loading.value = false }
}
async function startRevision() { if (revisionSending.value) return; revisionSending.value=true; error.value=''; try { await createAssistantRevision(selected.value,'ep3'); await reload() } catch(e) { error.value=e.message } finally { revisionSending.value=false } }
async function approveRevision(id) { try { await approveAssistantRevision(id); await reload() } catch(e) { error.value=e.message } }
async function recoverRevision(id) { try { await refreshAssistantRevision(id); await reload() } catch(e) { error.value=e.message } }
async function recoverEditor(id) { try { await recoverAssistantEditor(id); await reload() } catch(e) { error.value=e.message } }
async function startRun() {
  if (!runRequest.value.trim() || runSending.value) return
  runSending.value = true; error.value = ''
  try { await createAssistantRun(selected.value, runRequest.value.trim()); runRequest.value = ''; await reload() } catch (e) { error.value = e.message } finally { runSending.value = false }
}
async function send() {
  if (!canSend.value) return
  if (submittedText !== draft.value.trim()) { requestKey = crypto.randomUUID(); submittedText = draft.value.trim() }
  sending.value = true; error.value = ''
  try { await sendAssistantMessage(selected.value, submittedText, requestKey); draft.value = ''; requestKey = null; submittedText = null; await reloadMessages() }
  catch (e) { error.value = e.message; await reloadMessages().catch(() => {}) }
  finally { sending.value = false }
}
async function refreshTask(m) {
  try { await refreshAssistantMessage(selected.value, m.id); await reloadMessages() } catch (e) { error.value = e.message }
}
async function openSource(id) {
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
    sourceView.value = { ...view, text: lines.map((line, i) => `${String(i + 1).padStart(4, ' ')} ${i + 1 >= start && i + 1 <= end ? '▸ ' : '  '}${line}`).join('\n') }
    showSource.value = true
  } catch (e) { citationNotice.value = e.message }
}
function onCitationClick(event) { const el = event.target.closest?.('.citation-link'); if (el) openCitation(el.dataset.source, Number(el.dataset.start), Number(el.dataset.end)) }
onMounted(async () => {
  document.addEventListener('click', onCitationClick)
  loading.value = true
  try {
    const data = await getAssistantWorks(); works.value = data.works; budget.value = data.budget
    selected.value = works.value.find(w => w.id === route.query.work)?.id || works.value[0]?.id || ''
    if (selected.value) await changeWork()
  } catch (e) { error.value = e.response?.status === 404 ? '本服务尚未启用剧本助手，请使用已配置的 M1 工作台服务。' : e.message }
  finally { loading.value = false }
  timer = setInterval(() => { if (selected.value && (messages.value.some(m => isActive(m.task)) || runs.value.some(r => ['queued','planning','experts','reviewing','deciding'].includes(r.status)))) reload().catch(e => { error.value = e.message }) }, 5000)
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
.reply-text { line-height: 1.85; font-size: 14px; } .markdown-body :deep(p) { margin: 8px 0; } .markdown-body :deep(pre) { overflow: auto; padding: 10px; background: var(--bg-page); border-radius: 6px; } .markdown-body :deep(blockquote) { border-left: 3px solid var(--el-color-primary); padding-left: 12px; color: var(--text-secondary); } .citation-link { border: 0; background: transparent; color: var(--el-color-primary); cursor: pointer; padding: 0 2px; text-decoration: underline; }
.trace { border-top: 1px solid var(--border-color, #ddd); padding-top: 14px; font-size: 12px; overflow-wrap: anywhere; }
.trace summary { cursor: pointer; color: var(--text-secondary); } .trace p { line-height: 1.6; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.7; }
.source-proof { padding: 10px 0; } .source-proof pre { background: var(--bg-page); border-radius: 6px; padding: 12px; }
.source-document { max-height: 65vh; overflow-y: auto; }
.composer { border-top: 1px solid var(--border-color, #ddd); padding-top: 18px; } .composer-footer { margin-top: 12px; font-size: 12px; color: var(--text-secondary); }
.error-text { color: var(--el-color-danger); }
@media (max-width: 850px) { .assistant-layout { grid-template-columns: 1fr; } .assistant-page { padding: 14px; } .assistant-header { flex-wrap: wrap; } .assistant-header > .el-tag { margin-left: 0; } }
</style>
