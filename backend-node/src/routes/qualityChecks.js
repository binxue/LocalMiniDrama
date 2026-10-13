const response = require('../response');

/**
 * Agent 质量检查结果导入接口
 * 接收 Python 脚本提交的 Agent 检查结果，存储到数据库
 */
function routes(db, cfg, log) {
  return {
    /**
     * 导入镜头质量检查结果
     * POST /api/v1/storyboards/:id/quality-check
     * Body: {
     *   agent_type: 'visual-inspector' | 'performance-continuity',
     *   execution_id: 'exec-xxx',
     *   verdict: 'APPROVE' | 'REVISE' | 'BLOCKED',
     *   score: 0-100,
     *   observations: { ... },
     *   recommendations: [ ... ],
     *   checked_at: ISO timestamp
     * }
     */
    importQualityCheck: (req, res) => {
      try {
        const storyboardId = Number(req.params.id);
        const body = req.body || {};

        const sb = db.prepare('SELECT id, description FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(storyboardId);
        if (!sb) return response.notFound(res, '分镜不存在');

        // 解析现有 description（可能包含批准记录）
        let desc = {};
        try {
          if (sb.description) desc = JSON.parse(sb.description);
        } catch (_) {}

        // 添加质量检查记录
        if (!desc.quality_checks) desc.quality_checks = [];
        desc.quality_checks.push({
          agent_type: body.agent_type || 'unknown',
          execution_id: body.execution_id || null,
          verdict: body.verdict || 'UNKNOWN',
          score: typeof body.score === 'number' ? body.score : null,
          observations: body.observations || {},
          recommendations: Array.isArray(body.recommendations) ? body.recommendations : [],
          checked_at: body.checked_at || new Date().toISOString(),
        });

        const now = new Date().toISOString();
        db.prepare('UPDATE storyboards SET description = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(desc), now, storyboardId);

        log.info('Quality check imported', {
          storyboard_id: storyboardId,
          agent_type: body.agent_type,
          verdict: body.verdict,
          score: body.score,
        });

        response.success(res, { message: '质量检查结果已导入' });
      } catch (err) {
        log.error('import quality check', { error: err.message });
        response.internalError(res, err.message);
      }
    },

    /**
     * 获取镜头质量检查历史
     * GET /api/v1/storyboards/:id/quality-checks
     */
    getQualityChecks: (req, res) => {
      try {
        const storyboardId = Number(req.params.id);
        const sb = db.prepare('SELECT description FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(storyboardId);
        if (!sb) return response.notFound(res, '分镜不存在');

        let desc = {};
        try {
          if (sb.description) desc = JSON.parse(sb.description);
        } catch (_) {}

        const checks = desc.quality_checks || [];
        response.success(res, { items: checks, total: checks.length });
      } catch (err) {
        log.error('get quality checks', { error: err.message });
        response.internalError(res, err.message);
      }
    },
  };
}

module.exports = routes;
