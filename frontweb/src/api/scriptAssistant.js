import request from '@/utils/request'
const work = id => `/script-assistant/works/${encodeURIComponent(id)}`
export const getAssistantWorks = () => request.get('/script-assistant/works')
export const getAssistantContext = id => request.get(`${work(id)}/context`)
export const getAssistantMessages = id => request.get(`${work(id)}/messages`)
export const sendAssistantMessage = (id, message, key) => request.post(`${work(id)}/messages`, { message, client_message_id: key })
export const refreshAssistantMessage = (id, messageId) => request.post(`${work(id)}/messages/${messageId}/refresh`)
export const getAssistantSource = (id, sourceId) => request.get(`${work(id)}/sources/${encodeURIComponent(sourceId)}`)
export const getAssistantRuns = id => request.get(`${work(id)}/runs`)
export const createAssistantRun = (id, requestText) => request.post(`${work(id)}/runs`, { request: requestText })
export const getAssistantRevisions = id => request.get(`${work(id)}/revisions`)
export const createAssistantRevision = (id, sourceId) => request.post(`${work(id)}/revisions`, { source_id: sourceId })
export const approveAssistantRevision = id => request.post(`/script-assistant/revisions/${encodeURIComponent(id)}/approve`, { actor: 'user' })
