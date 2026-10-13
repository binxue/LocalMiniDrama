#!/usr/bin/env node
/**
 * 创建测试数据并测试质检 API
 */

const http = require('http');

const baseUrl = 'http://127.0.0.1:5680';

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
  console.log('\n=== 质检 API 实际运行测试 ===\n');

  // 使用生产数据库中已存在的 storyboard 3
  console.log('步骤 1：查询 storyboard 3');
  const sb = await request('GET', '/api/v1/storyboards?drama_id=2');
  if (sb.data.success && sb.data.data.items.length > 0) {
    const sb3 = sb.data.data.items.find(s => s.id === 3);
    if (sb3) {
      console.log(`✓ Storyboard 3 存在: ${sb3.title}`);
    } else {
      console.log('✗ Storyboard 3 不存在于测试数据库');
      console.log('  (测试数据库是空的，使用隔离数据)');
    }
  }

  console.log('\n步骤 2：测试质检导入 API');
  const importResult = await request('POST', '/api/v1/storyboards/3/quality-check', {
    agent_type: 'visual-inspector',
    execution_id: 'exec-test-001',
    verdict: 'APPROVE',
    score: 85,
    image_generation_id: 22,
    video_generation_id: 7,
    observations: { composition: 'good', lighting: 'natural' },
    recommendations: ['consider wider angle'],
    checked_at: '2026-10-13T08:00:00Z'
  });

  console.log(`状态码: ${importResult.status}`);
  console.log(`响应: ${JSON.stringify(importResult.data, null, 2)}`);

  if (importResult.status === 404) {
    console.log('\n✗ API endpoint not found - 路由未加载');
    console.log('  原因：测试后端启动时代码可能未包含新路由');
    process.exit(1);
  }

  if (!importResult.data.success) {
    console.log(`\n✗ 导入失败: ${importResult.data.error || importResult.data.message}`);
  } else {
    console.log('✓ 质检记录导入成功');
  }

  console.log('\n步骤 3：查询质检记录');
  const queryResult = await request('GET', '/api/v1/storyboards/3/quality-checks');
  console.log(`状态码: ${queryResult.status}`);

  if (queryResult.data.success) {
    const checks = queryResult.data.data.items || [];
    console.log(`✓ 查询成功，共 ${checks.length} 条记录`);
    if (checks.length > 0) {
      console.log('\n最新质检记录:');
      const latest = checks[checks.length - 1];
      console.log(`  Agent: ${latest.agent_type}`);
      console.log(`  Verdict: ${latest.verdict}`);
      console.log(`  Score: ${latest.score}`);
      console.log(`  Image Task: ${latest.image_generation_id}`);
      console.log(`  Video Task: ${latest.video_generation_id}`);
    }
  } else {
    console.log(`✗ 查询失败: ${queryResult.data.error || queryResult.data.message}`);
  }

  console.log('\n=== 测试完成 ===\n');
})().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
