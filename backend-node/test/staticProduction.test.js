const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { quarantine, reserve, validateReview, validateAnalysis, approvedStoryboard, status } = require('../src/services/staticProductionService');
const { hash } = require('../src/services/managedAgentReviewEvidence');
function database(description) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE storyboards (id INTEGER, description TEXT, updated_at TEXT);');
  db.prepare('INSERT INTO storyboards VALUES (3, ?, NULL)').run(JSON.stringify(description));
  return db;
}
test('simulated 88 score and fake production round are isolated with original evidence intact', () => {
  const simulated = { execution_id: 'test-simulated-only', score: 88, verdict: 'APPROVE' };
  const real = { execution_id: 'test-real-envelope-only', evidence: { submit_event_id: 'test-send', result_event_id: 'test-result' } };
  const original = { approval: { input_hash: 'approved-test' }, production_review: { original: true },
    quality_checks: [simulated, real], production_round_1: { agent_review_completed: true, score: 88, status: 'approved' } };
  const db = database(original);
  try {
    quarantine(db); quarantine(db);
    const stored = JSON.parse(db.prepare('SELECT description FROM storyboards').get().description);
    assert.deepEqual(stored.approval, original.approval);
    assert.deepEqual(stored.production_review, original.production_review);
    assert.deepEqual(stored.quality_checks, [real]);
    assert.equal(stored.quarantined_quality_checks.length, 1);
    assert.deepEqual(stored.quarantined_quality_checks[0].original, simulated);
    assert.deepEqual(stored.quarantined_production_rounds[0].original, original.production_round_1);
    assert.equal(stored.production_round_1, undefined);
  } finally { db.close(); }
});
test('budget is cumulative across runs and blocks BEFORE another billable write', () => {
  const approval = { id: 'approved-test' };
  const run = { run_id: 'current-test', approval_sha256: hash(JSON.stringify(approval)), costs: { reservations: [] } };
  const db = database({ approval, static_production_runs: [{ run_id: 'old-test', costs: { reservations: [{ reserved_cny: 8 }] } }, run] });
  try {
    reserve(db, run, 'managed_agent', 2, 'test-stage');
    assert.throws(() => reserve(db, run, 'seedream_image', 0.6, 'test-image'), /BUDGET_BLOCKED/);
    const stored = JSON.parse(db.prepare('SELECT description FROM storyboards').get().description);
    assert.equal(stored.static_production_runs[1].costs.reservations.length, 1);
    assert.equal(stored.static_production_runs[1].costs.reservations[0].actual_cost_cny, null);
  } finally { db.close(); }
});
test('approved direction changing prevents further production writes', () => {
  const run = { run_id: 'test', approval_sha256: 'wrong-hash', costs: { reservations: [] } };
  const db = database({ approval: { changed: true }, static_production_runs: [run] });
  try { assert.throws(() => reserve(db, run, 'managed_agent', 2, 'test'), /批准记录已变化/); }
  finally { db.close(); }
});
test('missing optimized prompt and invented visual success are not accepted', () => {
  assert.throws(() => validateAnalysis({ analysis: 'Only commentary' }), /优化提示词/);
  assert.throws(() => validateReview({ verdict: 'APPROVE', score: 88 }), /响应无效/);
  assert.throws(() => validateReview({ verdict: 'PASS', score: 88, observations: {}, recommendations: [] }), /响应无效/);
  assert.equal(validateReview({ verdict: 'REVISE', score: 62, observations: { defect: 'test' }, recommendations: ['test correction'] }).verdict, 'REVISE');
});
test('formal storyboard belongs to drama through episode relation, without duplicate drama_id column', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE episodes (id INTEGER, drama_id INTEGER); CREATE TABLE storyboards (id INTEGER, episode_id INTEGER, deleted_at TEXT); INSERT INTO episodes VALUES(2,2); INSERT INTO storyboards VALUES(3,2,NULL);');
    assert.equal(approvedStoryboard(db).drama_id, 2);
    db.exec('UPDATE episodes SET drama_id=9');
    assert.throws(() => approvedStoryboard(db), /业务数据不匹配/);
  } finally { db.close(); }
});
test('confirmed preflight failure releases only its reservation; UNKNOWN keeps budget frozen and raw evidence unchanged', () => {
  const runs = ['FAILED', 'UNKNOWN'].map((execution_status, index) => ({ run_id: 'test-' + index,
    costs: { reservations: [{ stage: 'analysis-1', reserved_cny: 2 }] },
    executions: [{ stage: 'analysis-1', execution_status, session_id: null, submit_event_id: null }] }));
  const db = database({ static_production_runs: runs });
  try {
    const projected = status(db).runs;
    assert.equal(projected[0].costs.reservations[0].reserved_cny, 0);
    assert.equal(projected[0].costs.reservations[0].billing_status, 'NOT_SUBMITTED');
    assert.equal(projected[1].costs.reservations[0].reserved_cny, 2);
    assert.deepEqual(JSON.parse(db.prepare('SELECT description FROM storyboards').get().description).static_production_runs, runs);
  } finally { db.close(); }
});
