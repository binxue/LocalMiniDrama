const response = require('../response');
const { guard } = require('./managedAgents');
const service = require('../services/scriptAssistantService');
const managed = require('../services/managedAgentService');

module.exports = function scriptAssistant(db, log, config) {
  service.ensureTable(db);
  // Startup preserves existing cloud sessions; it never repeats paid stages.
  db.prepare("UPDATE script_assistant_revisions SET status='awaiting_recovery',error_text='服务已重启，请回查原任务；不会自动重复收费调用' WHERE status IN ('queued','planning','writing','reviewing')").run();
  db.prepare("UPDATE script_assistant_episode_candidates SET status='awaiting_recovery',error_text='服务已重启；请回查已有 Writer/Editor 任务，不会自动重复调用' WHERE status IN ('queued','writing','reviewing')").run();
  db.prepare("UPDATE script_assistant_batches SET status='paused',error_text='服务已重启；可恢复未完成分集' WHERE status IN ('queued','running')").run();
  const wrap = fn => async (req, res) => {
    try { guard(req); response.success(res, await fn(req)); }
    catch (err) { response.badRequest(res, err.message); }
  };
  return {
    works: wrap(() => ({ works: service.works(config).map(w => ({ id: w.id, title: w.title })), budget: service.budget(db) })),
    context: wrap(req => service.summary(service.loadWork(config, req.params.work_id))),
    intent: wrap(req => { const work=service.loadWork(config,req.params.work_id); return { intent: service.classifyCreativeRequest(req.query?.text || '', work.sources.filter(s=>s.kind==='script')) }; }),
    source: wrap(req => {
      const source = service.loadWork(config, req.params.work_id).sources.find(s => s.id === req.params.source_id);
      if (!source) throw new Error('资料未关联');
      return source;
    }),
    messages: wrap(req => {
      service.loadWork(config, req.params.work_id);
      return { messages: service.messages(db, req.params.work_id), budget: service.budget(db) };
    }),
    runs: wrap(req => { service.loadWork(config, req.params.work_id); return { runs: service.runs(db, req.params.work_id), budget: service.budget(db) }; }),
    createRun: wrap(req => service.createRun(db, log, config, req.params.work_id, req.body?.request)),
    revisions: wrap(req => ({ revisions: service.revisions(db, req.params.work_id) })),
    candidates: wrap(req => ({ candidates: service.episodeCandidates(db, req.params.work_id) })),
    batches: wrap(req => ({ batches: service.batches(db, req.params.work_id) })),
    createEpisode: wrap(req => service.createEpisodeCandidate(db, log, config, req.params.work_id, req.body?.episode_no, req.body?.request)),
    createBatch: wrap(req => service.createBatch(db, log, config, req.params.work_id, req.body?.request, req.body?.episode_start, req.body?.episode_end)),
    resumeBatch: wrap(req => service.resumeBatch(db, log, config, req.params.batch_id)),
    pauseBatch: wrap(req => service.pauseBatch(db, req.params.batch_id)),
    reviewDecisions: wrap(req => ({ decisions: service.reviewDecisions(db, req.params.revision_id) })),
    saveReviewDecision: wrap(req => {
      const r = db.prepare('SELECT * FROM script_assistant_revisions WHERE revision_id=?').get(req.params.revision_id);
      if (!r) throw new Error('修改版本不存在');
      const s = service.loadWork(config, r.work_id).sources.find(x => x.id === r.source_id);
      if (!s?.available || s.sha256 !== r.source_sha256) throw new Error('原稿已变更或不可用，不能提交审阅');
      const { diffLines } = require('diff');
      const parts = diffLines(s.text, r.candidate_text || '');
      let oldLine = 1, newLine = 1; const ids = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]; let a = '', b = '';
        if (!p.added && !p.removed) a = b = p.value;
        else {
          ids.push(`${r.source_sha256}:${r.candidate_sha256}:${oldLine}:${newLine}`);
          if (p.removed) a = p.value; else b = p.value;
          if (p.removed && parts[i + 1]?.added) b = parts[++i].value;
        }
        oldLine += (a.match(/\n/g) || []).length; newLine += (b.match(/\n/g) || []).length;
      }
      if (!ids.includes(req.body?.block_id)) throw new Error('修改块不存在或版本已过期');
      return { decisions: service.saveReviewDecision(db, r.revision_id, req.body?.block_id, req.body?.action, req.body?.note, req.body) };
    }),
    createRevision: wrap(req => service.createRevision(db, log, config, req.params.work_id, req.body?.source_id, req.body?.request)),
    approveRevision: wrap(req => service.approveRevision(db, req.params.revision_id, req.body?.actor || 'user', req.body)),
    refreshRevision: wrap(req => service.refreshRevision(db, req.params.revision_id)),
    recoverEditor: wrap(req => service.createEditorRecovery(db, log, req.params.revision_id)),
    create: wrap(req => service.createMessage(db, log, config, req.params.work_id, req.body)),
    refresh: wrap(async req => {
      const m = service.messages(db, req.params.work_id).find(m => String(m.id) === req.params.message_id);
      if (!m) throw new Error('本作品未关联该消息');
      await managed.refreshTask(db, m.task.task_id);
      return service.messages(db, req.params.work_id).find(row => row.id === m.id);
    }),
  };
};
