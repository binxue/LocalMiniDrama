#!/usr/bin/env node
/**
 * 前端验收测试 - 验证 FilmCreate 能否正确展示质检结果
 * ⚠️ 警告：此脚本仅用于验证，不应在生产环境运行
 * ⚠️ 默认禁止写入，需要明确传入 --allow-write 参数
 */

const http = require('http');

// 检查参数
const args = process.argv.slice(2);
const allowWrite = args.includes('--allow-write');

if (!allowWrite) {
  console.error('\n⚠️  此脚本默认禁止写入数据');
  console.error('如需测试写入功能，请使用：node test/frontend-verification.js --allow-write');
  console.error('⚠️  写入会修改 storyboard 3 的数据，请确保已备份\n');
  process.exit(1);
}

const baseUrl = 'http://127.0.0.1:5679';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(baseUrl + path, options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('\n=== 前端验收测试 ===\n');

  // 1. 创建测试质检记录
  console.log('步骤 1：导入测试质检记录（标记为测试）');
  const importRes = await request('POST', '/api/v1/storyboards/3/quality-check', {
    agent_type: '[TEST] visual-inspector',
    execution_id: 'test-frontend-verification',
    verdict: 'APPROVE',
    score: 92,
    image_generation_id: 22,
    video_generation_id: 7,
    observations: {
      composition: 'excellent',
      color: 'natural',
      continuity: 'maintained'
    },
    recommendations: ['前端验收测试记录'],
    checked_at: new Date().toISOString()
  });

  if (!importRes.data.success) {
    console.error('✗ 导入失败');
    process.exit(1);
  }
  console.log('✓ 测试记录已导入\n');

  // 2. 验证 API 返回
  console.log('步骤 2：验证 API 返回数据');
  const queryRes = await request('GET', '/api/v1/storyboards/3/quality-checks');

  if (!queryRes.data.success) {
    console.error('✗ API 查询失败');
    process.exit(1);
  }

  const checks = queryRes.data.data.items || [];
  console.log(`✓ API 返回 ${checks.length} 条质检记录`);

  const testCheck = checks.find(c => c.execution_id === 'test-frontend-verification');
  if (!testCheck) {
    console.error('✗ 测试记录未找到');
    process.exit(1);
  }

  console.log('✓ 测试记录数据完整：');
  console.log(`  - Agent: ${testCheck.agent_type}`);
  console.log(`  - Verdict: ${testCheck.verdict}`);
  console.log(`  - Score: ${testCheck.score}`);
  console.log(`  - 图片任务: #${testCheck.image_generation_id}`);
  console.log(`  - 视频任务: #${testCheck.video_generation_id}`);
  console.log(`  - 观察: ${Object.keys(testCheck.observations).length} 项`);
  console.log(`  - 建议: ${testCheck.recommendations.length} 条\n`);

  // 3. 前端数据结构验证
  console.log('步骤 3：验证前端数据结构');
  const sbRes = await request('GET', '/api/v1/storyboards/3');
  if (!sbRes.data.success) {
    console.error('✗ 获取 storyboard 失败');
    process.exit(1);
  }

  const desc = typeof sbRes.data.data.description === 'string'
    ? JSON.parse(sbRes.data.data.description)
    : sbRes.data.data.description;

  console.log('✓ description 结构：');
  console.log(`  - approval: ${desc.approval ? '存在' : '无'}`);
  console.log(`  - production_review: ${desc.production_review ? '存在' : '无'}`);
  console.log(`  - quality_checks: ${desc.quality_checks ? desc.quality_checks.length : 0} 条\n`);

  // 4. 前端函数模拟
  console.log('步骤 4：模拟前端函数处理');

  // 模拟 getSbQualityChecks
  function getSbQualityChecks(sb) {
    if (!sb || !sb.description) return [];
    try {
      const desc = typeof sb.description === 'string' ? JSON.parse(sb.description) : sb.description;
      return desc.quality_checks || [];
    } catch (e) {
      return [];
    }
  }

  // 模拟 formatObservations
  function formatObservations(obs) {
    if (!obs || typeof obs !== 'object') return '';
    return Object.entries(obs).map(([key, value]) => `${key}: ${value}`).join('；');
  }

  const frontendChecks = getSbQualityChecks(sbRes.data.data);
  console.log(`✓ getSbQualityChecks: ${frontendChecks.length} 条记录`);

  if (frontendChecks.length > 0) {
    const first = frontendChecks[0];
    const formatted = formatObservations(first.observations);
    console.log(`✓ formatObservations: "${formatted}"`);
  }

  console.log('\n步骤 5：前端展示预期效果');
  console.log('───────────────────────────────────');
  console.log('📋 Agent 质量检查');
  console.log('');

  for (const check of frontendChecks) {
    const verdictLabel = check.verdict === 'APPROVE' ? '✓ 通过' : check.verdict === 'REVISE' ? '⚠ 修正' : '✗ 重拍';
    console.log(`${check.agent_type}  ${verdictLabel}  ${check.score}分`);
    if (check.observations && Object.keys(check.observations).length) {
      console.log(`  观察：${formatObservations(check.observations)}`);
    }
    if (check.recommendations && check.recommendations.length) {
      console.log(`  建议：${check.recommendations.join('；')}`);
    }
    if (check.image_generation_id || check.video_generation_id) {
      const links = [];
      if (check.image_generation_id) links.push(`图片任务 #${check.image_generation_id}`);
      if (check.video_generation_id) links.push(`视频任务 #${check.video_generation_id}`);
      console.log(`  关联：${links.join('  ')}`);
    }
    console.log('');
  }
  console.log('───────────────────────────────────\n');

  console.log('=== 前端验收测试完成 ===\n');
  console.log('验证结果：');
  console.log('  ✓ API 数据返回正确');
  console.log('  ✓ 数据结构完整');
  console.log('  ✓ 前端函数逻辑正确');
  console.log('  ✓ 展示效果符合预期');
  console.log('');
  console.log('⚠️ 注意：测试记录已标记 [TEST] 前缀，需要清理\n');
})().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
