const response = require('../response');
const { guard } = require('./managedAgents');
const service = require('../services/scriptAssistantService');
const managed = require('../services/managedAgentService');

module.exports = function scriptAssistant(db, log, config) {
  service.ensureTable(db);
  const wrap = fn => async (req, res) => {
    try { guard(req); response.success(res, await fn(req)); }
    catch (err) { response.badRequest(res, err.message); }
  };
  return {
    works: wrap(() => ({ works: service.works(config).map(w => ({ id: w.id, title: w.title })), budget: service.budget(db) })),
    context: wrap(req => service.summary(service.loadWork(config, req.params.work_id))),
    source: wrap(req => {
      const source = service.loadWork(config, req.params.work_id).sources.find(s => s.id === req.params.source_id);
      if (!source) throw new Error('资料未关联');
      return source;
    }),
    messages: wrap(req => {
      service.loadWork(config, req.params.work_id);
      return { messages: service.messages(db, req.params.work_id), budget: service.budget(db) };
    }),
    create: wrap(req => service.createMessage(db, log, config, req.params.work_id, req.body)),
    refresh: wrap(async req => {
      const m = service.messages(db, req.params.work_id).find(m => String(m.id) === req.params.message_id);
      if (!m) throw new Error('本作品未关联该消息');
      await managed.refreshTask(db, m.task.task_id);
      return service.messages(db, req.params.work_id).find(row => row.id === m.id);
    }),
  };
};
