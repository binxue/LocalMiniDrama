#!/usr/bin/env node
/**
 * 清理 storyboard 3 的测试质检记录
 * 保留：approval, production_review
 * 删除：quality_checks 中的测试记录
 */

const http = require('http');

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
  console.log('=== 清理测试质检记录 ===\n');

  // 1. 获取当前数据
  const res = await request('GET', '/api/v1/storyboards/3');
  if (!res.data.success) {
    console.error('✗ 获取 storyboard 失败');
    process.exit(1);
  }

  const sb = res.data.data;
  let desc = typeof sb.description === 'string' ? JSON.parse(sb.description) : sb.description;

  console.log('原始记录：');
  console.log('  approval:', desc.approval ? 'exists' : 'none');
  console.log('  production_review:', desc.production_review ? 'exists' : 'none');
  console.log('  quality_checks:', desc.quality_checks ? desc.quality_checks.length : 0);

  if (!desc.quality_checks || desc.quality_checks.length === 0) {
    console.log('\n✓ 无质检记录，无需清理');
    return;
  }

  // 2. 识别测试记录
  const testIds = ['exec-final-test-001', 'test-frontend-verification'];
  const testAgentPrefixes = ['[TEST]'];

  const original = desc.quality_checks.filter(c => {
    // 排除测试 execution_id
    if (testIds.includes(c.execution_id) || c.execution_id === null) return false;
    // 排除 [TEST] 前缀的 agent_type
    if (c.agent_type && testAgentPrefixes.some(prefix => c.agent_type.startsWith(prefix))) return false;
    return true;
  });

  const removed = desc.quality_checks.filter(c => {
    if (testIds.includes(c.execution_id) || c.execution_id === null) return true;
    if (c.agent_type && testAgentPrefixes.some(prefix => c.agent_type.startsWith(prefix))) return true;
    return false;
  });

  console.log('\n识别结果：');
  console.log('  保留质检记录:', original.length);
  console.log('  删除测试记录:', removed.length);
  removed.forEach(r => {
    console.log(`    - ${r.agent_type} (${r.execution_id || 'null'})`);
  });

  // 3. 清理测试记录
  desc.quality_checks = original;

  // 4. 更新数据库
  const updateRes = await request('PUT', `/api/v1/storyboards/${sb.id}`, {
    description: JSON.stringify(desc)
  });

  if (updateRes.data.success) {
    console.log('\n✓ 测试记录已清理');
    console.log('  保留：approval, production_review');
    console.log('  删除：测试质检记录');
  } else {
    console.error('\n✗ 更新失败:', updateRes.data.error || updateRes.data.message);
    process.exit(1);
  }

  // 5. 验证
  const verifyRes = await request('GET', '/api/v1/storyboards/3/quality-checks');
  if (verifyRes.data.success) {
    console.log('\n验证结果：');
    console.log('  当前质检记录数:', verifyRes.data.data.total);
    if (verifyRes.data.data.total === 0) {
      console.log('  ✓ 所有测试记录已清理');
    }
  }

  console.log('\n=== 清理完成 ===\n');
})().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
