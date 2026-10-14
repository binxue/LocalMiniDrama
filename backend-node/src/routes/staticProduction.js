const response = require('../response');
const production = require('../services/staticProductionService');
module.exports = (db, cfg, log) => ({
  start(req, res) {
    try { response.success(res, production.start(db, cfg, log, { ...(req.body || {}), storyboard_id: Number(req.params.id) })); }
    catch (error) { response.badRequest(res, error.message); }
  },
  status(req, res) {
    try { response.success(res, production.status(db, Number(req.params.id))); }
    catch (error) { response.internalError(res, error.message); }
  },
  resume(req, res) {
    try { response.success(res, production.resume(db, cfg, log, req.params.runId, req.body || {})); }
    catch (error) { response.badRequest(res, error.message); }
  },
  async billing(req, res) {
    try { response.success(res, await production.checkBilling(db, cfg, log, req.params.runId)); }
    catch (error) { response.badRequest(res, error.message); }
  },
});
