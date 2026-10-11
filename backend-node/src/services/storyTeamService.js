const aiClient = require('./aiClient');
const { safeParseAIJSON } = require('../utils/safeJson');

function parseObject(raw, label) {
  try {
    const value = safeParseAIJSON(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected object');
    return value;
  } catch (err) {
    throw new Error(`${label} 输出无法解析为 JSON: ${err.message}`);
  }
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

  const producer = await call(db, log, 'producer',
    `为以下短剧创意制定前三集的商业创作任务。只返回 JSON 对象，字段为 premise、audience_hook、characters、stakes、episode_plan、guardrails。每集 episode_plan 必须含 goal、action、opposition、cost、payoff、cliffhanger。不得编造法律或专业确定性结论。\n\n${premise}`,
    '你是总编剧兼制作人。把创意变成可执行的事件计划，优先保证人物主动行动、具体代价、对手反制和状态变化。', { model, max_tokens: 3000 });
  audit.push(producer);
  const plan = parseObject(producer.raw, 'producer');

  const writer = await call(db, log, 'writer',
    `依据故事创意和已确认的策划，写出 ${count} 集可拍的短剧正文。只返回 JSON 对象 {"episodes":[{"episode":1,"title":"...","content":"..."}]}。每集必须有可观察行动、反制、代价、结果和集尾卡点；不得新增策划中没有依据的法律、医疗或产权结论。\n创意：${premise}\n策划：${JSON.stringify(plan)}`,
    '你是分集编剧。只写正文，不解释方法，不输出分镜 JSON。保持连续性和具体事件。', { model, max_tokens: Math.max(5000, count * 1800) });
  audit.push(writer);
  const draft = parseObject(writer.raw, 'writer');
  if (!Array.isArray(draft.episodes) || draft.episodes.length !== count) throw new Error('writer 未返回完整集数');

  const editor = await call(db, log, 'editor',
    `独立审阅以下短剧前三集，只返回 JSON 对象 {"accepted":boolean,"findings":[{"episode":1,"severity":"high|medium|low","evidence":"原文证据","problem":"问题","recommendation":"具体剧情修订"}],"rewrite_brief":"若需改稿，说明必须重写的事件"}。不要因为格式完整就通过；重点检查主动行动、代价、反制、不可逆结果、情绪兑现、连续性和可拍性。\n${JSON.stringify(draft)}`,
    '你是独立剧本编辑。必须引用正文证据，拒绝空泛评分。', { model, max_tokens: 2800 });
  audit.push(editor);
  const review = parseObject(editor.raw, 'editor');

  let final = draft;
  if (review.accepted !== true && review.rewrite_brief) {
    const rewrite = await call(db, log, 'producer-rewrite',
      `根据原始创意、策划、前三集正文和独立审稿意见，重写完整前三集。只返回 JSON 对象 {"episodes":[{"episode":1,"title":"...","content":"..."}]}。只修复审稿指出的具体剧情事件，不删减为提纲，不补造未有依据的专业事实。\n创意：${premise}\n策划：${JSON.stringify(plan)}\n原稿：${JSON.stringify(draft)}\n审稿：${JSON.stringify(review)}`,
      '你是总编剧，负责有界剧情重写。必须保留有效事实并让行动真正改变关系或利益局势。', { model, max_tokens: Math.max(5000, count * 1800) });
    audit.push(rewrite);
    final = parseObject(rewrite.raw, 'producer-rewrite');
    if (!Array.isArray(final.episodes) || final.episodes.length !== count) throw new Error('rewrite 未返回完整集数');
  }

  return { mode: 'research-draft', premise, plan, draft, review, final, audit: audit.map(({ role, raw }) => ({ role, raw })) };
}

module.exports = { generateStoryTeam };
