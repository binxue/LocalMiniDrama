const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const taskService = require('./taskService');
const imageService = require('./imageService');
const { hash } = require('./managedAgentReviewEvidence');
const { ManagedAgentWorkbenchClient } = require('./managedAgentWorkbenchClient');
const { imageEstimate } = require('./modelPricingCatalog');
const running = new Set();
const PLAN_HASH = '7155cf62c528833f32fe0d3832027aacae6a86066bfddd7304d9c4a80bcc34a6';
const MODEL = 'doubao-seedream-5-0-pro-260628';
const PLAN_PATH = 'H:/localminidrama-research/general-film-team/shot1-ab-preproduction.json';
const AGENTS = {
  analyze: { agentId: 'agent-20261011103929-nbhv3', agentName: 'film-cinematographer' },
  review: { agentId: 'agent-20261011103929-0cx2g', agentName: 'film-visual-inspector' },
};
const ENVIRONMENT_ID = 'env-20261011083635-eeeu2';
const BUDGET_LIMIT_CNY = 100;
const BUDGET_WARNING_CNY = 80;
function approvedStoryboard(db, storyboardId = 3) {
  const sb = db.prepare('SELECT s.*, e.drama_id FROM storyboards s JOIN episodes e ON e.id = s.episode_id WHERE s.id = ? AND s.deleted_at IS NULL').get(storyboardId);
  if (!sb || sb.drama_id !== 2 || sb.episode_id !== 2) throw new Error('业务数据不匹配');
  return sb;
}
function context(db, cfg, storyboardId = 3) {
  const sb = approvedStoryboard(db, storyboardId);
  const desc = JSON.parse(sb.description);
  if (!desc.approval?.execution_id || desc.approval?.verdict !== 'APPROVE') throw new Error('该镜头没有有效导演批准记录');
  const bytes = fs.existsSync(process.env.LOCALMINIDRAMA_APPROVED_PLAN || PLAN_PATH)
    ? fs.readFileSync(process.env.LOCALMINIDRAMA_APPROVED_PLAN || PLAN_PATH) : Buffer.from('');
  const plan = bytes.length ? JSON.parse(bytes) : null;
  const shot = plan?.shots?.find(item => item.key === sb.title) || {
    key: sb.title, prompt: sb.polished_prompt || sb.image_prompt || '', references: [],
  };
  const root = fs.realpathSync(path.resolve(cfg.storage?.local_path || 'data/storage'));
  const refs = [...(shot.references || [])];
  let characterRefs = [];
  try { characterRefs = JSON.parse(sb.characters || '[]'); } catch (_) {}
  for (const ref of characterRefs) {
    const requestedName = String(ref?.name || '').trim();
    const id = Number(ref?.id);
    const row = requestedName
      ? db.prepare('SELECT id, name, local_path FROM characters WHERE drama_id = ? AND name = ? ORDER BY id LIMIT 1').get(sb.drama_id, requestedName)
      : db.prepare('SELECT id, name, local_path FROM characters WHERE id = ?').get(id);
    if (row?.local_path && !refs.some(item => item.path === row.local_path)) refs.push({ label: row.name, path: row.local_path });
  }
  const scene = db.prepare('SELECT local_path FROM scenes WHERE drama_id = ? AND location = ? ORDER BY id LIMIT 1').get(sb.drama_id, sb.location);
  if (scene?.local_path && !refs.some(item => item.path === scene.local_path)) refs.unshift({ label: '场景', path: scene.local_path });
  shot.references = refs;
  const files = refs.map(item => safeMedia(root, item.path));
  return { sb, desc, shot, root, files, approvalHash: hash(JSON.stringify(desc.approval)) };
}
function safeMedia(root, relative) {
  const file = fs.realpathSync(path.resolve(root, relative));
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.statSync(file).isFile()) throw new Error('媒体路径不安全或不存在');
  return file;
}
function readDescription(db, storyboardId = 3) {
  const row = db.prepare('SELECT description FROM storyboards WHERE id = ?').get(storyboardId);
  if (!row) { const error = new Error('STORYBOARD_NOT_FOUND: storyboard_id=' + storyboardId); error.code = 'STORYBOARD_NOT_FOUND'; throw error; }
  try { return JSON.parse(row.description || '{}'); } catch (cause) { const error = new Error('STORYBOARD_DESCRIPTION_INVALID: storyboard_id=' + storyboardId); error.code = 'STORYBOARD_DESCRIPTION_INVALID'; error.cause = cause; throw error; }
}
function findRun(db, runId) {
  for (const row of db.prepare('SELECT id, description FROM storyboards').all()) {
    let desc; try { desc = JSON.parse(row.description || '{}'); } catch (_) { continue; }
    const run = (desc.static_production_runs || []).find(item => item.run_id === runId);
    if (run) return { run, storyboardId: row.id };
  }
  return null;
}
function persist(db, run) {
  const storyboardId = Number(run.storyboard_id || 3);
  const desc = readDescription(db, storyboardId);
  if (hash(JSON.stringify(desc.approval)) !== run.approval_sha256) throw new Error('批准记录已变化，停止制作');
  const list = desc.static_production_runs || [];
  const index = list.findIndex(item => item.run_id === run.run_id);
  run.updated_at = new Date().toISOString();
  if (index < 0) list.push(run); else list[index] = run;
  desc.static_production_runs = list;
  db.prepare('UPDATE storyboards SET description = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(desc), run.updated_at, storyboardId);
}
function quarantine(db, storyboardId = 3) {
  const desc = readDescription(db, storyboardId);
  const checks = desc.quality_checks || [];
  const unverified = checks.filter(check => !check.evidence?.submit_event_id || !check.evidence?.result_event_id);
  if (!unverified.length && !desc.production_round_1?.agent_review_completed) return;
  desc.quarantined_quality_checks = [...(desc.quarantined_quality_checks || []), ...unverified.map(check => ({
    original: check, quarantined_at: new Date().toISOString(), reason: '无真实 Agent 提交/结果事件证据，排除影视验收',
  }))];
  desc.quality_checks = checks.filter(check => !unverified.includes(check));
  if (desc.production_round_1?.agent_review_completed) {
    desc.quarantined_production_rounds = [...(desc.quarantined_production_rounds || []), { original: desc.production_round_1,
      reason: '历史模拟轮次，不代表真实 Agent 审核' }];
    delete desc.production_round_1;
  }
  db.prepare('UPDATE storyboards SET description = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(desc), new Date().toISOString(), storyboardId);
}
function status(db, storyboardId = null) {
  if (storyboardId != null) {
    const desc = readDescription(db, Number(storyboardId));
    const runs = desc.static_production_runs || [];
    if (!runs.length) return { storyboard_id: Number(storyboardId), status: 'NOT_STARTED', model: MODEL,
      size: '1440x2560', budget_limit_cny: BUDGET_LIMIT_CNY, budget_warning_cny: BUDGET_WARNING_CNY, runs: [], quarantined_checks: (desc.quarantined_quality_checks || []).length,
      unverified_checks: (desc.quality_checks || []).filter(check => !check.evidence?.result_event_id).length,
      budget: budgetSummary(db),
      historical_unknown_tasks: [23, 24, 25, 26, 27], video_authorized: false };
  }
  const desc = storyboardId ? readDescription(db, storyboardId) : {};
  const sourceRuns = storyboardId ? (desc.static_production_runs || []) : db.prepare('SELECT description FROM storyboards').all()
    .flatMap(row => { try { return JSON.parse(row.description).static_production_runs || []; } catch (_) { return []; } });
  const runs = JSON.parse(JSON.stringify(sourceRuns));
  for (const run of runs) {
    releaseUnsubmittedReservations(run);
    for (const execution of run.executions || []) {
      if (!execution.error?.evidence || !/^exec-[a-f0-9-]+-agent$/.test(execution.error.evidence)) continue;
      try {
        const root = process.env.LOCALMINIDRAMA_STATIC_EVIDENCE_ROOT || 'H:/localminidrama-runtime-static/evidence';
        const receipt = JSON.parse(fs.readFileSync(path.join(root, run.run_id, execution.error.evidence + '.json'), 'utf8'));
        const message = JSON.parse(receipt.stderr).error?.message;
        if (typeof message === 'string' && /SSO STS|STS.*续期失败/.test(message)) {
          execution.error.remote_message = message;
          run.original_error_message = run.message;
          run.message = '方舟 SSO 认证失效：STS 续期失败，refresh token 无效。请完成账号登录后继续。';
          run.error = { ...run.error, code: 'AUTH_EXPIRED', message: run.message };
        }
      } catch (_) { /* Original failure remains visible if private receipt is unavailable. */ }
    }
  }
  return {
    storyboard_id: storyboardId, model: MODEL, size: '1440x2560', budget_limit_cny: BUDGET_LIMIT_CNY, budget_warning_cny: BUDGET_WARNING_CNY,
    runs, budget: budgetSummary(db),
    quarantined_checks: (desc.quarantined_quality_checks || []).length,
    unverified_checks: (desc.quality_checks || []).filter(check => !check.evidence?.result_event_id).length,
    historical_unknown_tasks: [23, 24, 25, 26, 27],
    video_authorized: false,
  };
}
function validateAnalysis(result) {
  if (typeof result.optimized_prompt !== 'string' || result.optimized_prompt.trim().length < 40
      || result.optimized_prompt.length > 6000 || typeof result.analysis !== 'string') throw new Error('Agent 未返回有效专业分析和优化提示词');
  return result;
}
function validateReview(result) {
  if (!['APPROVE', 'REVISE', 'BLOCKED'].includes(result.verdict) || !Number.isFinite(result.score)
      || result.score < 0 || result.score > 100 || !result.observations || typeof result.observations !== 'object'
      || Array.isArray(result.observations) || !Array.isArray(result.recommendations)
      || result.recommendations.some(item => typeof item !== 'string')) throw new Error('Agent 审核响应无效');
  return result;
}
function reserve(db, run, kind, amount, stage) {
  const persistedSpent = db.prepare('SELECT description FROM storyboards').all().flatMap(row => {
    try { return JSON.parse(row.description || '{}').static_production_runs || []; } catch (_) { return []; }
  }).filter(item => item.run_id !== run.run_id)
    .reduce((sum, item) => sum + (item.costs?.reservations || []).reduce((n, cost) => n + Number(cost.reserved_cny || 0), 0), 0);
  const currentSpent = (run.costs?.reservations || []).reduce((sum, cost) => sum + Number(cost.reserved_cny || 0), 0);
  const spent = persistedSpent + currentSpent;
  if (spent + amount > BUDGET_LIMIT_CNY) throw new Error('BUDGET_BLOCKED: EP01 累计非视频预算不足，停止新增调用');
  run.costs.reservations.push({ kind, stage, reserved_cny: amount, actual_cost_cny: null, billing_status: 'PENDING_SETTLEMENT' });
  persist(db, run);
}
function releaseUnsubmittedReservations(run) {
  for (const execution of run.executions || []) {
    if (execution.execution_status !== 'FAILED' || execution.session_id || execution.submit_event_id) continue;
    const reservation = run.costs.reservations.find(item => item.stage === execution.stage);
    if (reservation && reservation.reserved_cny) {
      reservation.released_cny = reservation.reserved_cny;
      reservation.reserved_cny = 0;
      reservation.billing_status = 'NOT_SUBMITTED';
      reservation.release_reason = 'Control-plane preflight failed before session creation or message submission';
    }
  }
}
function budgetSummary(db) {
  const runs = db.prepare('SELECT description FROM storyboards').all().flatMap(row => {
    try { return JSON.parse(row.description || '{}').static_production_runs || []; } catch (_) { return []; }
  });
  const reservations = runs.flatMap(run => run.costs?.reservations || []);
  const reserved = reservations.reduce((sum, item) => sum + Number(item.reserved_cny || 0), 0);
  const estimated = runs.flatMap(run => [
    ...(run.executions || []).filter(item => item.pricing_status === 'ESTIMATED').map(item => item.estimated_cost_cny),
    ...(run.costs?.records || []).filter(item => item.pricing_status === 'ESTIMATED').map(item => item.estimated_cost_cny),
  ]).reduce((sum, item) => sum + Number(item || 0), 0);
  const unknown = runs.flatMap(run => [
    ...(run.executions || []).filter(item => item.estimated_cost_cny != null && item.pricing_status !== 'ESTIMATED'),
    ...(run.costs?.records || []).filter(item => item.pricing_status === 'UNKNOWN'),
  ]).length;
  return { limit_cny: BUDGET_LIMIT_CNY, warning_cny: BUDGET_WARNING_CNY, reserved_cny: reserved,
    estimated_cny: estimated, unknown_count: unknown, available_cny: Math.max(0, BUDGET_LIMIT_CNY - reserved), warning: reserved >= BUDGET_WARNING_CNY };
}
function assertNewCorrectivePrompt(run, prompt, round) {
  const originalPrompt = run.executions.find(item => item.stage === 'analysis-1')?.result?.optimized_prompt;
  if (!run.corrective_generation_authorized || round !== 2 || hash(prompt) === hash(originalPrompt || '')) {
    throw new Error('未知图片请求禁止重发；只允许依据真实审片意见提交不同的修正提示词');
  }
}
async function execute(db, cfg, log, run, dependencies = {}) {
  const initial = context(db, cfg, run.storyboard_id);
  const evidenceRoot = process.env.LOCALMINIDRAMA_STATIC_EVIDENCE_ROOT || 'H:/localminidrama-runtime-static/evidence';
  const root = path.join(evidenceRoot, run.run_id);
  fs.mkdirSync(root, { recursive: true });
  const client = dependencies.client || new ManagedAgentWorkbenchClient({ root, onExecution: execution => {
    const index = run.executions.findIndex(item => item.execution_id === execution.execution_id);
    if (index < 0) run.executions.push(execution); else run.executions[index] = execution;
    const reservation = run.costs.reservations.find(item => item.stage === execution.stage);
    if (reservation && execution.estimated_cost_cny != null) {
      reservation.estimated_cost_cny = execution.estimated_cost_cny;
      reservation.reserved_cny = Math.max(reservation.reserved_cny, execution.estimated_cost_cny);
    }
    persist(db, run);
  } });
  const update = (stage, message, progress) => {
    run.stage = stage; run.message = message;
    persist(db, run);
    taskService.updateTaskStatus(db, run.task_id, 'processing', progress, message);
  };
  const agentStage = async (stage, request) => {
    if (stage === 'analysis-1' && run.reused_analysis) {
      return { execution: run.reused_analysis.execution, result: run.reused_analysis.execution.result };
    }
    const existing = run.executions.find(item => item.stage === stage);
    if (existing?.execution_status === 'COMPLETED' && existing.result) return { execution: existing, result: existing.result };
    if (existing?.session_id && existing.submit_event_id && ['UNKNOWN', 'RUNNING'].includes(existing.execution_status)) {
      return client.collect(existing);
    }
    if (existing) throw new Error('Existing Agent attempt cannot be resent; inspect its evidence');
    reserve(db, run, 'managed_agent', run.transmission_recovery_of ? 1 : 2, stage);
    return client.run(request);
  };
  try {
    let correction = null;
    for (let round = 1; round <= (run.transmission_recovery_of ? 1 : 2); round++) {
      context(db, cfg, run.storyboard_id); // Revalidate authority before each new round.
      const analyzeStage = 'analysis-' + round;
      update(analyzeStage, round === 1 ? 'Agent 专业分析与首帧提示词优化' : 'Agent 根据真实审片缺陷修正提示词', 10 + (round - 1) * 40);
      const analysis = await agentStage(analyzeStage, { ...AGENTS.analyze, environmentId: ENVIRONMENT_ID, stage: analyzeStage,
        images: [...initial.files, ...(round > 1 ? [safeMedia(initial.root, run.candidates.at(-1).local_path)] : [])],
        input: { instructions: '你是专业摄影指导。仅分析当前 approved_shot 对应镜头，不修改导演方案。禁止调用任何工具或生成媒体。'
          + '参考图顺序与用途必须以 approved_shot.references 为准，不得套用其他镜头合同；核对剧情动作、构图、角色、场景道具、连续性和提示词可执行性。'
          + '不得自行添加未批准的角色、道具或动作；不要在图片画文字对白。'
          + '只有全部生成前条件满足时 generation_gate 才能返回 APPROVE，否则返回 BLOCKED 或 REVISE 并说明 gate_reasons。返回 JSON: {execution_id,input_hash,analysis,optimized_prompt,negative_prompt,generation_gate,gate_reasons}。'
          + (round > 1 ? '第4张是上一轮实际候选，仅用于诊断修正，生成参考仍固定前三张。' : '')
          + 'optimized_prompt 必须可直接用于 Seedream 首帧图生图；写清 Image 1/2/3 对应关系。总回复不超过1800汉字。',
          context: { approved_shot: initial.shot, first_last_frames: initial.desc.first_last_frames,
            model: MODEL, size: '1440x2560', correction } },
      });
      validateAnalysis(analysis.result);
      if (analysis.result.generation_gate !== 'APPROVE') throw new Error('PRECHECK_BLOCKED: Agent 未批准收费图片生成：' + JSON.stringify(analysis.result.gate_reasons || {}));
      run.optimized_prompt = analysis.result.optimized_prompt;
      run.analysis = analysis.result.analysis;
      persist(db, run);
      let candidate;
      const previousCandidate = run.candidates.find(item => item.round === round);
      if (previousCandidate) {
        candidate = db.prepare('SELECT * FROM image_generations WHERE id = ?').get(previousCandidate.image_generation_id);
        if (candidate?.status !== 'completed') throw new Error('Recorded candidate is no longer completed');
      } else if (round === 1 && run.candidate_strategy === 'reuse_latest') {
        candidate = db.prepare("SELECT * FROM image_generations WHERE storyboard_id = ? AND status = 'completed' AND deleted_at IS NULL AND model = ? AND size = '1440x2560' AND reference_images = ? ORDER BY id DESC LIMIT 1")
          .get(run.storyboard_id, MODEL, JSON.stringify(initial.shot.references.map(item => item.path)));
        if (!candidate?.local_path) throw new Error('没有符合固定规格和参考合同的可复用候选');
      } else {
        update('generation-' + round, '使用既有生成服务创建新首帧候选', 30 + (round - 1) * 40);
        if (!run.pending_image_generation_id && run.costs.reservations.some(item => item.stage === 'generation-' + round)) {
          throw new Error('本轮已有图片请求，禁止再次提交；需先核实原请求状态');
        }
        if (run.unresolved_image_generations?.length && !run.pending_image_generation_id && !run.transmission_recovery_of) {
          assertNewCorrectivePrompt(run, analysis.result.optimized_prompt, round);
        }
        if (!run.pending_image_generation_id) reserve(db, run, 'seedream_image', 1, 'generation-' + round);
        context(db, cfg, run.storyboard_id);
        const created = run.pending_image_generation_id ? { id: run.pending_image_generation_id }
          : (dependencies.createImage || imageService.create)(db, log, {
          storyboard_id: run.storyboard_id, drama_id: run.drama_id, provider: 'volcengine', model: MODEL, size: '1440x2560',
          aspect_ratio: '9:16', frame_type: 'first', prompt: analysis.result.optimized_prompt,
          negative_prompt: analysis.result.negative_prompt || '', reference_images: (initial.shot.references || []).map(item => item.path),
        });
        run.pending_image_generation_id = Number(created.id);
        persist(db, run);
        // The image HTTP request has a 10 minute limit. Do not declare it
        // unknown while that same request is still legitimately waiting.
        const deadline = Date.now() + 630000;
        while (Date.now() < deadline) {
          candidate = db.prepare('SELECT * FROM image_generations WHERE id = ?').get(created.id);
          if (['completed', 'failed'].includes(candidate.status)) break;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (candidate?.status !== 'completed' || !candidate.local_path) {
          run.generation_error = candidate?.error_msg || '生成未完成，云端状态待核实';
          throw new Error('IMAGE_UNKNOWN: ' + run.generation_error + '；不自动重发');
        }
      }
      const file = safeMedia(initial.root, candidate.local_path);
      const entry = previousCandidate || { round, image_generation_id: candidate.id, version: 'image-' + candidate.id,
        local_path: candidate.local_path, media_sha256: hash(fs.readFileSync(file)),
        acquisition: round === 1 && run.candidate_strategy === 'reuse_latest' ? 'REUSED_EXISTING' : 'GENERATED_BY_WORKBENCH',
        generation_status: 'completed', generated_prompt: candidate.prompt,
        analysis_execution_id: analysis.execution.execution_id };
      if (!previousCandidate) run.candidates.push(entry);
      run.costs.records = run.costs.records || [];
      if (!run.costs.records.some(item => item.kind === 'seedream_image' && item.media_id === candidate.id)) {
        const priced = imageEstimate({ model: candidate.model || MODEL, size: candidate.size || '1440x2560', referenceCount: initial.shot.references?.length || 0 });
        run.costs.records.push({ kind: 'seedream_image', media_id: candidate.id, storyboard_id: run.storyboard_id,
          provider: candidate.provider || 'volcengine', model: candidate.model || MODEL, created_at: candidate.created_at || new Date().toISOString(),
          usage: priced.usage || null, pricing_version: priced.pricing_version, pricing_status: priced.pricing_status,
          estimated_cost_cny: priced.estimated_cost_cny, unknown_reason: priced.unknown_reason || null,
          evidence: { run_id: run.run_id, image_generation_id: candidate.id, media_sha256: entry.media_sha256 } });
      }
      run.pending_image_generation_id = null;
      persist(db, run);
      update('review-' + round, '真实视觉检查 Agent 审核当前媒体版本', 50 + (round - 1) * 40);
      const reviewed = await agentStage('review-' + round, { ...AGENTS.review, environmentId: ENVIRONMENT_ID, stage: 'review-' + round,
        images: [file, ...initial.files], input: {
          instructions: '你是专业影视视觉检查员。审核第一张实际候选首帧；后续图片严格按 approved_shot.references 顺序作为本镜参考。'
            + '禁止工具调用、媒体生成或伪造可见事实。依据当前镜头批准方案、角色、场景、道具和动作核对实际画面。'
            + '不要套用其他镜头的动作、参考合同或审核结论；不得把视频动作或声音未发生当作静态图失败。'
            + '依据实际图片指出专业缺陷及修正建议，不得因批准方案已通过而默认图片通过。APPROVE仅为制作建议。'
            + '返回 JSON: {execution_id,input_hash,verdict:APPROVE|REVISE|BLOCKED,score:0到100,observations:{},recommendations:[]}。不超过1200汉字。',
          context: { approved_shot: initial.shot, first_last_frames: initial.desc.first_last_frames,
            image_generation_id: candidate.id, media_sha256: entry.media_sha256, plan_sha256: PLAN_HASH } },
      });
      validateReview(reviewed.result);
      entry.review = reviewed.result;
      entry.review_execution_id = reviewed.execution.execution_id;
      const quality = { agent_type: 'visual-quality-inspector', execution_id: reviewed.execution.execution_id,
        image_generation_id: candidate.id, verdict: reviewed.result.verdict, score: reviewed.result.score,
        observations: reviewed.result.observations, recommendations: reviewed.result.recommendations,
        evidence: { source: 'managed-agent-events', run_id: run.run_id, agent_id: reviewed.execution.agent_id,
          session_id: reviewed.execution.session_id, submit_event_id: reviewed.execution.submit_event_id,
          result_event_id: reviewed.execution.result_event_id, input_hash: reviewed.execution.input_hash,
          media_sha256: entry.media_sha256, plan_sha256: PLAN_HASH, approval_sha256: run.approval_sha256 } };
      const port = Number(process.env.PORT) || cfg.server?.port || 5679;
      const result = await fetch('http://127.0.0.1:' + port + '/api/v1/storyboards/' + run.storyboard_id + '/quality-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quality), signal: AbortSignal.timeout(15000),
      });
      const imported = await result.json();
      if (!result.ok || !imported.success) throw new Error('真实质检回流失败，保留结果，不重发 Agent');
      persist(db, run);
      if (reviewed.result.verdict === 'APPROVE') break;
      if (run.unresolved_image_generations?.length && !run.corrective_generation_authorized) {
        run.correction_blocker = '已有云端状态未知的图片请求，保留缺陷意见，不自动重拍';
        break;
      }
      correction = { verdict: reviewed.result.verdict, observations: reviewed.result.observations, recommendations: reviewed.result.recommendations };
    }
    const best = [...run.candidates].filter(item => item.review).sort((a, b) =>
      Number(b.review.verdict === 'APPROVE') - Number(a.review.verdict === 'APPROVE') || b.review.score - a.review.score)[0];
    run.best_candidate_image_id = best?.image_generation_id || null;
    run.status = best?.review.verdict === 'APPROVE' ? 'READY_FOR_PRODUCER' : 'NEEDS_REVISION';
    run.stage = 'producer_decision';
    run.message = run.status === 'READY_FOR_PRODUCER' ? '真实审核通过，最佳候选等待制作人决定' : '候选已真实审核，仍有缺陷，等待制作人修正或重拍决策';
    if (!run.costs.billing_checked_at) await queryBilling(client, run, run.run_id + '-billing');
    persist(db, run);
    taskService.updateTaskResult(db, run.task_id, { run_id: run.run_id, status: run.status, best_candidate_image_id: run.best_candidate_image_id });
  } catch (error) {
    run.status = error.message.includes('BUDGET_BLOCKED') ? 'BUDGET_BLOCKED' : 'BLOCKED';
    run.message = error.message;
    run.error = { code: error.code || 'PRODUCTION_BLOCKED', message: error.message, at: new Date().toISOString() };
    // A failed control-plane preflight with no session or submission has not
    // started inference. Release its reservation but preserve original amount.
    releaseUnsubmittedReservations(run);
    persist(db, run);
    taskService.updateTaskError(db, run.task_id, error.message);
    log.warn('Static production blocked; no automatic retry', { run_id: run.run_id, stage: run.stage, error: error.message });
  } finally { running.delete(run.run_id); }
}
function start(db, cfg, log, body = {}) {
  const storyboardId = Number(body.storyboard_id || 3);
  const ctx = context(db, cfg, storyboardId);
  const previous = ctx.desc.static_production_runs || [];
  for (const oldRun of previous) {
    if (oldRun.status === 'BLOCKED' && oldRun.executions?.some(execution => execution.execution_status === 'FAILED' && !execution.session_id)) {
      releaseUnsubmittedReservations(oldRun);
      persist(db, oldRun);
    }
  }
  if (!body.request_id || typeof body.request_id !== 'string' || body.request_id.length > 100) throw new Error('必须提供一次性请求标识');
  const repeated = previous.find(item => item.request_id === body.request_id);
  if (repeated) return repeated;
  const recovery = body.transmission_recovery_of ? validateTransmissionRecovery(previous, body.transmission_recovery_of) : null;
  if (previous.some(item => item.status === 'RUNNING' || item.executions?.some(exec => exec.execution_status === 'UNKNOWN'))) throw new Error('已有进行中/云端未知执行，禁止重复收费提交');
  if (!recovery && previous.some(item => item.pending_image_generation_id)) throw new Error('已有云端状态未核实的图片任务，禁止重新生成');
  const strategy = body.candidate_strategy || 'generate';
  if (!['generate', 'reuse_latest'].includes(strategy)) throw new Error('候选策略无效');
  if (!recovery && strategy === 'generate' && previous.some(item => item.unresolved_image_generations?.length)) throw new Error('已有未知图片请求，不能重新开始同一生成；请基于真实审片意见修正或核实云端状态');
  if (recovery && (strategy !== 'generate' || !process.env.LOCALMINIDRAMA_ARK_IMAGE_LOCAL_ADDRESS)) throw new Error('独立传输修复请求需要已配置的方舟物理网卡出口');
  if (recovery && status(db).runs.reduce((sum, item) => sum + (item.costs?.reservations || []).reduce((n, cost) => n + cost.reserved_cny, 0), 0) + 2 > BUDGET_LIMIT_CNY) throw new Error('BUDGET_BLOCKED: 新图片和一次真实审核需要预留 ¥2');
  quarantine(db, storyboardId);
  const task = taskService.createTask(db, log, 'static_production', String(storyboardId));
  const run = { run_id: 'static-' + crypto.randomUUID(), request_id: body.request_id, task_id: task.id,
    storyboard_id: storyboardId, drama_id: ctx.sb.drama_id, episode_id: ctx.sb.episode_id, shot_key: ctx.sb.title, status: 'RUNNING', stage: 'queued',
    model: MODEL, size: '1440x2560', candidate_strategy: strategy, approval_sha256: ctx.approvalHash,
    plan_sha256: PLAN_HASH, executions: [], candidates: [], costs: { currency: 'CNY', budget_limit: BUDGET_LIMIT_CNY,
      reservations: [], actual_cost_cny: null, billing_status: 'PENDING_SETTLEMENT',
      estimate_basis: '2026-10-13账号目录：evolving输入0.006/千tokens，输出0.03/千tokens；Seedream5.0pro大图0.6/张；预算预留不等于结算费用' },
    created_at: new Date().toISOString() };
  if (recovery) {
    run.transmission_recovery_of = recovery.source.run_id;
    run.reused_analysis = { source_run_id: recovery.source.run_id, source_stage: 'analysis-2', execution: recovery.analysis };
    run.unresolved_image_generations = [...(recovery.source.unresolved_image_generations || []), {
      image_generation_id: recovery.source.pending_image_generation_id, cloud_status: 'UNKNOWN', billing_status: 'UNKNOWN',
    }];
    run.transmission_change = { local_address: process.env.LOCALMINIDRAMA_ARK_IMAGE_LOCAL_ADDRESS,
      fresh_socket: true, certificate_validation: true, authorization: '2026-10-14 producer authorized independent post-fix image request; originals are not resumed' };
    run.costs.recovery_reserve_basis = '新增图片预留¥1；一次视觉审核预留¥1（前三次真实调用目录估算均小于¥0.16，回复限制1200汉字）；非结算费用。旧¥8预留不释放。';
  }
  persist(db, run);
  running.add(run.run_id);
  setImmediate(() => execute(db, cfg, log, run).catch(error => log.error('Static production persistence failure', { error: error.message })));
  return run;
}
function validateTransmissionRecovery(previous, sourceId) {
  const source = previous.find(item => item.run_id === sourceId);
  if (!source || source.status !== 'BLOCKED' || !source.pending_image_generation_id || !source.generation_error) throw new Error('没有可保留的传输阻塞源记录');
  if (previous.some(item => item.transmission_recovery_of === sourceId)) throw new Error('独立传输修复请求已创建；禁止再次提交');
  if (previous.some(item => item !== source && item.pending_image_generation_id)) throw new Error('存在其他待核实图片请求');
  const analysis = source.executions?.find(item => item.stage === 'analysis-2' && item.execution_status === 'COMPLETED' && item.result_event_id);
  const reviewed = source.candidates?.find(item => item.review?.verdict === 'REVISE' && item.review_execution_id);
  if (!analysis || !reviewed) throw new Error('必须复用已完成的真实修正分析与审片证据');
  validateAnalysis(analysis.result);
  return { source, analysis };
}
function resume(db, cfg, log, runId, options = {}) {
  const located = findRun(db, runId);
  const run = located && located.run;
  if (!run) throw new Error('制作任务不存在');
  run.costs = run.costs || { currency: 'CNY', reservations: [] };
  run.costs.budget_limit = BUDGET_LIMIT_CNY;
  context(db, cfg, run.storyboard_id);
  if (running.has(runId)) return run;
  const reuseAfterUnknownImage = options.reuse_existing === true && run.pending_image_generation_id && run.generation_error && run.candidates.length === 0;
  const reviseFromRealReview = options.revise_from_review === true && run.status === 'NEEDS_REVISION';
  if (reuseAfterUnknownImage) {
    const image = db.prepare('SELECT id, storyboard_id, status, error_msg FROM image_generations WHERE id = ?').get(run.pending_image_generation_id);
    if (!image || image.storyboard_id !== 3 || !['failed', 'processing', 'pending'].includes(image.status)) throw new Error('未知图片任务证据不匹配，请先核对状态');
    run.unresolved_image_generations = [...(run.unresolved_image_generations || []), {
      image_generation_id: image.id, local_status: image.status, cloud_status: 'UNKNOWN', actual_cost_cny: null,
      error: image.error_msg || run.generation_error, noted_at: new Date().toISOString(),
    }];
    run.pending_image_generation_id = null;
    run.original_candidate_strategy = run.candidate_strategy;
    run.candidate_strategy = 'reuse_latest';
    run.generation_step_status = 'UNKNOWN_NO_DELIVERY';
  } else if (reviseFromRealReview) {
    const reviewed = run.candidates.find(item => item.review?.verdict === 'REVISE'
      && run.executions.some(execution => execution.execution_id === item.review_execution_id
        && execution.execution_status === 'COMPLETED' && execution.result_event_id));
    if (!reviewed || run.candidates.length > 1) throw new Error('没有可执行修正的真实审片版本');
    run.corrective_generation_authorized = true;
    run.corrective_generation_reason = { source_image_generation_id: reviewed.image_generation_id,
      source_review_execution_id: reviewed.review_execution_id, new_prompt_required: true,
      unknown_image_requests_preserved: true };
    delete run.correction_blocker;
  }
  if (run.status === 'BUDGET_BLOCKED' && !run.executions.length && !run.pending_image_generation_id) {
    run.message = '预算上限已更新，继续原运行记录的专业预审';
  } else if (!run.executions.some(item => ['UNKNOWN', 'RUNNING'].includes(item.execution_status) && item.session_id && item.submit_event_id)) {
    throw new Error('没有可继续查询的 Agent 提交；禁止重发');
  }
  run.previous_errors = [...(run.previous_errors || []), ...(run.error ? [run.error] : [])];
  delete run.error;
  run.status = 'RUNNING';
  run.message = reuseAfterUnknownImage ? '不重发未知图片请求；工作台自动复用合规候选并真实审核' : '继续查询原 Agent 会话，不重发消息';
  if (reviseFromRealReview) run.message = '依据真实审片意见修正；不重发未知请求，要求新提示词且保留其预算';
  persist(db, run);
  db.prepare("UPDATE async_tasks SET error = NULL WHERE id = ? AND type = 'static_production'").run(run.task_id);
  running.add(runId);
  setImmediate(() => execute(db, cfg, log, run).catch(error => log.error('Static production resume persistence failure', { error: error.message })));
  return run;
}
async function checkBilling(db, cfg, log, runId) {
  const located = findRun(db, runId);
  const run = located && located.run;
  if (!run) throw new Error('制作任务不存在');
  context(db, cfg, run.storyboard_id);
  if (running.has(runId)) throw new Error('制作执行中，请稍后核对账单');
  const root = path.join(process.env.LOCALMINIDRAMA_STATIC_EVIDENCE_ROOT || 'H:/localminidrama-runtime-static/evidence', runId);
  const client = new ManagedAgentWorkbenchClient({ root });
  await queryBilling(client, run, runId + '-billing-check-' + Date.now());
  persist(db, run);
  return run.costs;
}
async function queryBilling(client, run, evidenceName) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(run.created_at)).map(item => [item.type, item.value]));
  const day = parts.year + '-' + parts.month + '-' + parts.day;
  try {
    const endpoint = run.executions[0]?.model?.Id;
    if (!endpoint) throw new Error('没有已核实的 Agent 计费接入点');
    const billing = await client.command(['billing', 'list', '--start', day.slice(0, 7), '--interval', 'detail',
      '--day', day, '--endpoint', endpoint], evidenceName);
    run.costs.billing_status = 'REQUIRES_ATTRIBUTION';
    run.costs.billing_summary = { returned: billing.returned, is_truncated: billing.is_truncated, partial_failures: billing.partial_failures };
    delete run.costs.billing_error;
  } catch (error) {
    run.costs.billing_status = 'UNAVAILABLE';
    run.costs.billing_error = error.message;
  }
  run.costs.billing_checked_at = new Date().toISOString();
  return run.costs;
}
module.exports = { start, status, resume, checkBilling, quarantine, validateAnalysis, validateReview, context, execute, reserve, approvedStoryboard, assertNewCorrectivePrompt, validateTransmissionRecovery };
