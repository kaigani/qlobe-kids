import { combinationId, createStoryStage, resolveStory } from '../../engines/story-stones.js';
import { generateStoryScene, saveDocument, downloadDocument, studioJob } from '../api.js';

const GAME_BASE = new URL('../../../../games/story-stones/', import.meta.url);
const PACK_URL = new URL('story-pack.json', GAME_BASE);
const PACK_PATH = 'games/story-stones/story-pack.json';
const POSES=['neutral','enter','notice','interact','react','celebrate'];
const ROLES=['first','second','third'];
const STATUSES=['draft','review','approved'];
const opts=(stones,selected)=>stones.map((stone)=>`<option value="${stone.id}"${stone.id===selected?' selected':''}>${stone.label}</option>`).join('');
const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export async function mount(host,{toast}){
  let pack=await fetch(PACK_URL,{cache:'no-store'}).then((response)=>response.json());
  let ids=['dragon','orange-cat','wishing-star'],runtime=null,destroyed=false,jobTimer=null,filterTimer=null;
  let filterText='',filterStone='',filterStatus='';
  const stoneOrder=new Map(pack.stones.map((stone,index)=>[stone.id,index]));
  const normalize=(values)=>[...new Set(values)].sort((a,b)=>stoneOrder.get(a)-stoneOrder.get(b));
  ids=normalize(ids);
  host.innerHTML=`<div class="workspace" data-workspace="stage"><div class="workspace-tools"><label>Story stone<select data-slot="0"></select></label><label>Story stone<select data-slot="1"></select></label><label>Story stone<select data-slot="2"></select></label><button data-play>Play exact story</button><button data-stop class="warn">Stop</button><button data-save class="save">Save Story Pack</button><button data-export class="ghost">Export JSON</button></div><div class="workspace-canvas" data-stage><span class="canvas-badge">Story Stones · 220 unordered complete stories</span></div><aside class="workspace-inspector"><div data-inspector></div></aside></div>`;
  const stageHost=host.querySelector('[data-stage]'),inspector=host.querySelector('[data-inspector]');
  const selectedRecipe=()=>pack.stories[combinationId(ids)];
  const story=()=>resolveStory(pack,ids);
  function fill(){host.querySelectorAll('[data-slot]').forEach((select,index)=>{select.innerHTML=opts(pack.stones,ids[index]);});}
  function filteredStories(){
    const needle=filterText.trim().toLowerCase();
    return Object.values(pack.stories).filter((item)=>
      (!filterStone||item.stoneIds.includes(filterStone))&&(!filterStatus||item.status===filterStatus)&&
      (!needle||`${item.title} ${item.setting.label} ${item.stoneIds.join(' ')}`.toLowerCase().includes(needle)));
  }
  function poseFields(beat,index){
    return ['reveal','story','settle'].flatMap((moment)=>ROLES.slice(0,index+1).map((role)=>{
      const inherited=pack.poseDefaults?.[beat.id]?.[moment]?.[role]||'neutral';
      const value=beat.poseCues?.[moment]?.[role]||'';
      return `<label>${moment} · ${role}<select data-pose-beat="${index}" data-pose-moment="${moment}" data-pose-role="${role}"><option value=""${value?'':' selected'}>Default (${inherited})</option>${POSES.map((pose)=>`<option value="${pose}"${pose===value?' selected':''}>${pose}</option>`).join('')}</select></label>`;
    })).join('');
  }
  function syncFields(){
    const recipe=selectedRecipe();if(!recipe)return;
    recipe.title=inspector.querySelector('[data-title]')?.value.trim()||recipe.title;
    recipe.status=inspector.querySelector('[data-status]')?.value||recipe.status;
    recipe.castOrder=[...inspector.querySelectorAll('[data-cast]')].map((field)=>field.value);
    recipe.setting.label=inspector.querySelector('[data-setting-label]')?.value.trim()||recipe.setting.label;
    recipe.setting.backdrop=inspector.querySelector('[data-backdrop]')?.value.trim()||recipe.setting.backdrop;
    recipe.setting.alt=inspector.querySelector('[data-alt]')?.value.trim()||recipe.setting.alt;
    recipe.setting.prompt=inspector.querySelector('[data-prompt]')?.value.trim()||recipe.setting.prompt;
    recipe.setting.seed=Number(inspector.querySelector('[data-seed]')?.value||recipe.setting.seed);
    inspector.querySelectorAll('[data-beat-text]').forEach((field)=>{recipe.beats[+field.dataset.beatText].text=field.value.trim();});
  }
  function draw(){
    const recipe=selectedRecipe(),listed=filteredStories(),all=Object.values(pack.stories);
    const approved=all.filter((item)=>item.status==='approved').length;
    inspector.innerHTML=`<div class="panel-section"><h2>Story Library</h2><p class="hint">Each unordered set owns one complete story, cast order, and unique Krea scene.</p><div class="field-grid"><label>Search<input data-filter-text value="${esc(filterText)}" placeholder="Title or setting"></label><label>Contains stone<select data-filter-stone><option value="">Any stone</option>${opts(pack.stones,filterStone)}</select></label><label>Status<select data-filter-status><option value="">Any status</option>${STATUSES.map((status)=>`<option${filterStatus===status?' selected':''}>${status}</option>`).join('')}</select></label></div><p class="hint">${listed.length}/220 shown · ${approved}/220 approved · 220 declared scenes · 660 narration beats</p><div class="list story-library-list">${listed.map((item)=>`<button class="list-item${item.id===recipe.id?' selected':''}" data-story="${item.id}"><span>${item.status==='approved'?'✓':'○'}</span><span><strong>${esc(item.setting.label)}</strong><small>${esc(item.title)}</small></span><span>›</span></button>`).join('')}</div></div>
      <div class="panel-section"><h3>${esc(recipe.setting.label)}</h3><label>Story title<input data-title value="${esc(recipe.title)}"></label><label>Review status<select data-status>${STATUSES.map((status)=>`<option${recipe.status===status?' selected':''}>${status}</option>`).join('')}</select></label><h4>Story-owned cast order</h4><div class="field-grid">${recipe.castOrder.map((id,index)=>`<label>Reveal ${index+1}<select data-cast="${index}">${opts(recipe.stoneIds.map((stoneId)=>pack.stones.find((stone)=>stone.id===stoneId)),id)}</select></label>`).join('')}</div></div>
      <div class="panel-section"><h3>Unique setting</h3><img class="scene-preview" src="${new URL(recipe.setting.backdrop,GAME_BASE).href}?studio=${Date.now()}" alt="${esc(recipe.setting.alt)}"><label>Setting label<input data-setting-label value="${esc(recipe.setting.label)}"></label><label>Backdrop path<input data-backdrop value="${esc(recipe.setting.backdrop)}"></label><label>Accessible description<input data-alt value="${esc(recipe.setting.alt)}"></label><label>Krea prompt<textarea data-prompt>${esc(recipe.setting.prompt)}</textarea></label><div class="field-grid"><label>Seed<input type="number" data-seed value="${recipe.setting.seed}"></label><label><input type="checkbox" data-overwrite> Replace existing art</label></div><button data-generate>Generate this Krea scene</button><p class="hint" data-job>krea2-turbo-t2i · 1344×768 · 8 steps · CFG 1</p></div>
      ${recipe.beats.map((beat,index)=>`<div class="panel-section"><h3>${index+1}. ${beat.id}</h3><label>Narration<textarea data-beat-text="${index}">${esc(beat.text)}</textarea></label><p class="hint">${esc(beat.narrator)}</p><details><summary>Pose cues</summary><div class="field-grid">${poseFields(beat,index)}</div></details></div>`).join('')}
      <div class="panel-section"><button data-apply>Apply edits in memory</button></div>`;
  }
  async function showSelectedBackdrop(){if(runtime)await runtime.theater.setBackdrop(new URL(selectedRecipe().setting.backdrop,GAME_BASE).href);}
  async function rebuild(){runtime?.destroy();runtime=await createStoryStage(stageHost,pack,GAME_BASE.href,{narrate:async(key,text)=>toast(`${key} · ${text}`,{duration:3000})});await showSelectedBackdrop();}
  async function play(){try{syncFields();await runtime.play(ids,{timeScale:1});toast('Complete story preview finished',{kind:'success'});}catch(error){toast(error.message,{error:true});}}
  async function pollJob(jobId){
    clearTimeout(jobTimer);if(destroyed)return;
    try{const job=await studioJob(jobId);const label=inspector.querySelector('[data-job]');if(label)label.textContent=job.message||job.status;
      if(job.status==='complete'||job.status==='completed'){toast('Krea scene saved as WebP',{kind:'success'});draw();await rebuild();return;}
      if(job.status==='failed')throw new Error(job.error||'Krea generation failed');
      jobTimer=setTimeout(()=>pollJob(jobId),1200);
    }catch(error){toast(error.message,{error:true,duration:7000});}
  }
  host.onchange=async(event)=>{
    if(!event.target.matches('[data-slot]'))return;
    const index=+event.target.dataset.slot,next=event.target.value,other=ids.indexOf(next);
    if(other>=0)[ids[index],ids[other]]=[ids[other],ids[index]];else ids[index]=next;
    ids=normalize(ids);fill();draw();await showSelectedBackdrop();
  };
  inspector.onclick=async(event)=>{
    const storyButton=event.target.closest('[data-story]');
    if(storyButton){ids=[...pack.stories[storyButton.dataset.story].stoneIds];fill();draw();await showSelectedBackdrop();return;}
    if(event.target.closest('[data-apply]')){try{syncFields();resolveStory(pack,ids);draw();toast('Story updated in memory',{kind:'success'});}catch(error){toast(error.message,{error:true});}return;}
    if(event.target.closest('[data-generate]')){try{syncFields();const recipe=selectedRecipe();const queued=await generateStoryScene({storyId:recipe.id,prompt:recipe.setting.prompt,seed:recipe.setting.seed,overwrite:inspector.querySelector('[data-overwrite]').checked});toast('Krea scene queued');pollJob(queued.jobId);}catch(error){toast(error.message,{error:true,duration:7000});}}
  };
  inspector.oninput=(event)=>{
    if(event.target.matches('[data-filter-text]')){filterText=event.target.value;clearTimeout(filterTimer);filterTimer=setTimeout(()=>{draw();const field=inspector.querySelector('[data-filter-text]');field?.focus();field?.setSelectionRange(filterText.length,filterText.length);},180);}
  };
  inspector.onchange=(event)=>{
    if(event.target.matches('[data-filter-stone]')){filterStone=event.target.value;draw();return;}
    if(event.target.matches('[data-filter-status]')){filterStatus=event.target.value;draw();return;}
    if(!event.target.matches('[data-pose-beat]'))return;
    const beat=selectedRecipe().beats[+event.target.dataset.poseBeat],moment=event.target.dataset.poseMoment,role=event.target.dataset.poseRole,value=event.target.value;
    beat.poseCues||={};beat.poseCues[moment]||={};if(value)beat.poseCues[moment][role]=value;else delete beat.poseCues[moment][role];
    if(!Object.keys(beat.poseCues[moment]).length)delete beat.poseCues[moment];if(!Object.keys(beat.poseCues).length)delete beat.poseCues;
    draw();
  };
  host.querySelector('[data-play]').onclick=play;host.querySelector('[data-stop]').onclick=()=>runtime?.stop();
  host.querySelector('[data-save]').onclick=async()=>{try{syncFields();await saveDocument(PACK_PATH,pack);toast('Story Pack saved',{kind:'success'});}catch(error){toast(error.message,{error:true});}};
  host.querySelector('[data-export]').onclick=()=>downloadDocument('story-pack.json',pack);
  fill();draw();await rebuild();
  window.QLOBE_STUDIO_DEBUG={workspace:'stage',adapter:'story-stones-v2',getDocument:()=>pack,getStory:story,select:async(next)=>{ids=normalize(next);fill();draw();await showSelectedBackdrop();},play,filter:(value)=>{filterText=value;draw();}};
  return()=>{destroyed=true;clearTimeout(jobTimer);clearTimeout(filterTimer);runtime?.destroy();if(window.QLOBE_STUDIO_DEBUG?.adapter==='story-stones-v2')delete window.QLOBE_STUDIO_DEBUG;};
}
