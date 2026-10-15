import test from 'node:test'
import assert from 'node:assert/strict'
import {displayedCandidate,readableEpisodes} from '../src/utils/scriptResults.js'
test('reader and export share completed revision and preserve original',()=>{
 const c={candidate_id:'c',episode_no:2,candidate_text:'原稿',candidate_sha256:'original',created_at:'2026-10-01'}
 const revisions=[{candidate_id:'c',status:'completed',candidate_text:'修改稿',candidate_sha256:'revised',editor_review:'评定',created_at:'2026-10-02'}, {candidate_id:'c',status:'reviewing',candidate_text:'待审草稿',created_at:'2026-10-03'}]
 const view=displayedCandidate(c,revisions)
 assert.equal(view.candidate_text,'修改稿');assert.equal(view.editor_review,'评定');assert.equal(view.original,c)
 assert.deepEqual(readableEpisodes([c],revisions)[0],view);assert.equal(c.candidate_text,'原稿')
})
test('export selects latest saved candidate per episode in episode order',()=>{
 const candidates=[{candidate_id:'old',episode_no:2,candidate_text:'旧',created_at:'2026-10-01'}, {candidate_id:'new',episode_no:2,candidate_text:'新',created_at:'2026-10-03'}, {candidate_id:'one',episode_no:1,candidate_text:'第一集',created_at:'2026-10-02'}, {candidate_id:'empty',episode_no:3,candidate_text:null,created_at:'2026-10-04'}]
 assert.deepEqual(readableEpisodes(candidates).map(c=>c.candidate_id),['one','new'])
 assert.deepEqual(readableEpisodes(candidates,[],2).map(c=>c.candidate_id),['new'])
 assert.deepEqual(readableEpisodes(candidates,[],3),[])
})
test('next episode fills a gap rather than skipping to largest candidate number', async()=>{
 const {nextEpisodeNumber}=await import('../src/utils/scriptResults.js')
 assert.equal(nextEpisodeNumber([{id:'ep1',available:true}],[{episode_no:3,candidate_text:'第三集'}]),2)
 assert.equal(nextEpisodeNumber([{id:'ep1',available:true}],[{episode_no:2,candidate_text:'第二集'}]),3)
 assert.equal(nextEpisodeNumber([],[{episode_no:1,status:'writing',candidate_text:null}]),1)
 assert.equal(nextEpisodeNumber([{id:'ep1',available:false}],[]),1)
})
