const response = require('../response');
const service = require('../services/managedAgentService');

module.exports = function routes(db, log) {
  service.ensureTable(db);
  const guard = req => {
    const ip = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) throw new Error('仅允许本机调用');
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new Error('拒绝跨域 Agent 调用');
  };
  return {
    refresh: async (req, res) => {
      try { guard(req); response.success(res, await service.refreshTask(db, req.params.task_id)); }
      catch (err) { response.badRequest(res, err.message); }
    },
    agents: (req, res) => {
      try { guard(req); response.success(res, [...service.ALLOWED_AGENTS]); }
      catch (err) { response.forbidden(res, err.message); }
    },
    create: (req, res) => {
      try { guard(req); response.created(res, service.createTask(db, log, req.body || {})); }
      catch (err) { response.badRequest(res, err.message); }
    },
    get: (req, res) => {
      try { guard(req); } catch (err) { return response.forbidden(res, err.message); }
      const task = service.getTask(db, req.params.task_id);
      if (!task) return response.notFound(res, 'Managed Agent 任务不存在');
      response.success(res, task);
    },
    list: (req, res) => {
      try { guard(req); response.success(res, service.listTasks(db, req.query.limit)); }
      catch (err) { response.forbidden(res, err.message); }
    },
  };
};
