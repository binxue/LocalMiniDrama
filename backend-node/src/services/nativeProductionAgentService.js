const fs = require('node:fs');
const path = require('node:path');
const { ManagedAgentWorkbenchClient } = require('./managedAgentWorkbenchClient');
const characterConsistency = require('./characterConsistencyService');

const ANALYZER = { agentId: 'agent-20261011103929-nbhv3', agentName: 'film-cinematographer' };
const INSPECTOR = { agentId: 'agent-20261011103929-0cx2g', agentName: 'film-visual-inspector' };
const ENVIRONMENT_ID = 'env-20261011083635-eeeu2';

function evidenceRoot(imageGenId) {
  const root = process.env.LOCALMINIDRAMA_STATIC_EVIDENCE_ROOT || 'H:/localminidrama-runtime-static/evidence';
  const dir = path.join(root, `native-image-${imageGenId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function localFiles(storageRoot, refs) {
  return (refs || []).map((ref) => {
    const value = String(ref || '');
    if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return null;
    const absolute = path.resolve(storageRoot, value.replace(/^\/+/, ''));
    try { return fs.statSync(absolute).isFile() ? absolute : null; } catch (_) { return null; }
  }).filter(Boolean);
}

function appendEvidence(db, storyboardId, item) {
  const row = db.prepare('SELECT description FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(Number(storyboardId));
  if (!row) return;
  let desc = {};
  try { desc = JSON.parse(row.description || '{}'); } catch (_) {}
  const list = Array.isArray(desc.native_production_agent_reviews) ? desc.native_production_agent_reviews : [];
  list.push(item);
  desc.native_production_agent_reviews = list.slice(-30);
  db.prepare('UPDATE storyboards SET description = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(JSON.stringify(desc), new Date().toISOString(), Number(storyboardId));
}

async function runAgent({ db, storyboardId, imageGenId, phase, agent, instructions, context, images }) {
  let latest;
  const client = new ManagedAgentWorkbenchClient({ root: evidenceRoot(imageGenId), onExecution: (execution) => { latest = execution; } });
  const result = await client.run({
    ...agent,
    environmentId: ENVIRONMENT_ID,
    stage: `native-${phase}`,
    images: images || [],
    input: { instructions, context },
  });
  const enforced = characterConsistency.enforce(result.result, context.character_contract);
  appendEvidence(db, storyboardId, {
    phase,
    image_generation_id: Number(imageGenId),
    shot_key: context.shot_key,
    recorded_at: new Date().toISOString(),
    execution: result.execution || latest,
    result: enforced,
    raw_result: result.result,
  });
  return enforced;
}

async function preGeneration({ db, log, row, prompt, references, labels, storageRoot }) {
  if (!row.storyboard_id || ['quad_grid', 'nine_grid'].includes(String(row.frame_type || ''))) return { prompt };
  const look = characterConsistency.getLookPackage(db, row.storyboard_id, storageRoot);
  let savedReferences = [];
  try { savedReferences = JSON.parse(row.reference_images || '[]'); } catch (_) {}
  const images = [...new Set([...(look ? [look.reference_path] : []), ...localFiles(storageRoot, savedReferences), ...localFiles(storageRoot, references)])]
    .filter(file => !look?.excluded_paths.includes(file));
  const context = {
    shot_key: row.title || `storyboard-${row.storyboard_id}`,
    storyboard_id: Number(row.storyboard_id),
    action: row.action || '',
    dialogue: row.dialogue || '',
    location: row.location || '',
    time: row.time || '',
    shot_type: row.shot_type || '',
    movement: row.movement || '',
    native_prompt: prompt,
    reference_labels: labels || [],
    character_contract: characterConsistency.publicLook(look),
  };
  const result = await runAgent({
    db, storyboardId: row.storyboard_id, imageGenId: row.id, phase: 'pre_generation', agent: ANALYZER, images,
    instructions: '你是原生短剧制作链路中的摄影指导。检查工作台已经生成的图片提示词和参考图，提供专业指导，不建立审批中心，不要求制作人逐镜批准。只在存在无法生成的关键矛盾时返回 BLOCKED；普通问题返回 REVISE 并给出可执行提示词。严格返回 JSON：{execution_id,input_hash,decision,optimized_prompt,analysis,issues,recommendations,character_consistency}。decision 只能是 PROCEED、REVISE 或 BLOCKED。optimized_prompt 必须是单帧图片提示词。' + characterConsistency.instruction(look),
    context,
  });
  if (!result || !['PROCEED', 'REVISE', 'BLOCKED'].includes(result.decision)) throw new Error('原生 Agent 指导响应无效');
  if (characterConsistency.enforce(result, look).decision === 'BLOCKED') throw new Error('CHARACTER_CONSISTENCY_BLOCKED: Original identity contract is not satisfied');
  if (result.decision === 'BLOCKED') throw new Error('NATIVE_AGENT_BLOCKED: ' + JSON.stringify(result.issues || result.analysis || '关键制作条件不足'));
  if (result.optimized_prompt && String(result.optimized_prompt).trim().length >= 20) {
    log.info('[原生制作] Agent 已完成生图前指导', { image_generation_id: row.id, decision: result.decision });
    return { prompt: String(result.optimized_prompt).trim(), result,
      references: characterConsistency.bindProviderReferences(look, references), character_contract:characterConsistency.publicLook(look) };
  }
  return { prompt, result };
}

async function postGeneration({ db, log, row, prompt, candidatePath, persistedUrl, storageRoot }) {
  if (!row.storyboard_id || !candidatePath || !fs.existsSync(candidatePath)) return null;
  const look = characterConsistency.getLookPackage(db, row.storyboard_id, storageRoot);
  const result = await runAgent({
    db, storyboardId: row.storyboard_id, imageGenId: row.id, phase: 'post_generation', agent: INSPECTOR, images: [...(look ? [look.reference_path] : []), candidatePath],
    instructions: '你是原生短剧制作链路中的视觉质检 Agent。检查实际单帧候选是否符合当前分镜和原始提示词。不要伪造评分，不要要求制作人逐镜审批。严格返回 JSON：{execution_id,input_hash,decision,observations,recommendations,character_consistency}。decision 只能是 PASS、REVISE 或 BLOCKED；REVISE 必须指出具体缺陷和局部修正方式。' + characterConsistency.instruction(look) + (look ? 'The SECOND attached image is the generated candidate; never use it as the identity reference.' : ''),
    context: { shot_key: row.title || `storyboard-${row.storyboard_id}`, storyboard_id: Number(row.storyboard_id), native_prompt: prompt, candidate_url: persistedUrl, character_contract:characterConsistency.publicLook(look) },
  });
  if (!result || !['PASS', 'REVISE', 'BLOCKED'].includes(result.decision)) throw new Error('原生 Agent 质检响应无效');
  log.info('[原生制作] Agent 已完成生图后质检', { image_generation_id: row.id, decision: result.decision });
  return characterConsistency.enforce(result, look);
}

module.exports = { preGeneration, postGeneration };
