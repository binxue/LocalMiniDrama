export function displayedCandidate(candidate, revisions = []) {
  const latest = revisions.filter(r => r.candidate_id === candidate.candidate_id && r.status === 'completed' && r.candidate_text)
    .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  return latest ? {...candidate, candidate_text:latest.candidate_text, candidate_sha256:latest.candidate_sha256,
    editor_review:latest.editor_review, approval_status:latest.approval_status, original:candidate, is_revision:true} : candidate
}

export function readableEpisodes(candidates = [], revisions = [], episode = null) {
  const ordered = candidates.filter(c => c.candidate_text && (episode == null || Number(c.episode_no) === Number(episode)))
    .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)))
  const episodes = new Map()
  for (const candidate of ordered) if (!episodes.has(Number(candidate.episode_no))) episodes.set(Number(candidate.episode_no), displayedCandidate(candidate,revisions))
  return [...episodes.values()].sort((a,b) => Number(a.episode_no)-Number(b.episode_no))
}
export function nextEpisodeNumber(scripts = [], candidates = []) {
  const saved = new Set(candidates.filter(c=>c.candidate_text).map(c=>Number(c.episode_no)))
  for (const script of scripts.filter(s=>s.available !== false)) {
    const match=String(script.id || '').match(/(?:ep|episode)[_-]?(\d+)/i)
    if(match) saved.add(Number(match[1]))
  }
  let next=1
  while(saved.has(next)) next++
  return next
}
