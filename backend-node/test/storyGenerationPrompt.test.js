const test = require('node:test');
const assert = require('node:assert/strict');
const promptI18n = require('../src/services/promptI18n');

test('story prompt requires observable commercial causality', () => {
  const cfg = { app: { language: 'zh' } };
  const system = promptI18n.getStoryExpansionSystemPrompt(cfg, 3);
  const user = promptI18n.buildStoryExpansionUserPrompt(
    cfg,
    '女保安发现失踪姐姐留下的钥匙，必须在拍卖会前查出真相。',
    'modern',
    'drama',
    3,
  );

  for (const phrase of ['具体目标', '主动采取', '有效反制', '个人、关系或资源代价', '不可逆状态推进']) {
    assert.match(system, new RegExp(phrase));
  }
  assert.match(user, /可拍摄的行动、反制和结果/);
});

test('english story prompt keeps the same causal constraints', () => {
  const system = promptI18n.getStoryExpansionSystemPrompt({ app: { language: 'en' } }, 1);
  assert.match(system, /visible personal or material cost/);
  assert.match(system, /consequential state change/);
});
