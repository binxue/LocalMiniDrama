const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const routes = require('../src/routes/qualityChecks');
test('review evidence import preserves approved content, remains advisory and is idempotent', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE storyboards (id INTEGER, description TEXT, deleted_at TEXT, updated_at TEXT); CREATE TABLE image_generations (id INTEGER, storyboard_id INTEGER);');
    const original = { approval: { execution_id: 'director-existing' }, production_review: { immutable: true } };
    db.prepare('INSERT INTO storyboards VALUES (?, ?, NULL, NULL)').run(3, JSON.stringify(original));
    db.prepare('INSERT INTO image_generations VALUES (?, ?)').run(22, 3);
    const api = routes(db, {}, { info() {}, error() {} });
    const body = { execution_id: 'review-test-only', image_generation_id: 22, verdict: 'REVISE', score: 61,
      evidence: { source: 'managed-agent-events', submit_event_id: 'send-current', result_event_id: 'reply-current' } };
    const res = { status() { return this; }, json(value) { this.body = value; } };
    for (let i = 0; i < 2; i++) api.importQualityCheck({ params: { id: '3' }, body }, res);
    assert.equal(res.body.success, true);
    const stored = JSON.parse(db.prepare('SELECT description FROM storyboards').get().description);
    assert.deepEqual(stored.approval, original.approval);
    assert.deepEqual(stored.production_review, original.production_review);
    assert.equal(stored.quality_checks.length, 1);
    assert.deepEqual(stored.quality_checks[0].evidence, body.evidence);
    assert.equal(stored.producer_decisions, undefined);
    api.importQualityCheck({ params: { id: '3' }, body: { ...body, verdict: 'APPROVE' } }, res);
    assert.equal(res.body.success, false);
    assert.equal(JSON.parse(db.prepare('SELECT description FROM storyboards').get().description).quality_checks[0].verdict, 'REVISE');
  } finally { db.close(); }
});
