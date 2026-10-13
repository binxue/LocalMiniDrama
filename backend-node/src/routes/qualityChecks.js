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
     *   image_generation_id: number (关联图片任务),
     *   video_generation_id: number (关联视频任务),
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

        // 验证关联的媒体任务是否存在
        if (body.image_generation_id) {
          const img = db.prepare('SELECT id FROM image_generations WHERE id = ? AND storyboard_id = ?')
            .get(body.image_generation_id, storyboardId);
          if (!img) return response.badRequest(res, '图片生成任务不存在或不属于此分镜');
        }
        if (body.video_generation_id) {
          const vid = db.prepare('SELECT id FROM video_generations WHERE id = ? AND storyboard_id = ?')
            .get(body.video_generation_id, storyboardId);
          if (!vid) return response.badRequest(res, '视频生成任务不存在或不属于此分镜');
        }

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
          image_generation_id: body.image_generation_id || null,
          video_generation_id: body.video_generation_id || null,
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
          image_gen_id: body.image_generation_id,
          video_gen_id: body.video_generation_id,
        });

        response.success(res, { message: '质量检查结果已导入', check_count: desc.quality_checks.length });
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
