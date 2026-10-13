const response = require('../response');
const production = require('../services/staticProductionService');
module.exports = (db, cfg, log) => ({
  start(req, res) {
    if (Number(req.params.id) !== 3) return response.badRequest(res, '本阶段仅支持已批准 A 镜');
    try { response.success(res, production.start(db, cfg, log, req.body || {})); }
    catch (error) { response.badRequest(res, error.message); }
  },
  status(req, res) {
    if (Number(req.params.id) !== 3) return response.badRequest(res, '本阶段仅支持已批准 A 镜');
    try { response.success(res, production.status(db)); }
    catch (error) { response.internalError(res, error.message); }
  },
  resume(req, res) {
    if (Number(req.params.id) !== 3) return response.badRequest(res, '本阶段仅支持已批准 A 镜');
    try { response.success(res, production.resume(db, cfg, log, req.params.runId, req.body || {})); }
    catch (error) { response.badRequest(res, error.message); }
  },
  async billing(req, res) {
    if (Number(req.params.id) !== 3) return response.badRequest(res, '本阶段仅支持已批准 A 镜');
    try { response.success(res, await production.checkBilling(db, cfg, log, req.params.runId)); }
    catch (error) { response.badRequest(res, error.message); }
  },
});
