import request from './request'

/**
 * 质量检查 API
 */
export const qualityChecksAPI = {
  /**
   * 导入 Agent 质检结果
   */
  importQualityCheck(storyboardId, data) {
    return request({
      url: `/api/v1/storyboards/${storyboardId}/quality-check`,
      method: 'POST',
      data
    })
  },

  /**
   * 查询质检历史
   */
  getQualityChecks(storyboardId) {
    return request({
      url: `/api/v1/storyboards/${storyboardId}/quality-checks`,
      method: 'GET'
    })
  },

  /**
   * 记录制作人决策
   */
  recordProducerDecision(storyboardId, data) {
    return request({
      url: `/api/v1/storyboards/${storyboardId}/producer-decision`,
      method: 'POST',
      data
    })
  },

  /**
   * 查询决策历史
   */
  getProducerDecisions(storyboardId) {
    return request({
      url: `/api/v1/storyboards/${storyboardId}/producer-decisions`,
      method: 'GET'
    })
  }
}
