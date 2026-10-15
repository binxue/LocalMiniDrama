<template>
  <section class="creative-workflow">
    <h2>创作成果</h2>
    <el-radio-group v-model="stage" size="large">
      <el-radio-button v-for="(name,key) in stages" :key="key" :label="key">{{ name }}</el-radio-button>
    </el-radio-group>
    <p class="muted">前期方案和剧本均为候选；保存策划不会批准剧本，也不会自动重写已完成内容。</p>
    <details v-if="workId && !isolated" class="new-plan">
      <summary>先做专业剧情策划</summary>
      <p>团队先交付剧情拆解与人物设计，完成后可阅读修改，再开始正文。{{ costNotice }}</p>
      <label>创作要求<el-input v-model="goal" type="textarea" :rows="3" placeholder="描述故事方向、希望强化的冲突和结尾" /></label>
      <label>范围：第 <el-input-number v-model="start" :min="1" :max="1000" /> 到第 <el-input-number v-model="end" :min="start" :max="start+49" /> 集</label>
      <el-button type="primary" :loading="creating" :disabled="!goal.trim()" @click="create">让专业团队完成策划</el-button>
    </details>
    <div v-if="batches.length" class="toolbar">
      <el-select v-model="batchId" aria-label="选择创作方案" @change="load">
        <el-option v-for="b in batches" :key="b.batch_id" :value="b.batch_id" :label="`第${b.episode_start}—${b.episode_end}集 · ${new Date(b.created_at).toLocaleString()}`" />
      </el-select>
      <el-button @click="load">刷新方案</el-button>
      <el-button v-if="selectedBatch?.planning_only && selectedBatch?.status==='paused' && planView?.plan" type="primary" :loading="creating" @click="startWriting">按这份方案写剧本</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div v-loading="loading">
      <template v-if="stage === 'settings'">
        <h3>{{ context?.title || '当前作品' }}</h3>
        <p>以作品已关联的故事内核和创作要求为依据，专业团队负责展开规划。</p>
        <article v-for="s in (context?.sources || []).filter(s => s.available && s.kind === 'core')" :key="s.id">
          <h4>{{ s.title }}</h4><div class="markdown-body" v-html="render(s.text, null)"></div>
        </article>
      </template>
      <template v-else-if="['outline','characters','beats'].includes(stage)">
        <p v-if="!planView?.raw">专业团队尚未交付前期成果。通过创作对话提出目标后，方案将在这里保存。</p>
        <template v-else>
          <div class="toolbar">
            <el-button @click="exportStage">导出{{ stages[stage] }}</el-button>
            <el-button v-if="planView.plan && !editing" @click="beginEdit">修改规划</el-button>
            <template v-if="editing"><el-button type="primary" :loading="saving" @click="save">保存新规划版本</el-button><el-button @click="editing=false">取消修改</el-button></template>
          </div>
          <el-alert v-if="!planView.plan" :title="planView.issue || '已有专业长文保留原样，尚未形成可校验的逐集剧情清单；不代表全剧拆解已完成。'" type="warning" :closable="false" />
          <template v-if="editing">
            <label>统一故事设定<el-input v-model="draft.story" type="textarea" :rows="3" /></label>
            <label>人物目标与关系<el-input v-model="draft.characters" type="textarea" :rows="4" /></label>
            <el-select v-model="episodeNo" aria-label="编辑分集规划"><el-option v-for="ep in draft.episodes" :key="ep.episode_no" :value="ep.episode_no" :label="`第${ep.episode_no}集`" /></el-select>
            <div v-if="editingEpisode">
              <label v-for="(name,key) in fields" :key="key">{{ name }}<el-input v-model="editingEpisode[key]" type="textarea" :rows="2" /></label>
              <h4>剧情事件</h4>
              <article v-for="(plot,i) in editingEpisode.plots" :key="i" class="plot-edit">
                <label v-for="(name,key) in plotFields" :key="key">{{ name }}<el-input v-model="plot[key]" type="textarea" :rows="2" /></label>
              </article>
              <label>场次安排（每行一项）<el-input :model-value="editingEpisode.scenes.join('\n')" @update:model-value="editingEpisode.scenes=$event.split('\n').filter(x=>x.trim())" type="textarea" :rows="3" /></label>
              <label>节拍安排（每行一项）<el-input :model-value="editingEpisode.beats.join('\n')" @update:model-value="editingEpisode.beats=$event.split('\n').filter(x=>x.trim())" type="textarea" :rows="3" /></label>
            </div>
            <label>本次修改说明<el-input v-model="note" placeholder="例如：加强第一集的行动因果" /></label>
          </template>
          <template v-else-if="planView.plan">
             <template v-if="stage === 'characters'">
               <div class="markdown-body" v-html="render(planView.plan.characters,null)"></div>
               <div v-for="(doc,i) in expertDocuments" :key="i" class="markdown-body" v-html="render(doc,null)"></div>
             </template>
             <template v-else>
              <p>{{ planView.plan.story }}</p>
              <el-select v-model="episodeNo" aria-label="查看分集规划"><el-option v-for="ep in planView.plan.episodes" :key="ep.episode_no" :value="ep.episode_no" :label="`第${ep.episode_no}集 · ${ep.title}`" /></el-select>
              <article v-if="episode" class="episode-plan">
                <h3>第{{ episode.episode_no }}集 · {{ episode.title }}</h3>
                <p><strong>目标：</strong>{{ episode.goal }}</p><p><strong>核心冲突：</strong>{{ episode.conflict }}</p>
                <el-table v-if="stage === 'outline'" :data="episode.plots" border>
                  <el-table-column type="index" label="剧情" width="65" />
                  <el-table-column v-for="(name,key) in plotFields" :key="key" :prop="key" :label="name" />
                </el-table>
                <template v-if="stage === 'beats'"><h4>场次</h4><ol><li v-for="s in episode.scenes" :key="s">{{ s }}</li></ol><h4>节拍</h4><ol><li v-for="s in episode.beats" :key="s">{{ s }}</li></ol></template>
                <p><strong>反转：</strong>{{ episode.reversal }}</p><p><strong>集尾钩子：</strong>{{ episode.hook }}</p>
                <p><strong>连续性与状态：</strong>{{ episode.continuity }}</p><p><strong>时长与表达：</strong>{{ episode.requirements }}</p>
              </article>
            </template>
          </template>
          <div v-else class="markdown-body" v-html="render(planView.legacy?.[stage] || '本次输出没有可独立定位的这一阶段资料。',null)"></div>
          <details><summary>来源与版本详情</summary><p>保存版本{{ planView.versions.length }}个；原始方案{{ planView.source_sha256 }}</p><p>人工修改版只用于后续创作参考，已有正文不自动改变。</p><div class="markdown-body" v-html="render(planView.raw,null)"></div></details>
        </template>
      </template>
      <template v-else>
        <p v-if="!selectedCandidates.length">该方案尚无分集正文或审核成果。</p>
        <article v-for="c in selectedCandidates" :key="c.candidate_id">
          <el-alert v-if="c.planning_sha256 && planView?.plan_sha256 && c.planning_sha256 !== planView.plan_sha256" title="本剧本采用的是较早的策划版本；当前策划变更未自动写入正文，请重新检查一致性。" type="warning" :closable="false" />
          <h3>第{{ c.episode_no }}集 · {{ c.approval_status === 'not_approved' ? '候选稿，未批准' : '已确认版本' }}</h3>
          <template v-if="stage === 'scripts'"><p v-if="c.is_revision">当前显示最新完成的修改稿；原稿保留。</p><el-button v-if="c.original" @click="$emit('open-candidate',c.original)">查看原稿</el-button><el-button v-if="c.candidate_text" @click="$emit('open-candidate',c)">阅读完整剧本</el-button><el-button v-if="c.candidate_text" @click="$emit('export',`第${c.episode_no}集 · 候选稿`,c.candidate_text)">导出剧本</el-button><p v-else>正在等待正文，不以聊天总结冒充成果。</p></template>
          <template v-else><div v-if="c.editor_review" class="markdown-body" v-html="render(c.editor_review,null)"></div><p v-else>{{ c.error_text || '尚无有效独立审核。' }}</p><p>专业评定不等于人工批准或实际拍摄验收。</p></template>
        </article>
      </template>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { displayedCandidate } from '@/utils/scriptResults'
import { getCreativePlan, saveCreativePlan, createCreativePlan, startCreativeWriting } from '@/api/scriptAssistant'
const props=defineProps({batches:{type:Array,default:()=>[]},candidates:{type:Array,default:()=>[]},context:Object,render:Function,workId:String,isolated:Boolean,revisions:{type:Array,default:()=>[]}})
const emit=defineEmits(['open-candidate','export','reload'])
const goal=ref(''),start=ref(1),end=ref(1),creating=ref(false)
const costNotice='使用现有文本Agent；价格未配置时无法预估金额，实际Token留存。'
defineExpose({exportPlan:(target)=>{if(!planView.value?.raw)return false;stage.value=['outline','characters','beats'].includes(target)?target:'outline';exportStage();return true},showScripts:()=>{stage.value='scripts'},showPlan:(target)=>{stage.value=['outline','characters','beats'].includes(target)?target:'outline'}})
const stage=ref('outline'),batchId=ref(''),planView=ref(null),loading=ref(false),error=ref(''),editing=ref(false),saving=ref(false),draft=ref(null),note=ref(''),episodeNo=ref(1)
const stages={settings:'创作设定',outline:'剧情拆解',characters:'人物关系',beats:'场次与节拍',scripts:'分集剧本',review:'专业评定'}
const fields={title:'本集标题',goal:'剧情及人物目标',conflict:'核心冲突',reversal:'反转',hook:'集尾钩子',continuity:'继承事实与结束状态',requirements:'时长、场景与表达要求'}
const plotFields={scene:'场景',action:'人物行动',result:'因果结果',emotion:'情绪／看点'}
const episode=computed(()=>planView.value?.plan?.episodes.find(e=>e.episode_no===episodeNo.value))
const editingEpisode=computed(()=>draft.value?.episodes.find(e=>e.episode_no===episodeNo.value))
const selectedBatch=computed(()=>props.batches.find(b=>b.batch_id===batchId.value))
const expertDocuments=computed(()=>{
  const agent=stage.value==='characters'?'agent-20261011131626-3w9ao':stage.value==='beats'?'agent-20261011131703-mbc7o':null
  if(!agent)return []
  return (planView.value?.expert_outputs||[]).filter(raw=>raw.includes(agent)).map(raw=>{
    for(const m of raw.matchAll(/```json\s*([\s\S]*?)```/gi)){try{const d=JSON.parse(m[1]);if(d.schema==='expert-design/v1')return `${d.global}\n\n${d.episodes.find(e=>e.episode_no===episodeNo.value)?.design||'本集尚无该专家设计'}`}catch{}}
    return raw
  })
})
const selectedCandidates=computed(()=>{
  const b=props.batches.find(b=>b.batch_id===batchId.value),ids=new Set(b?.items?.map(i=>i.candidate_id)||[])
  return props.candidates.filter(c=>ids.has(c.candidate_id)).map(c=>displayedCandidate(c,props.revisions))
})
let generation=0
async function load(){if(!batchId.value)return;const id=batchId.value,token=++generation;loading.value=true;error.value='';try{const x=await getCreativePlan(id);if(token!==generation)return;planView.value=x;editing.value=false;episodeNo.value=x.plan?.episodes[0]?.episode_no||x.range[0]}catch(e){if(token===generation)error.value=e.message}finally{if(token===generation)loading.value=false}}
watch(()=>props.batches.map(b=>b.batch_id).join(','),()=>{if(!props.batches.some(b=>b.batch_id===batchId.value)){batchId.value=props.batches[0]?.batch_id||'';planView.value=null;editing.value=false;if(batchId.value)load()}},{immediate:true})
watch(()=>props.batches.find(b=>b.batch_id===batchId.value)?.planning_hash,(hash,prev)=>{if(hash&&hash!==prev&&!editing.value)load()})
function beginEdit(){draft.value=JSON.parse(JSON.stringify(planView.value.plan));note.value='';editing.value=true}
async function save(){saving.value=true;error.value='';try{planView.value=await saveCreativePlan(batchId.value,{plan:draft.value,expected_source_sha256:planView.value.source_sha256,expected_version_id:planView.value.version_id,note:note.value});editing.value=false}catch(e){error.value=e.message}finally{saving.value=false}}
async function create(){creating.value=true;error.value='';try{const b=await createCreativePlan(props.workId,{request:goal.value,episode_start:start.value,episode_end:end.value});batchId.value=b.batch_id;emit('reload');await load()}catch(e){error.value=e.message}finally{creating.value=false}}
async function startWriting(){creating.value=true;error.value='';try{await startCreativeWriting(batchId.value,{version_id:planView.value.version_id,plan_sha256:planView.value.plan_sha256});emit('reload')}catch(e){error.value=e.message}finally{creating.value=false}}
function exportStage(){const p=planView.value.plan;let text=planView.value.legacy?.[stage.value]||'';if(p){text=stage.value==='characters'?p.characters:p.episodes.map(e=>`## 第${e.episode_no}集 ${e.title}\n目标：${e.goal}\n冲突：${e.conflict}\n${stage.value==='beats'?e.scenes.concat(e.beats).join('\n'):e.plots.map((x,i)=>`${i+1}. ${x.scene}：${x.action} → ${x.result}（${x.emotion}）`).join('\n')}\n反转：${e.reversal}\n钩子：${e.hook}\n连续性：${e.continuity}\n表达要求：${e.requirements}`).join('\n\n')}emit('export',props.context?.title+' · '+stages[stage.value],text)}
</script>

<style scoped>
.creative-workflow{padding:20px;border:1px solid #dce4ec;border-radius:12px;margin-bottom:20px;background:white}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.toolbar .el-select{min-width:280px}label{display:block;margin:12px 0}.plot-edit{border-left:3px solid #b5c9dd;padding-left:14px;margin:16px 0}details{margin-top:18px;color:#586575}article{margin:18px 0}.episode-plan p{white-space:pre-wrap}.muted{color:#6f7c88;font-size:13px}
</style>
