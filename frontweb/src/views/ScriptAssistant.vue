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
            <p v-if="m.task?.output_text" class="reply-text">{{ m.task.output_text }}</p>
            <p v-else-if="isActive(m.task)" class="muted">任务由本地服务执行中，可以离开页面，稍后恢复结果。</p>
            <p v-else class="error-text">{{ m.task?.error_text || '尚未取得完整正文。执行状态不代表剧本质量通过。' }}</p>
            <p v-if="m.task?.output_text && m.task?.error_text" class="error-text">{{ m.task.error_text }}</p>
            <el-button v-if="!isActive(m.task) && m.task?.task_status !== 'completed' && m.task?.session_id" size="small" @click="refreshTask(m)">回查原 Session（不重发）</el-button>
            <details class="trace"><summary>资料依据与任务记录 · {{ m.context.input_chars }} / 8000 字符</summary>
              <p class="muted">{{ m.context.omission_notice }}</p>
              <p>使用历史轮次：{{ m.context.history_included.join(', ') || '无' }}；省略轮次：{{ m.context.history_omitted.join(', ') || '无' }}</p>
              <p>Task：{{ m.task?.task_id }}<br>Session：{{ m.task?.session_id || '尚未创建' }}<br>模型：{{ m.task?.model_id || '尚未返回' }}<br>输入哈希：{{ m.task?.input_version }}<br>输出哈希：{{ m.task?.output_version || '尚未取得' }}</p>
              <p v-if="m.task?.usage">tokens：输入 {{ m.task.usage.input_tokens || 0 }} / 输出 {{ m.task.usage.output_tokens || 0 }}；缺失用量请求 {{ m.task.usage.missing_usage_requests || 0 }}。无账单，不估算费用。</p>
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
          <div class="composer-footer"><span>24小时任务额度：{{ budget.remaining ?? '—' }} / {{ budget.limit || 5 }} 剩余 · 不自动重试</span>
            <el-button native-type="submit" type="primary" :loading="sending" :disabled="!canSend">发送给 Producer</el-button></div>
          <p v-if="budget.remaining === 0" class="muted">当前配额已用完。已有记录可继续查看，新任务需等待滚动配额恢复。</p>
        </form>
      </main>
    </div>
    <el-dialog v-model="showSource" :title="sourceView?.title || '作品原文件'" width="min(850px, 94vw)">
      <p class="muted">{{ sourceView?.path }}<br>SHA256：{{ sourceView?.sha256 }}</p>
      <pre class="source-document">{{ sourceView?.available ? sourceView.text : sourceView?.error }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, ChatDotRound } from '@element-plus/icons-vue'
import { getAssistantWorks, getAssistantContext, getAssistantMessages, sendAssistantMessage, refreshAssistantMessage, getAssistantSource } from '@/api/scriptAssistant'

const router = useRouter(), route = useRoute()
const works = ref([]), selected = ref(''), context = ref(null), messages = ref([]), draft = ref(''), budget = ref({})
const loading = ref(false), sending = ref(false), error = ref(''), showSource = ref(false), sourceView = ref(null)
const prompts = ['我们前三集剧本现在是什么状态？', '第一集和第三集之间，有哪些需要注意的连续性问题？', '你建议先修改前三集，还是开始第四集？说明依据。']
let timer, requestKey = null, submittedText = null, generation = 0, alive = true
const isActive = task => ['queued', 'starting', 'submitted', 'running'].includes(task?.task_status)
const canSend = computed(() => selected.value && draft.value.trim() && !sending.value && !messages.value.some(m => isActive(m.task)) && budget.value.remaining > 0 && !context.value?.gaps?.length)
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
  try { await reloadMessages(); context.value = await getAssistantContext(selected.value) } catch (e) { error.value = e.message }
}
async function changeWork() {
  generation++; messages.value = []; context.value = null; error.value = ''; loading.value = true
  requestKey = null; submittedText = null
  await router.replace({ query: { work: selected.value } })
  try { context.value = await getAssistantContext(selected.value); await reloadMessages() } catch (e) { error.value = e.message } finally { loading.value = false }
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
onMounted(async () => {
  loading.value = true
  try {
    const data = await getAssistantWorks(); works.value = data.works; budget.value = data.budget
    selected.value = works.value.find(w => w.id === route.query.work)?.id || works.value[0]?.id || ''
    if (selected.value) await changeWork()
  } catch (e) { error.value = e.response?.status === 404 ? '本服务尚未启用剧本助手，请使用已配置的 M1 工作台服务。' : e.message }
  finally { loading.value = false }
  timer = setInterval(() => { if (selected.value && messages.value.some(m => isActive(m.task))) reloadMessages().catch(e => { error.value = e.message }) }, 5000)
})
onUnmounted(() => { alive = false; clearInterval(timer) })
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
.empty-chat { text-align: center; padding: 50px 12px; color: var(--text-secondary); }
.empty-chat .el-button { display: block; margin: 12px auto; white-space: normal; height: auto; padding: 12px; }
.chat-turn { margin-bottom: 28px; } .user-message { padding: 14px 18px; border-radius: 10px; background: var(--bg-page); margin-left: 35px; }
.user-message span { font-size: 12px; color: var(--text-secondary); } .user-message p { white-space: pre-wrap; line-height: 1.65; margin: 6px 0; }
.agent-message { padding: 20px 0; } .agent-label { justify-content: flex-start; }
.reply-text { white-space: pre-wrap; line-height: 1.85; font-size: 14px; }
.trace { border-top: 1px solid var(--border-color, #ddd); padding-top: 14px; font-size: 12px; overflow-wrap: anywhere; }
.trace summary { cursor: pointer; color: var(--text-secondary); } .trace p { line-height: 1.6; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.7; }
.source-proof { padding: 10px 0; } .source-proof pre { background: var(--bg-page); border-radius: 6px; padding: 12px; }
.source-document { max-height: 65vh; overflow-y: auto; }
.composer { border-top: 1px solid var(--border-color, #ddd); padding-top: 18px; } .composer-footer { margin-top: 12px; font-size: 12px; color: var(--text-secondary); }
.error-text { color: var(--el-color-danger); }
@media (max-width: 850px) { .assistant-layout { grid-template-columns: 1fr; } .assistant-page { padding: 14px; } .assistant-header { flex-wrap: wrap; } .assistant-header > .el-tag { margin-left: 0; } }
</style>
