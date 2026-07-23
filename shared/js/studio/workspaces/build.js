import { loadStudioProjects, projectOptions } from '../projects.js';
import { saveDocument, uploadAsset } from '../api.js';
import { createStage } from '../../stage/stage.js';
import { createTheater } from '../../stage/theater.js';

const optionList = (items, selected) => items.map(([id,label]) => `<option value="${id}"${id===selected?' selected':''}>${label}</option>`).join('');

function alphaBoxes(image) {
  const canvas = document.createElement('canvas'); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(image,0,0);
  const data=ctx.getImageData(0,0,canvas.width,canvas.height), w=canvas.width,h=canvas.height;
  const seen=new Uint8Array(w*h), queue=new Int32Array(w*h), found=[];
  for(let y=0;y<h;y+=1) for(let x=0;x<w;x+=1){ const start=y*w+x;if(seen[start]||data.data[start*4+3]<24)continue;
    let read=0,write=1,area=0,minX=x,maxX=x,minY=y,maxY=y;queue[0]=start;seen[start]=1;
    while(read<write){const index=queue[read++],px=index%w,py=Math.floor(index/w);area+=1;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
      for(const [nx,ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]]){if(nx<0||ny<0||nx>=w||ny>=h)continue;const ni=ny*w+nx;if(!seen[ni]&&data.data[ni*4+3]>=24){seen[ni]=1;queue[write++]=ni;}}
    } if(area>400)found.push({area,box:[minX,minY,maxX+1,maxY+1]});
  } return found.sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]);
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image(), url = URL.createObjectURL(blob);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode the source PNG.')); };
    image.src = url;
  });
}

function cropPart(image, box) {
  const [left, top, right, bottom] = box.map(Math.round), width = right - left, height = bottom - top;
  if (width < 1 || height < 1 || left < 0 || top < 0 || right > image.naturalWidth || bottom > image.naturalHeight) {
    throw new Error(`Invalid part box: ${box.join(', ')}`);
  }
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(image, left, top, width, height, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode a part PNG.')), 'image/png'));
}

async function normalizePose(file) {
  const image = await loadImage(file), boxes = alphaBoxes(image);
  if (!boxes.length) throw new Error('The pose needs a transparent background and one visible character.');
  const left = Math.min(...boxes.map((item) => item.box[0])), top = Math.min(...boxes.map((item) => item.box[1]));
  const right = Math.max(...boxes.map((item) => item.box[2])), bottom = Math.max(...boxes.map((item) => item.box[3]));
  const width = right-left, height = bottom-top, scale = Math.min(900/width, 900/height);
  const targetWidth = Math.round(width*scale), targetHeight = Math.round(height*scale);
  const canvas = document.createElement('canvas'); canvas.width=1024; canvas.height=1024;
  canvas.getContext('2d').drawImage(image,left,top,width,height,Math.round((1024-targetWidth)/2),972-targetHeight,targetWidth,targetHeight);
  return new Promise((resolve,reject)=>canvas.toBlob((blob)=>blob?resolve(blob):reject(new Error('Could not encode the pose WebP.')),'image/webp',.92));
}

export async function mount(host,{params,toast,openWorkspace}){
  const projects=await loadStudioProjects();
  let project=projects.find((item)=>item.id===params.get('project')&&item.workspaces?.build)||projects.find((item)=>item.id==='story-stones');
  let actorId=params.get('char')||'dragon', actorPack=null, build=null;
  let poseId=params.get('pose')||'neutral', poseManifest=null, poseStage=null, poseTheater=null, poseActor=null;
  host.innerHTML=`<div class="workspace" data-workspace="build"><div class="workspace-tools"><label>Project<select data-project>${projectOptions(projects,'build',project.id)}</select></label><span data-profile class="canvas-badge"></span><button data-save class="save">Save build manifest</button></div><div class="workspace-canvas" data-canvas></div><aside class="workspace-inspector" data-inspector></aside></div>`;
  const canvasHost=host.querySelector('[data-canvas]'), inspector=host.querySelector('[data-inspector]');
  async function loadPoseLibrary(ws){
    host.querySelector('[data-profile]').textContent='Whole-image story poses';
    host.querySelector('[data-save]').hidden=false;
    const packUrl=new URL(ws.actorPack,project.baseUrl); actorPack=await fetch(packUrl,{cache:'no-store'}).then(r=>r.json());
    actorId=actorPack.actors[actorId]?actorId:Object.keys(actorPack.actors)[0];
    const actorDef=actorPack.actors[actorId], actorBase=new URL(actorDef.base,packUrl), manifestUrl=new URL(actorDef.manifest||'poses.json',actorBase);
    poseManifest=await fetch(manifestUrl,{cache:'no-store'}).then(r=>r.json());
    poseId=poseManifest.poses[poseId]?poseId:Object.keys(poseManifest.poses)[0]; build=poseManifest;
    params.set('project',project.id);params.set('char',actorId);params.set('pose',poseId);
    const next=new URL(location.href);next.searchParams.set('project',project.id);next.searchParams.set('char',actorId);next.searchParams.set('pose',poseId);history.replaceState(null,'',next);

    poseTheater?.destroy(); poseStage?.destroy(); poseTheater=poseStage=poseActor=null;
    canvasHost.innerHTML='<span class="canvas-badge">Runtime preview · paper-pop transition</span>';
    poseStage=await createStage(canvasHost);
    poseTheater=await createTheater(poseStage,{backdrop:new URL(ws.backdrop,project.baseUrl).href,floorY:.86,worldScale:1.5});
    poseStage.root.addChild(poseTheater.view);
    poseActor=await poseTheater.addPoseActor('preview',{id:actorId,baseUrl:actorBase.href,manifest:`${actorDef.manifest||'poses.json'}?studio=${Date.now()}`},{x:.5,scale:.9,widthShare:.38});
    await poseTheater.setSpritePose(poseActor,poseId,{instant:true});

    const poseEntries=Object.entries(poseManifest.poses);
    inspector.innerHTML=`<div class="panel-section"><h2>Pose Library</h2><p class="hint">Each semantic pose is a complete illustration. Story cues swap the image with the exact runtime paper-pop transition shown at left.</p><label>Actor<select data-actor>${optionList(Object.entries(actorPack.actors).map(([id,a])=>[id,a.label]),actorId)}</select></label><div class="pose-grid">${poseEntries.map(([id,def])=>`<button class="pose-card${id===poseId?' selected':''}" data-pose="${id}"><img src="${new URL(def.art,manifestUrl).href}" alt="${def.alt||id}"><span>${id}</span></button>`).join('')}</div></div><div class="panel-section"><h3>${poseId} pose</h3><label>Replace transparent pose image<input type="file" accept="image/png,image/webp" data-file></label><button data-upload>Normalize + replace pose</button><label>Accessible description<input data-alt value="${poseManifest.poses[poseId].alt||''}"></label><div class="field-grid"><label>Anchor X<input type="number" step="0.01" data-anchor-x value="${poseManifest.anchor?.[0]??.5}"></label><label>Anchor Y<input type="number" step="0.01" data-anchor-y value="${poseManifest.anchor?.[1]??.95}"></label></div><label>Paper-pop duration (ms)<input type="number" min="0" step="10" data-duration value="${poseManifest.transition?.durationMs||220}"></label><p class="hint">Images are normalized to a fixed 1024×1024 canvas and a shared baseline before saving.</p></div>`;
    inspector.querySelector('[data-actor]').onchange=(event)=>{actorId=event.target.value;poseId='neutral';load().catch(fail);};
    inspector.querySelectorAll('[data-pose]').forEach((button)=>button.onclick=async()=>{poseId=button.dataset.pose;params.set('pose',poseId);await poseTheater.setSpritePose(poseActor,poseId);drawPoseInspector().catch(fail);});
    inspector.querySelector('[data-upload]').onclick=async()=>{try{
      const file=inspector.querySelector('[data-file]').files[0];if(!file)throw new Error('Choose a transparent PNG or WebP first.');
      const blob=await normalizePose(file), artPath=`games/${project.id}/assets/pose-actors/${actorId}/poses/${poseId}.webp`;
      await uploadAsset(artPath,blob);poseManifest.poses[poseId].art=`poses/${poseId}.webp?v=${Date.now()}`;
      poseManifest.poses[poseId].alt=inspector.querySelector('[data-alt]').value;
      await savePoseManifest();toast(`${poseManifest.label} ${poseId} pose saved`,{kind:'success'});await load();
    }catch(error){fail(error);}};
  }
  async function drawPoseInspector(){await loadPoseLibrary(project.workspaces.build);}
  function syncPoseFields(){
    if(!poseManifest)return;
    poseManifest.poses[poseId].alt=inspector.querySelector('[data-alt]')?.value||poseManifest.poses[poseId].alt;
    poseManifest.anchor=[Number(inspector.querySelector('[data-anchor-x]')?.value??.5),Number(inspector.querySelector('[data-anchor-y]')?.value??.95)];
    poseManifest.transition={kind:'paper-pop',durationMs:Number(inspector.querySelector('[data-duration]')?.value||220)};
  }
  async function savePoseManifest(){syncPoseFields();await saveDocument(`games/${project.id}/assets/pose-actors/${actorId}/poses.json`,poseManifest);build=poseManifest;}
  async function load(){
    const ws=project.workspaces.build;
    if(ws.profile==='pose-library'){await loadPoseLibrary(ws);return;}
    host.querySelector('[data-profile]').textContent=ws.profile==='scene-actor'?'Flexible Scene Actor':'Canonical 10-part Puppet';
    if(ws.profile!=='scene-actor'){
      canvasHost.innerHTML=`<iframe class="build-legacy" src="../stage/puppet-studio.html?mode=build&embedded=1"></iframe>`;
      inspector.innerHTML=`<div class="panel-section"><h2>Canonical Puppet Builder</h2><p class="hint">The existing ten-part body and nine-viseme pipeline remains available unchanged for shared speaking puppets.</p></div>`;
      host.querySelector('[data-save]').hidden=true; return;
    }
    host.querySelector('[data-save]').hidden=false;
    const packUrl=new URL(ws.actorPack,project.baseUrl);actorPack=await fetch(packUrl,{cache:'no-store'}).then(r=>r.json());
    actorId=actorPack.actors[actorId]?actorId:Object.keys(actorPack.actors)[0];
    const actor=actorPack.actors[actorId], actorBase=new URL(actor.base,packUrl);
    build=await fetch(new URL('build.json',actorBase),{cache:'no-store'}).then(r=>r.json());
    params.set('project',project.id);params.set('char',actorId);
    const next=new URL(location.href);next.searchParams.set('project',project.id);next.searchParams.set('char',actorId);history.replaceState(null,'',next);
    const sourceUrl=new URL(build.source,actorBase).href;
    canvasHost.innerHTML=`<div class="flex-build-preview"><img data-source src="${sourceUrl}?v=${Date.now()}" alt="${build.label} separated source sheet"><canvas data-overlay></canvas></div>`;
    inspector.innerHTML=`<div class="panel-section"><h2>Flexible Scene Actor</h2><p class="hint">Ingest any alpha-separated part sheet, inspect detected islands, then fine-tune its arbitrary hierarchy and animation in Rig/Animate.</p><label>Actor<select data-actor>${optionList(Object.entries(actorPack.actors).map(([id,a])=>[id,a.label]),actorId)}</select></label><label>Replace transparent source PNG<input type="file" accept="image/png" data-file></label><button data-upload>Save source + labeled cuts</button><div class="row"><a class="button-link" href="?workspace=rig&project=${project.id}&char=${actorId}">Open Rig</a><a class="button-link" href="?workspace=animate&project=${project.id}&char=${actorId}">Open Animate</a></div></div><div class="panel-section"><h3>Detected build manifest</h3><p class="hint" data-qc>Analyzing alpha islands…</p><textarea data-json>${JSON.stringify(build,null,2)}</textarea></div>`;
    inspector.querySelector('[data-actor]').onchange=(event)=>{actorId=event.target.value;load().catch(fail);};
    inspector.querySelector('[data-upload]').onclick=async()=>{try{
      const file=inspector.querySelector('[data-file]').files[0];if(!file)throw new Error('Choose a transparent PNG first.');
      const nextBuild=JSON.parse(inspector.querySelector('[data-json]').value), entries=Object.entries(nextBuild.parts||{});
      if(!entries.length)throw new Error('Add at least one labeled part to the build manifest.');
      const image=await loadImage(file);await uploadAsset(`games/${project.id}/assets/source/actors/${actorId}-sheet-alpha.png`,file);
      for(const [partId,part] of entries){if(!part.box)throw new Error(`${partId} needs a source box.`);const blob=await cropPart(image,part.box);await uploadAsset(`games/${project.id}/assets/actors/${actorId}/parts/${partId}.png`,blob);part.size=[part.box[2]-part.box[0],part.box[3]-part.box[1]];}
      await saveDocument(`games/${project.id}/assets/actors/${actorId}/build.json`,nextBuild);build=nextBuild;
      toast(`Source and ${entries.length} labeled cuts saved`,{kind:'success'});await load();
    }catch(error){fail(error);}};
    const image=canvasHost.querySelector('[data-source]');image.onload=()=>{const boxes=alphaBoxes(image),overlay=canvasHost.querySelector('canvas');overlay.width=image.naturalWidth;overlay.height=image.naturalHeight;const ctx=overlay.getContext('2d');ctx.strokeStyle='#ffd91f';ctx.lineWidth=5;ctx.font='bold 26px sans-serif';ctx.fillStyle='#111';boxes.forEach((entry,index)=>{const [x,y,r,b]=entry.box;ctx.strokeRect(x,y,r-x,b-y);ctx.fillText(String(index+1),x+8,y+30);});inspector.querySelector('[data-qc]').textContent=`PASS · ${boxes.length} alpha-separated parts · source ${image.naturalWidth}×${image.naturalHeight}`;};
  }
  function fail(error){console.error(error);toast(error.message,{error:true,duration:7000});}
  host.querySelector('[data-project]').onchange=(event)=>{project=projects.find((item)=>item.id===event.target.value);actorId='dragon';params.set('project',project.id);params.delete('char');params.delete('pose');const next=new URL(location.href);next.searchParams.set('project',project.id);next.searchParams.delete('char');next.searchParams.delete('pose');history.replaceState(null,'',next);openWorkspace('build').catch(fail);};
  host.querySelector('[data-save]').onclick=async()=>{try{if(project.workspaces.build.profile==='pose-library'){await savePoseManifest();toast('Pose manifest saved',{kind:'success'});}else{build=JSON.parse(inspector.querySelector('[data-json]').value);await saveDocument(`games/${project.id}/assets/actors/${actorId}/build.json`,build);toast('Build manifest saved',{kind:'success'});}}catch(error){fail(error);}};
  await load();
  window.QLOBE_STUDIO_DEBUG={workspace:'build',getDocument:()=>build,getState:()=>({project:project.id,actor:actorId,profile:project.workspaces.build.profile})};
  return()=>{poseTheater?.destroy();poseStage?.destroy();if(window.QLOBE_STUDIO_DEBUG?.workspace==='build')delete window.QLOBE_STUDIO_DEBUG;};
}

export const __test={alphaBoxes,cropPart,normalizePose};
