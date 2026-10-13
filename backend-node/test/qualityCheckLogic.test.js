const assert = require('assert');
const { describe, it } = require('node:test');

describe('Quality Check API Logic', () => {
  it('should structure quality check data with media task IDs', () => {
    const mockBody = {
      agent_type: 'visual-inspector',
      execution_id: 'exec-123',
      verdict: 'APPROVE',
      score: 85,
      image_generation_id: 22,
      video_generation_id: 7,
      observations: { composition: 'good' },
      recommendations: ['improve lighting'],
      checked_at: '2026-10-13T06:00:00Z',
    };

    const qualityCheck = {
      agent_type: mockBody.agent_type || 'unknown',
      execution_id: mockBody.execution_id || null,
      verdict: mockBody.verdict || 'UNKNOWN',
      score: typeof mockBody.score === 'number' ? mockBody.score : null,
      image_generation_id: mockBody.image_generation_id || null,
      video_generation_id: mockBody.video_generation_id || null,
      observations: mockBody.observations || {},
      recommendations: Array.isArray(mockBody.recommendations) ? mockBody.recommendations : [],
      checked_at: mockBody.checked_at || new Date().toISOString(),
    };

    assert.strictEqual(qualityCheck.agent_type, 'visual-inspector');
    assert.strictEqual(qualityCheck.execution_id, 'exec-123');
    assert.strictEqual(qualityCheck.verdict, 'APPROVE');
    assert.strictEqual(qualityCheck.score, 85);
    assert.strictEqual(qualityCheck.image_generation_id, 22);
    assert.strictEqual(qualityCheck.video_generation_id, 7);
    assert.deepStrictEqual(qualityCheck.observations, { composition: 'good' });
    assert.deepStrictEqual(qualityCheck.recommendations, ['improve lighting']);
  });

  it('should handle missing optional fields', () => {
    const mockBody = {
      agent_type: 'performance-continuity',
      verdict: 'REVISE',
    };

    const qualityCheck = {
      agent_type: mockBody.agent_type || 'unknown',
      execution_id: mockBody.execution_id || null,
      verdict: mockBody.verdict || 'UNKNOWN',
      score: typeof mockBody.score === 'number' ? mockBody.score : null,
      image_generation_id: mockBody.image_generation_id || null,
      video_generation_id: mockBody.video_generation_id || null,
      observations: mockBody.observations || {},
      recommendations: Array.isArray(mockBody.recommendations) ? mockBody.recommendations : [],
      checked_at: mockBody.checked_at || new Date().toISOString(),
    };

    assert.strictEqual(qualityCheck.agent_type, 'performance-continuity');
    assert.strictEqual(qualityCheck.execution_id, null);
    assert.strictEqual(qualityCheck.verdict, 'REVISE');
    assert.strictEqual(qualityCheck.score, null);
    assert.strictEqual(qualityCheck.image_generation_id, null);
    assert.strictEqual(qualityCheck.video_generation_id, null);
    assert.deepStrictEqual(qualityCheck.observations, {});
    assert.deepStrictEqual(qualityCheck.recommendations, []);
  });
});

describe('Orphaned Image Cleanup Logic', () => {
  it('should identify local interrupt (created_at === updated_at)', () => {
    const tasks = [
      { id: 1, created_at: '2026-10-13T04:00:00Z', updated_at: '2026-10-13T04:00:00Z', status: 'processing' }, // 本地中断
      { id: 2, created_at: '2026-10-13T04:00:00Z', updated_at: '2026-10-13T04:30:00Z', status: 'processing' }, // 云端未知
    ];

    const localInterrupts = tasks.filter(t => t.created_at === t.updated_at);
    const cloudUnknown = tasks.filter(t => t.created_at !== t.updated_at);

    assert.strictEqual(localInterrupts.length, 1);
    assert.strictEqual(localInterrupts[0].id, 1);
    assert.strictEqual(cloudUnknown.length, 1);
    assert.strictEqual(cloudUnknown[0].id, 2);
  });

  it('should preserve cloud status unknown tasks', () => {
    const now = new Date('2026-10-13T10:00:00Z');
    const tasks = [
      { id: 1, created_at: '2026-10-13T07:00:00Z', updated_at: '2026-10-13T07:00:00Z', status: 'processing' }, // 本地中断 - fail
      { id: 2, created_at: '2026-10-13T07:00:00Z', updated_at: '2026-10-13T07:30:00Z', status: 'processing' }, // 云端未知 - 保留
    ];

    const shouldFail = tasks.filter(t => {
      if (t.status !== 'processing') return false;
      const created = new Date(t.created_at);
      const ageHours = (now - created) / (1000 * 60 * 60);
      if (ageHours <= 2) return false;
      return t.created_at === t.updated_at; // 只失败本地中断的
    });

    assert.strictEqual(shouldFail.length, 1);
    assert.strictEqual(shouldFail[0].id, 1);
  });
});

