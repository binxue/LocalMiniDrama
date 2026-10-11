const aiClient = require('./aiClient');
const { safeParseAIJSON } = require('../utils/safeJson');

function parseObject(raw, label) {
  try {
    const value = safeParseAIJSON(raw);
    if (Array.isArray(value) && (label === 'editor' || label === 'editor-recheck')) {
      return { accepted: false, findings: value };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected object');
    return value;
  } catch (err) {
    throw new Error(`${label} 输出无法解析为 JSON: ${err.message}`);
  }
}

function buildRewriteBrief(review) {
  const findings = Array.isArray(review?.findings) ? review.findings : [];
  if (!findings.length) return '';
  return findings.map((finding, index) => (
    `${index + 1}. 第${finding.episode || '?'}集 [${finding.severity || 'medium'}] `
    + `原文证据：${finding.evidence || '未提供'}；问题：${finding.problem || '未说明'}；` 
    + `必须改成的具体事件：${finding.recommendation || '重写该场次，使行动产生可见后果。'}`
  )).join('\n');
}

async function call(db, log, role, user, system, options = {}) {
  const raw = await aiClient.generateText(db, log, 'text', user, system, {
    scene_key: 'story_generation',
    model: options.model,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 5000,
    json_mode: false,
  });
  return { role, raw };
}

async function generateStoryTeam(db, log, body = {}) {
  const premise = String(body.premise || body.prompt || '').trim();
  if (!premise) throw new Error('请提供故事梗概');
  const model = body.model || undefined;
  const count = Math.max(1, Math.min(3, Number(body.episode_count) || 3));
  const audit = [];
  const stages = {};

  const producer = await call(db, log, 'producer',
    `为以下短剧创意完成前三集的实质故事讨论和取舍。只返回 JSON 对象，字段为 premise、audience_hook、characters、stakes、causal_events、rejected_options、episode_plan、guardrails、continuity_checks。causal_events 必须逐条包含 trigger、motivation、choice、opposition、observable_consequence、next_effect、emotional_turn；每集 episode_plan 必须引用这些事件并含 goal、action、opposition、cost、payoff、cliffhanger。rejected_options 要说明被舍弃的俗套或逻辑冲突方案及原因。若产权、医疗、餐饮或其他专业事实不确定，改写为可观察的文件、付款、行为，不下确定结论。先解决事件冲突，再交给 Writer。\n\n${premise}`,
    '你是总编剧兼制作人。先做故事决策，不写正文。检查每个事件的起因、人物动机、主动选择、真实后果和后续影响是否闭合；发现因果或时间线冲突时必须在方案阶段修正。优先情绪价值和可信选择，不用后来补损失掩盖前面错误。', { model, max_tokens: 4200 });
  audit.push(producer);
  const plan = parseObject(producer.raw, 'producer');
  stages.plan = { status: 'complete', role: 'producer' };

  const writer = await call(db, log, 'writer',
    `依据故事创意和已确认的因果事件策划，写出 ${count} 集可拍的短剧正文。只返回 JSON 对象 {"episodes":[{"episode":1,"title":"...","content":"..."}]}。必须把 causal_events 写成真实场景：角色动作、对白、阻力、情绪变化和可见结果，不能用剧情概述替代关键戏。每集只推进策划中已确认的事件，不新增未经依据的法律、医疗或产权结论。\n创意：${premise}\n策划：${JSON.stringify(plan)}`,
    '你是分集编剧。只写正文，不解释方法，不输出分镜 JSON。把事件因果写成可拍场面，保持人物选择、时间线和连续性。', { model, max_tokens: Math.max(5000, count * 1800) });
  audit.push(writer);
  const draft = parseObject(writer.raw, 'writer');
  if (!Array.isArray(draft.episodes) || draft.episodes.length !== count) throw new Error('writer 未返回完整集数');
  stages.draft = { status: 'complete', role: 'writer' };

  const editor = await call(db, log, 'editor',
    `独立审阅以下短剧前三集，只返回 JSON 对象 {"accepted":boolean,"findings":[{"episode":1,"severity":"high|medium|low","evidence":"原文证据","problem":"问题","recommendation":"具体剧情修订"}],"rewrite_brief":"若需改稿，说明必须重写的事件"}。不要因为格式完整就通过；除主动行动、代价、反制、不可逆结果、情绪兑现、集尾钩子外，必须检查每个事件的起因与结果、人物行为合理性、时间线、场景连续性、前后道具和专业事实边界。严重因果矛盾可以否决整段事件设计。\n${JSON.stringify(draft)}`,
    '你是独立剧本编辑。必须引用正文证据，拒绝空泛评分；发现错误故事决策时明确要求推翻场次，而非补解释性对白。', { model, max_tokens: 3400 });
  audit.push(editor);
  const review = parseObject(editor.raw, 'editor');
  stages.initial_review = { status: 'complete', role: 'editor' };

  let final = draft;
  let finalReview = review;
  const rewriteBrief = review.accepted === true ? '' : (review.rewrite_brief || buildRewriteBrief(review));
  if (rewriteBrief) {
    const rewrite = await call(db, log, 'producer-rewrite',
      `根据以下改稿 brief 重写完整前三集。只返回 JSON 对象 {"episodes":[{"episode":1,"title":"...","content":"..."}]}。必须重写实际场次、人物行动和事件后果，不得只增加解释性对白；不补造未有依据的专业事实。\n创意：${premise}\n策划：${JSON.stringify(plan)}\n原稿：${JSON.stringify(draft)}\n改稿 brief：${rewriteBrief}`,
      '你是总编剧，负责有界剧情重写。必须保留有效事实并让行动真正改变关系或利益局势。', { model, max_tokens: Math.max(5000, count * 1800) });
    audit.push(rewrite);
    final = parseObject(rewrite.raw, 'producer-rewrite');
    if (!Array.isArray(final.episodes) || final.episodes.length !== count) throw new Error('rewrite 未返回完整集数');
    stages.rewrite = { status: 'complete', role: 'producer-rewrite', brief: rewriteBrief };

    const secondEditor = await call(db, log, 'editor-recheck',
      `独立复审改稿后的完整前三集，只返回 JSON 对象 {"accepted":boolean,"findings":[{"episode":1,"severity":"high|medium|low","evidence":"改稿原文证据","problem":"仍存在的问题","recommendation":"若仍需修改的具体事件"}]}. 比较改稿是否真正改变了行动、代价、反制和结果；检查是否新增事实漏洞。\n原始审稿：${JSON.stringify(review)}\n改稿：${JSON.stringify(final)}`,
      '你是第二位独立剧本编辑。不能因为改稿更长或格式更完整就通过，必须引用实际正文。', { model, max_tokens: 2800 });
    audit.push(secondEditor);
    finalReview = parseObject(secondEditor.raw, 'editor-recheck');
    stages.final_review = { status: 'complete', role: 'editor-recheck' };
  }

  const status = finalReview.accepted === true ? 'reviewed' : (stages.draft?.status === 'complete' ? 'quality_rejected' : 'draft');
  return {
    mode: 'research-draft', status, premise, plan, draft, review,
    rewriteBrief, final, finalReview, stages,
    audit: audit.map(({ role, raw }) => ({ role, raw })),
  };
}

async function repairStoryTeam(db, log, artifact, options = {}) {
  const model = options.model;
  const premise = artifact.premise;
  const plan = artifact.plan;
  const draft = artifact.draft;
  const review = artifact.review;
  const count = draft?.episodes?.length || 3;
  const audit = [];
  const stages = { plan: { status: 'reused' }, draft: { status: 'reused' }, initial_review: { status: 'reused' } };
  const rewriteBrief = review.accepted === true ? '' : (review.rewrite_brief || buildRewriteBrief(review));
  if (!rewriteBrief) return { ...artifact, status: review.accepted === true ? 'reviewed' : 'quality_rejected', final: draft, finalReview: review, rewriteBrief, stages };
  const rewrite = await call(db, log, 'producer-rewrite',
    `根据以下改稿 brief 重写完整前三集。只返回 JSON 对象 {"episodes":[{"episode":1,"title":"...","content":"..."}]}。必须重写实际场次、人物行动和事件后果，不得只增加解释性对白；不补造未有依据的专业事实。\n创意：${premise}\n策划：${JSON.stringify(plan)}\n原稿：${JSON.stringify(draft)}\n改稿 brief：${rewriteBrief}`,
    '你是总编剧，负责有界剧情重写。必须保留有效事实并让行动真正改变关系或利益局势。', { model, max_tokens: Math.max(5000, count * 1800) });
  audit.push(rewrite);
  const final = parseObject(rewrite.raw, 'producer-rewrite');
  if (!Array.isArray(final.episodes) || final.episodes.length !== count) throw new Error('rewrite 未返回完整集数');
  stages.rewrite = { status: 'complete', role: 'producer-rewrite', brief: rewriteBrief };
  const secondEditor = await call(db, log, 'editor-recheck',
    `独立复审改稿后的完整前三集，只返回 JSON 对象 {"accepted":boolean,"findings":[{"episode":1,"severity":"high|medium|low","evidence":"改稿原文证据","problem":"仍存在的问题","recommendation":"若仍需修改的具体事件"}]}. 比较改稿是否真正改变了行动、代价、反制和结果；检查是否新增事实漏洞。\n原始审稿：${JSON.stringify(review)}\n改稿：${JSON.stringify(final)}`,
    '你是第二位独立剧本编辑。不能因为改稿更长或格式更完整就通过，必须引用实际正文。', { model, max_tokens: 2800 });
  audit.push(secondEditor);
  const finalReview = parseObject(secondEditor.raw, 'editor-recheck');
  stages.final_review = { status: 'complete', role: 'editor-recheck' };
  return { ...artifact, status: finalReview.accepted === true ? 'reviewed' : 'quality_rejected', rewriteBrief, final, finalReview, stages, audit: audit.map(({ role, raw }) => ({ role, raw })) };
}

module.exports = { generateStoryTeam, repairStoryTeam, buildRewriteBrief };
