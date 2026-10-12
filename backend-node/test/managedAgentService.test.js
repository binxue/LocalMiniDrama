const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const service = require('../src/services/managedAgentService');

test('managed agent tasks persist input version and do not accept unknown agents', () => {
  const db = new Database(':memory:');
  service.ensureTable(db);
  assert.throws(() => service.createTask(db, { info() {}, error() {} }, { agent_id: 'agent-unknown', work_id: 'w', input: 'x' }), /白名单/);
  const stamp = new Date().toISOString();
  db.prepare(`INSERT INTO managed_agent_tasks (task_id, work_id, agent_id, task_status, input_version, input_text, created_at, updated_at) VALUES ('mat_test', 'm1-test', 'agent-20261011131513-17rey', 'queued', ?, '短任务', ?, ?)`)
    .run(require('crypto').createHash('sha256').update('短任务').digest('hex'), stamp, stamp);
  const task = service.getTask(db, 'mat_test');
  assert.match(task.task_id, /^mat_/);
  assert.equal(task.input_version.length, 64);
  assert.equal(task.task_status, 'queued');
  service.recoverOnStartup(db, { warn() {} });
  assert.equal(service.getTask(db, task.task_id).task_status, 'interrupted');
  db.close();
});

test('events preserve missing usage and extract only actual agent messages', () => {
  const result = service.extract([
    { type: 'agent.thinking', content: [{ type: 'text', text: 'not output' }] },
    { type: 'span.model_request_start' },
    { type: 'span.model_request_end' },
    { type: 'span.model_request_start' },
    { type: 'agent.message', content: [{ type: 'text', text: 'actual output' }] },
    { type: 'session.status_idle' },
  ]);
  assert.equal(result.text, 'actual output');
  assert.equal(result.usage.missing_usage_requests, 1);
  assert.equal(result.usage.unfinished_requests, 1);
  assert.equal(service.extract([{ type: 'session.status_idle' }]).text, '');
});
