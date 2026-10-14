<template>
  <section class="static-production" :aria-label="`${shotTitle}智能静态制作`">
    <div class="production-header">
      <strong>{{ shotTitle }} · 智能静态制作</strong>
      <el-tag>{{ labels[run?.status] || '可开始' }}</el-tag>
    </div>
    <p>摄影指导分析 → 优化首帧提示词 → 候选图 → 真实 Agent 审片 → 最佳候选</p>
    <p class="production-meta">Seedream 5.0 Pro · 1440 × 2560 · 9:16 · 场景 / 手机 / 茶杯三张批准参考</p>
    <div class="production-controls">
      <el-select v-model="strategy" :disabled="busy" aria-label="候选策略">
        <el-option label="生成新候选" value="generate" />
        <el-option label="自动复用最近合规候选并真实审核" value="reuse_latest" />
      </el-select>
      <el-button type="primary" :loading="starting || busy" :disabled="hasUnknown || hasPendingImages" @click="start">启动智能制作</el-button>
      <el-button @click="refresh">刷新状态</el-button>
      <el-button v-if="run && !busy" :loading="checkingBilling" @click="checkBilling">核对实际账单</el-button>
      <el-button v-if="(hasUnknown || run?.status === 'BUDGET_BLOCKED') && !busy" type="warning" :loading="starting" @click="resume">继续智能制作</el-button>
      <el-button v-if="run?.pending_image_generation_id && run?.generation_error && !run?.candidates.length && !busy" type="warning" :loading="starting" @click="resumeWithExisting">复用合规历史候选并真实审核</el-button>
      <el-button v-if="run?.status === 'NEEDS_REVISION' && !busy" type="warning" :loading="starting" @click="reviseFromReview">按真实审片意见修正候选</el-button>
      <el-button v-if="canRecoverTransport" type="warning" :loading="starting" @click="startTransportRecovery">使用修正分析发起独立新图片请求</el-button>
    </div>
    <p class="production-meta">静态总预算 ¥10；视频需另行授权。未知任务 23 / 24 / 25 不重试。</p>
    <el-alert v-if="quarantineCount" type="warning" :closable="false"
      :title="`${quarantineCount} 条历史无真实事件证据的评分已排除验收，原始证据保留`" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="run">
      <p class="production-progress" aria-live="polite">{{ run.message || run.stage }}</p>
      <p v-if="run.pending_image_generation_id && busy" class="production-meta">正在等待独立图片任务 #{{ run.pending_image_generation_id }}；不会自动重发。</p>
      <el-alert v-if="run.pending_image_generation_id && !busy" type="error" :closable="false"
        :title="`图片请求 #${run.pending_image_generation_id} 未交付，云端状态与费用待核实；不会再次提交本轮请求。`" />
      <el-alert v-for="unknown in run.unresolved_image_generations || []" :key="unknown.image_generation_id" type="warning" :closable="false"
        :title="`原图片任务 #${unknown.image_generation_id} 未交付，云端状态与费用未知，原记录保留。`" />
      <p v-if="run.transmission_recovery_of" class="production-meta">独立新请求；复用已完成的修正分析，不恢复原图片任务。分析响应：{{ run.reused_analysis?.execution.result_event_id }}</p>
      <div class="production-cost">
        <span>累计预算预留：¥{{ reserved.toFixed(2) }} / {{ budgetLimit }}</span>
        <span :class="{ 'budget-warning': reserved >= budgetWarning }">可用额度：¥{{ Math.max(0, budgetLimit - reserved).toFixed(2) }}{{ reserved >= budgetWarning ? '（已达 80% 预警）' : '' }}</span>
        <span>已返回用量估算：{{ hasUsage ? '¥' + estimated.toFixed(4) + '（未返回执行不计入）' : '尚未返回用量' }}</span>
        <span>实际结算：{{ run.costs?.actual_cost_cny == null ? '待账单确认' : '¥' + run.costs.actual_cost_cny }}</span>
      </div>
      <el-alert v-if="run.costs?.billing_status === 'UNAVAILABLE'" type="warning" :closable="false"
        title="实际结算查询不可用：用量估算不是账单，未知图片费用仍保留。" :description="run.costs.billing_error" />
      <details v-if="run.optimized_prompt">
        <summary>Agent 分析与优化提示词</summary>
        <p>{{ run.analysis }}</p>
        <pre>{{ run.optimized_prompt }}</pre>
      </details>
      <div class="production-candidates">
        <article v-for="candidate in run.candidates" :key="candidate.image_generation_id" class="production-candidate">
          <el-image :src="assetImageUrl(candidate)" :preview-src-list="[assetImageUrl(candidate)]" fit="contain" />
          <strong>{{ candidate.version }} · 第 {{ candidate.round }} 轮</strong>
          <span>{{ candidate.acquisition === 'REUSED_EXISTING' ? '复用既有图片，未重新生成' : '工作台真实生成' }}</span>
          <el-tag v-if="candidate.image_generation_id === run.best_candidate_image_id" :type="candidate.review?.verdict === 'APPROVE' ? 'success' : 'warning'">
            {{ candidate.review?.verdict === 'APPROVE' ? '最佳候选 · 等待制作人决定' : '当前候选仍需修正' }}
          </el-tag>
          <template v-if="candidate.review">
            <p>{{ verdictLabels[candidate.review.verdict] }} · {{ candidate.review.score }} 分（Agent 建议）</p>
            <p>{{ observations(candidate.review.observations) }}</p>
            <p v-if="candidate.review.recommendations.length">修正建议：{{ candidate.review.recommendations.join('；') }}</p>
            <div class="production-controls">
              <el-button size="small" type="success" @click="decide(candidate, 'APPROVE')">通过</el-button>
              <el-button size="small" type="warning" @click="decide(candidate, 'REVISE')">修正</el-button>
              <el-button size="small" type="danger" @click="decide(candidate, 'RESHOOT')">重拍</el-button>
            </div>
          </template>
          <span v-else>尚未完成真实审核</span>
        </article>
      </div>
      <details v-if="run.executions.length">
        <summary>Agent 调用尝试与响应记录（{{ run.executions.length }}）</summary>
        <div v-for="execution in run.executions" :key="execution.execution_id" class="production-execution">
          <strong>{{ execution.agent_name }} · {{ execution.stage }} · {{ execution.execution_status }}</strong>
          <span>本地追踪 ID {{ execution.execution_id }}</span>
          <span>会话 {{ execution.session_id || '未创建' }}</span>
          <span>提交事件 {{ execution.submit_event_id || '未提交' }}</span>
          <span>响应事件 {{ execution.result_event_id || '未完成' }}</span>
          <span v-if="execution.error">{{ execution.error.message }}</span>
          <span v-if="execution.error?.remote_message">{{ execution.error.remote_message }}</span>
        </div>
      </details>
      <p v-for="decision in decisions" :key="decision.decided_at" class="production-meta">
        制作人 {{ verdictLabels[decision.decision] || decision.decision }} · 图片 #{{ decision.image_generation_id }} · {{ decision.decided_at }}
      </p>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { qualityChecksAPI } from '@/api/qualityChecks'
import { assetImageUrl } from '@/utils/mediaUrl'
const emit = defineEmits(['updated'])
const props = defineProps({ storyboardId: { type: [Number, String], required: true }, shotTitle: { type: String, default: '当前镜头' } })
const shotTitle = computed(() => props.shotTitle || '当前镜头')
const state = ref({ runs: [] })
const strategy = ref('generate')
const starting = ref(false)
const checkingBilling = ref(false)
const error = ref('')
const decisions = ref([])
const run = computed(() => state.value.runs.at(-1))
const busy = computed(() => run.value?.status === 'RUNNING')
const hasUnknown = computed(() => state.value.runs.some(item => item.executions?.some(exec => exec.execution_status === 'UNKNOWN')))
const hasPendingImages = computed(() => state.value.runs.some(item => item.pending_image_generation_id))
const canRecoverTransport = computed(() => !busy.value && !hasUnknown.value && run.value?.status === 'BLOCKED'
  && run.value?.pending_image_generation_id && run.value?.generation_error && !run.value?.transmission_recovery_of
  && run.value?.executions.some(item => item.stage === 'analysis-2' && item.execution_status === 'COMPLETED'))
const quarantineCount = computed(() => (state.value.quarantined_checks || 0) + (state.value.unverified_checks || 0))
const budgetLimit = computed(() => Number(state.value.budget_limit_cny || 100))
const budgetWarning = computed(() => Number(state.value.budget_warning_cny || 80))
const reserved = computed(() => state.value.runs.reduce((sum, item) => sum + (item.costs?.reservations || []).reduce((n, cost) => n + cost.reserved_cny, 0), 0))
const estimated = computed(() => state.value.runs.reduce((sum, item) => sum
  + (item.executions || []).reduce((n, exec) => n + (exec.estimated_cost_cny || 0), 0)
  + (item.candidates || []).filter(candidate => candidate.acquisition === 'GENERATED_BY_WORKBENCH').length * 0.6, 0))
const hasUsage = computed(() => state.value.runs.some(item => item.executions?.some(exec => exec.estimated_cost_cny != null)
  || item.candidates?.some(candidate => candidate.acquisition === 'GENERATED_BY_WORKBENCH')))
const labels = { RUNNING: '制作中', READY_FOR_PRODUCER: '待制作人决定', NEEDS_REVISION: '仍需修正', BLOCKED: '执行受阻', BUDGET_BLOCKED: '预算已冻结' }
const verdictLabels = { APPROVE: '通过', REVISE: '修正', BLOCKED: '不通过', RESHOOT: '重拍' }
const observations = obs => Object.entries(obs || {}).map(([key, value]) => key + '：' + (typeof value === 'string' ? value : JSON.stringify(value))).join('；')
let timer, refreshing = false, lastTerminalRun = ''
async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    state.value = await request.get(`/storyboards/${props.storyboardId}/static-production`)
    const current = run.value
    if (current?.status === 'RUNNING') lastTerminalRun = ''
    if (current && current.status !== 'RUNNING' && lastTerminalRun !== current.run_id) {
      lastTerminalRun = current.run_id
      emit('updated')
    }
    error.value = current?.error?.message || ''
  } catch (e) { error.value = e.message } finally { refreshing = false }
}
async function start() {
  if (starting.value || busy.value || hasUnknown.value) return
  starting.value = true
  try {
    await request.post(`/storyboards/${props.storyboardId}/static-production`, { request_id: crypto.randomUUID(), candidate_strategy: strategy.value })
    await refresh()
  } catch (e) { error.value = e.message } finally { starting.value = false }
}
async function decide(candidate, decision) {
  try {
    await qualityChecksAPI.recordProducerDecision(props.storyboardId, { decision, image_generation_id: candidate.image_generation_id,
      notes: '智能静态制作候选 ' + candidate.version, decided_by: 'producer' })
    decisions.value = (await qualityChecksAPI.getProducerDecisions(props.storyboardId)).items || []
    ElMessage.success('制作人决策已记录，视频仍需另行授权')
    emit('updated')
  } catch (e) { error.value = e.message }
}
async function resume() {
  if (starting.value || busy.value) return
  starting.value = true
  try {
    await request.post(`/storyboards/${props.storyboardId}/static-production/${run.value.run_id}/resume`, {})
    await refresh()
  } catch (e) { error.value = e.message } finally { starting.value = false }
}
async function resumeWithExisting() {
  if (starting.value || busy.value) return
  starting.value = true
  try {
    await request.post(`/storyboards/${props.storyboardId}/static-production/${run.value.run_id}/resume`, { reuse_existing: true })
    await refresh()
  } catch (e) { error.value = e.message } finally { starting.value = false }
}
async function reviseFromReview() {
  if (starting.value || busy.value) return
  starting.value = true
  try {
    await request.post(`/storyboards/${props.storyboardId}/static-production/${run.value.run_id}/resume`, { revise_from_review: true })
    await refresh()
  } catch (e) { error.value = e.message } finally { starting.value = false }
}
async function checkBilling() {
  if (checkingBilling.value || busy.value) return
  checkingBilling.value = true
  try {
    await request.post(`/storyboards/${props.storyboardId}/static-production/${run.value.run_id}/billing-check`, {})
    await refresh()
  } catch (e) { error.value = e.message } finally { checkingBilling.value = false }
}
async function startTransportRecovery() {
  if (starting.value || busy.value) return
  starting.value = true
  try {
    await request.post(`/storyboards/${props.storyboardId}/static-production`, { request_id: crypto.randomUUID(), candidate_strategy: 'generate', transmission_recovery_of: run.value.run_id })
    await refresh()
  } catch (e) { error.value = e.message } finally { starting.value = false }
}
onMounted(async () => {
  await refresh()
  try { decisions.value = (await qualityChecksAPI.getProducerDecisions(props.storyboardId)).items || [] } catch (_) {}
  timer = setInterval(refresh, 3000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.static-production { box-sizing: border-box; width: 100%; min-width: 0; padding: 20px; margin: 14px 0 24px; border: 1px solid var(--border-muted); border-radius: 10px; background: var(--bg-inner); color: var(--text-primary); }
.production-header, .production-controls, .production-cost { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.production-header { justify-content: space-between; }
.production-meta { color: var(--text-muted); font-size: 12px; }
.production-cost { margin: 14px 0; font-size: 13px; }
.production-progress { font-weight: 600; }
.production-candidates { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 16px; }
.production-candidate { width: min(100%, 350px); display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--el-border-color); border-radius: 8px; }
.production-candidate .el-image { width: 100%; height: 330px; }
.production-execution { display: flex; flex-direction: column; gap: 4px; font-size: 12px; padding: 12px 0; overflow-wrap: anywhere; }
summary { cursor: pointer; padding: 12px 0; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; font-size: 13px; }
</style>
