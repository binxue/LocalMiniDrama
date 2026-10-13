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
        const existing = body.execution_id && desc.quality_checks.find(check => check.execution_id === body.execution_id);
        if (existing) {
          if (existing.image_generation_id !== (body.image_generation_id || null)
              || existing.video_generation_id !== (body.video_generation_id || null)
              || existing.verdict !== (body.verdict || 'UNKNOWN')
              || existing.evidence?.result_event_id !== body.evidence?.result_event_id) {
            return response.badRequest(res, '执行记录已存在且关联结果不同');
          }
          return response.success(res, { message: '质量检查已导入', check_count: desc.quality_checks.length });
        }
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
          ...(body.evidence ? { evidence: body.evidence } : {}),
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

    /**
     * 制作人决策接口
     * POST /api/v1/storyboards/:id/producer-decision
     * Body: {
     *   decision: 'APPROVE' | 'REVISE' | 'RESHOOT',
     *   image_generation_id: number (针对哪个图片版本),
     *   video_generation_id: number (针对哪个视频版本),
     *   notes: string (决策备注),
     *   decided_by: string (决策人),
     *   decided_at: ISO timestamp
     * }
     *
     * 与 Agent 质检的区别：
     * - Agent 质检：存储在 quality_checks 数组中，是建议
     * - 制作人决策：存储在 producer_decisions 数组中，是最终决定
     */
    recordProducerDecision: (req, res) => {
      try {
        const storyboardId = Number(req.params.id);
        const body = req.body || {};

        const sb = db.prepare('SELECT id, description FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(storyboardId);
        if (!sb) return response.notFound(res, '分镜不存在');

        // 验证关联的媒体任务
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

        let desc = {};
        try {
          if (sb.description) desc = JSON.parse(sb.description);
        } catch (_) {}

        // 添加制作人决策记录
        if (!desc.producer_decisions) desc.producer_decisions = [];
        desc.producer_decisions.push({
          decision: body.decision || 'UNKNOWN',
          image_generation_id: body.image_generation_id || null,
          video_generation_id: body.video_generation_id || null,
          notes: body.notes || '',
          decided_by: body.decided_by || 'unknown',
          decided_at: body.decided_at || new Date().toISOString(),
        });

        const now = new Date().toISOString();
        db.prepare('UPDATE storyboards SET description = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(desc), now, storyboardId);

        log.info('Producer decision recorded', {
          storyboard_id: storyboardId,
          decision: body.decision,
          image_gen_id: body.image_generation_id,
          video_gen_id: body.video_generation_id,
          decided_by: body.decided_by,
        });

        response.success(res, { message: '制作人决策已记录', decision_count: desc.producer_decisions.length });
      } catch (err) {
        log.error('record producer decision', { error: err.message });
        response.internalError(res, err.message);
      }
    },

    /**
     * 获取制作人决策历史
     * GET /api/v1/storyboards/:id/producer-decisions
     */
    getProducerDecisions: (req, res) => {
      try {
        const storyboardId = Number(req.params.id);
        const sb = db.prepare('SELECT description FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(storyboardId);
        if (!sb) return response.notFound(res, '分镜不存在');

        let desc = {};
        try {
          if (sb.description) desc = JSON.parse(sb.description);
        } catch (_) {}

        const decisions = desc.producer_decisions || [];
        response.success(res, { items: decisions, total: decisions.length });
      } catch (err) {
        log.error('get producer decisions', { error: err.message });
        response.internalError(res, err.message);
      }
    },
  };
}

module.exports = routes;

