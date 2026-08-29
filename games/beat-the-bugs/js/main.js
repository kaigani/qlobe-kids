import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { tada } from '../../../shared/js/celebrate.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createConstrainedGestureDom } from '../../../shared/js/stage/constrained-gesture-dom.js';

const $ = (s) => document.querySelector(s);
const els = { play: $('.bb-play'), prompt: $('[data-prompt]'), board: $('[data-board]'), boardBtn: $('[data-target="board"]'), bugs: $('[data-bugs]'), tool: $('[data-target="tool"]'), toolImg: $('[data-tool]'), tokens: $('[data-tokens]'), steps: $('[data-steps]'), ring: $('[data-ring]'), feedback: $('[data-feedback]'), floss: $('[data-floss]'), rewardTitle: $('[data-reward-title]') };
const A = config.assets;
const state = { screen:'splash', mode:null, phase:0, zone:null, activeSeconds:0, coverage:0, bubbles:0, stars:0, soapPumps:0, flossGaps:[], badges:{suds:false,smile:false}, seed:42, muted:false, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches };
const timers = createTimers(); let gesture, nudger, lastPoint, lastMoveAt, flossPointer = null, missionRun = 0;
const steps = { suds:['wet','soap','palms','backs','between','nails','rinse'], smile:['paste','fronts','tops','insides','tongue','floss','two-by-two'] };
const art = { suds:{wet:'wet',soap:'soap',palms:'palms',backs:'backs',between:'between',nails:'nails',rinse:'clean'}, smile:{paste:'paste',fronts:'fronts',tops:'tops',insides:'insides',tongue:'tongue',floss:'floss','two-by-two':'clean'} };
const narrator = createNarrator({ say:(key, text) => voiceClips.say(key, text) });
function imageFor(mode, phase) { return A[mode === 'suds' ? 'hands' : 'teeth'][art[mode][phase]]; }
function toolFor(mode, phase) { if (phase === 'two-by-two') return A.ui.twoByTwo; if (['wet','soap','rinse','paste'].includes(phase)) return A.tools[phase]; if (phase === 'floss') return A.tools.floss; return A.tools[mode === 'suds' ? 'scrub' : 'brush']; }
function say(key) { return bgm.duckDuring(narrator.say(key, config.voice[key])); }
function setImg(el, path) { if (el) { el.src = path || ''; el.onerror = () => el.removeAttribute('src'); } }
function refreshSplashBackground() { setImg($('.bb-splash .bb-bg'), matchMedia('(orientation: portrait)').matches ? A.backgrounds.splashPortrait : A.backgrounds.splash); }
function wireArt() { document.querySelectorAll('[data-bg]:not([data-bg="splash"]):not([data-bg="reward"])').forEach((el) => setImg(el, A.backgrounds[el.dataset.bg === 'play' ? 'suds' : el.dataset.bg])); document.querySelectorAll('[data-asset]').forEach((el)=> { const k=el.dataset.asset; setImg(el,k==='title'?A.title:k==='maya'?A.maya:k==='mission-suds'?A.missions.suds:A.missions.smile); }); document.querySelectorAll('[data-finale-accent]').forEach((el)=>setImg(el,A.ui[el.dataset.finaleAccent])); refreshSplashBackground(); }
wireArt();
function handleLayoutChange() { refreshSplashBackground(); gesture?.cancel('layout-change'); flossPointer=null; lastPoint=null; lastMoveAt=null; }
window.addEventListener('resize', handleLayoutChange, { passive:true });
window.addEventListener('orientationchange', handleLayoutChange, { passive:true });
const screens = createScreens({
  root:$('#game'),
  voice:narrator,
  onExit(name) {
    if (name !== 'play') return;
    missionRun++;
    timers.clearAll();
    gesture?.cancel('screen-exit');
    flossPointer = null;
    nudger?.stop();
  },
  onEnter(name, prev){ state.screen=name; if(name==='splash') { bgm.stop(); if(prev!==null) say(state.badges.suds||state.badges.smile?'again':'welcome'); } },
});
function currentStep() { return steps[state.mode]?.[state.phase]; }
function activeGesture() { return ['palms','backs','between','nails','fronts','tops','insides','tongue'].includes(currentStep()); }
function coverageTarget() { return state.mode === 'suds' ? 5 : 4; }
function defeatedBugCount(phaseIndex = state.phase) { return [2,4,5,7].filter((threshold) => phaseIndex >= threshold).length; }
function renderBugs() {
  const paths = state.mode === 'suds' ? A.bugs.germs : A.bugs.sugar;
  const defeated = defeatedBugCount();
  if (els.bugs.dataset.mode !== state.mode || els.bugs.children.length !== paths.length) {
    els.bugs.dataset.mode = state.mode;
    els.bugs.replaceChildren(...paths.map((path) => {
      const bug = document.createElement('img');
      bug.className = 'bb-bug'; bug.src = path; bug.alt = ''; bug.draggable = false;
      return bug;
    }));
  }
  [...els.bugs.children].forEach((bug, index) => bug.classList.toggle('is-defeated', index < defeated));
}
function render() {
  const phase = currentStep(); if (!state.mode || !phase) return;
  setImg($('.bb-play .bb-bg'), A.backgrounds[state.mode]); setImg(els.board, imageFor(state.mode, phase)); setImg(els.toolImg, toolFor(state.mode, phase));
  setImg(els.ring, A.ui.ring);
  setImg(els.feedback, state.mode==='suds'?A.ui.foam:A.ui.sparkle);
  els.prompt.textContent = config.voice[phase] || ''; els.play.classList.toggle('is-gesture', activeGesture());
  els.steps.replaceChildren(...steps[state.mode].map((x,i)=> { const n=document.createElement('span'); n.className=`bb-step ${i<state.phase?'is-done':''} ${i===state.phase?'is-current':''}`; n.style.backgroundImage=`url(${imageFor(state.mode,x)})`; return n; }));
  const total = state.mode === 'suds' ? 20 : 16; const filled = state.mode === 'suds' ? state.bubbles : state.stars;
  els.tokens.replaceChildren(...Array.from({length:total},(_,i)=> { const n=document.createElement('span'); n.className=`bb-token ${i<filled?'is-filled':''}`; n.style.backgroundImage=`url(${state.mode==='suds'?A.ui.bubble:A.ui.star})`; return n; }));
  renderBugs(); els.floss.hidden = phase !== 'floss'; if (phase === 'floss') renderFloss();
  resetNudge();
}
function renderFloss() { els.floss.replaceChildren(...[0,1,2].map((i)=> { const b=document.createElement('button'); b.className=`bb-floss-gap ${state.flossGaps.includes(i)?'is-done':''}`; b.dataset.target=`floss-${i}`; b.dataset.gap=i; b.setAttribute('aria-label','Floss tooth gap'); b.style.backgroundImage=`url(${A.ui.ring})`; b.addEventListener('pointerdown',(e)=>{ flossPointer=e.pointerId; acceptFloss(i); }); b.addEventListener('click',()=>acceptFloss(i)); return b; })); }
function resetNudge() { nudger?.arm(); }
function showFeedback() { setImg(els.feedback, state.mode==='suds'?A.ui.foam:A.ui.sparkle); els.feedback.classList.remove('is-visible'); requestAnimationFrame(()=>els.feedback.classList.add('is-visible')); timers.after(460,()=>els.feedback.classList.remove('is-visible')); }
async function startMode(mode) { if (!steps[mode] || screens.current==='play') return false; return screens.start(()=>{ const run=++missionRun; state.mode=mode; state.phase=0; state.zone=currentStep(); state.coverage=0; state.activeSeconds=0; state.bubbles=0; state.stars=0; state.soapPumps=0; state.flossGaps=[]; screens.show('play'); bgm.play(config.music,{key:'beat-the-bugs',fadeInMs:350}); render(); const introPhase=state.phase; say(`${mode}-intro`).then(()=>{ if(run===missionRun&&state.screen==='play'&&state.mode===mode&&state.phase===introPhase) say(currentStep()); }); return true; },{busy:false}); }
function queueNextStep(run=missionRun, phase=state.phase) { timers.after(250,()=>{ if(run===missionRun&&state.screen==='play'&&state.phase===phase) nextStep(); }); }
function nextStep() { const defeatedBefore=defeatedBugCount(); state.phase++; state.zone=currentStep() || null; state.coverage=0; state.activeSeconds=state.mode==='suds'?state.bubbles:state.stars; if (state.phase >= steps[state.mode].length) return reward(); render(); if(defeatedBugCount()>defeatedBefore) { const run=missionRun, promptMode=state.mode, promptPhase=state.phase; say('praise-bug').then(()=>{ if(run===missionRun&&state.screen==='play'&&state.mode===promptMode&&state.phase===promptPhase) say(currentStep()); }); } else say(currentStep()); }
function discrete() { const phase=currentStep(); if (phase==='soap') { state.soapPumps++; showFeedback(); if(state.soapPumps<2) { say('soap'); return; } } if (phase==='paste' && state.phase===0) showFeedback(); if (phase==='rinse') showFeedback(); if (['wet','soap','rinse','paste','two-by-two'].includes(phase)) nextStep(); else wiggle(); }
function wiggle() { els.tool.classList.remove('is-wiggle'); requestAnimationFrame(()=>els.tool.classList.add('is-wiggle')); }
function addCoverage(amount=1) { if (!activeGesture()) return false; const target=coverageTarget(); const remaining = target - state.coverage; const amountSafe=Math.max(0,Math.min(remaining,Number(amount)||0)); if (!amountSafe) return false; const beforeCoverage=state.coverage; const beforeWhole=Math.floor(state.activeSeconds); state.coverage+=amountSafe; state.activeSeconds+=amountSafe; if(state.mode==='suds') state.bubbles=Math.min(20,Math.floor(state.activeSeconds)); else state.stars=Math.min(16,Math.floor(state.activeSeconds)); const wholeChanged=Math.floor(state.activeSeconds)>beforeWhole; if(wholeChanged){showFeedback();render();} if (state.coverage >= target) { const run=missionRun, phase=state.phase; if(state.mode==='suds' && state.bubbles===20) say('twenty').then(()=>{ if(run===missionRun&&state.screen==='play'&&state.phase===phase) queueNextStep(run,phase); }); else queueNextStep(run,phase); } else if (Math.floor(state.coverage)>=2 && Math.floor(beforeCoverage)<2) say(state.mode==='suds'?'keep-scrubbing':'keep-brushing'); return true; }
function acceptFloss(i) { if(currentStep()!=='floss'||state.flossGaps.includes(i)) return false; state.flossGaps.push(i); showFeedback(); renderFloss(); if(state.flossGaps.length===3) queueNextStep(); return true; }
function rasterCelebrate(host, mode='both') { if(state.reducedMotion||!host) return; const paths=mode==='suds'?[A.ui.bubble,A.ui.foam,A.ui.sparkle]:mode==='smile'?[A.ui.star,A.ui.sparkle]:[A.ui.bubble,A.ui.star,A.ui.sparkle]; const layer=document.createElement('div'); layer.className='bb-raster-celebration'; for(let i=0;i<18;i++){const bit=document.createElement('img');bit.src=paths[i%paths.length];bit.alt='';bit.style.setProperty('--x',`${4+(i*37)%92}%`);bit.style.setProperty('--delay',`${(i%6)*70}ms`);bit.style.setProperty('--fall',`${1500+(i%4)*180}ms`);bit.style.setProperty('--drift',`${(i%2?-1:1)*(18+(i%5)*9)}px`);layer.append(bit);}host.append(layer);setTimeout(()=>layer.remove(),2500); }
function reward() { nudger?.stop(); const mode=state.mode; state.badges[mode]=true; els.bugs.replaceChildren(); els.rewardTitle.textContent=mode==='suds'?'Suds Shield Complete!':'Smile Shield Complete!'; setImg($('.bb-reward .bb-bg'), A.backgrounds[mode]); setImg($('[data-reward-board]'), A[mode==='suds'?'hands':'teeth'].clean); setImg($('[data-badge]'), mode==='suds'?A.ui.sudsBadge:A.ui.smileBadge); screens.show('reward'); tada({confetti:false}); rasterCelebrate($('.bb-reward'),mode); say(mode==='suds'?'suds-cheer':'smile-cheer'); }
function choose() { if(state.badges.suds&&state.badges.smile) { setImg($('.bb-finale .bb-bg'),A.backgrounds.finale); setImg($('[data-final-badge="suds"]'),A.ui.sudsBadge); setImg($('[data-final-badge="smile"]'),A.ui.smileBadge); screens.show('finale'); tada({confetti:false}); rasterCelebrate($('.bb-finale')); say('finale'); } else screens.show('splash'); }
function boardPoint(e) { const r=els.boardBtn.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}; }
gesture = createConstrainedGestureDom({ canStart:()=>activeGesture(), getHandle:()=> 'tool', project:(p)=>p, onStart:(_,e)=>{lastPoint=boardPoint(e);lastMoveAt=performance.now();}, onProgress:(_,e)=>{const p=boardPoint(e); if(p.x<0||p.x>1||p.y<0||p.y>1){gesture.cancel('outside-board');lastPoint=null;lastMoveAt=null;return;} const now=performance.now(); const d=Math.hypot((p.x-lastPoint.x)*500,(p.y-lastPoint.y)*500); const elapsed=(now-lastMoveAt)/1000; if(d>7&&elapsed>.09){ addCoverage(Math.min(.25,elapsed));lastMoveAt=now; } lastPoint=p;} });
els.boardBtn.addEventListener('pointerdown',(e)=>gesture.begin(e,'tool'));
els.boardBtn.addEventListener('keydown',(e)=>{ if(activeGesture()&&(e.key==='Enter'||e.key===' ')){e.preventDefault();addCoverage(1);} });
els.tool.addEventListener('click',discrete);
window.addEventListener('pointermove',(e)=>{ if(e.pointerId!==flossPointer||currentStep()!=='floss') return; const gap=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-gap]'); if(gap) acceptFloss(Number(gap.dataset.gap)); },{passive:true});
for (const type of ['pointerup','pointercancel']) window.addEventListener(type,(e)=>{if(e.pointerId===flossPointer) flossPointer=null;},{passive:true});
document.querySelectorAll('[data-mode]').forEach((b)=>b.addEventListener('click',()=>startMode(b.dataset.mode)));
document.addEventListener('click',(e)=>{ const t=e.target.closest('[data-target]')?.dataset.target; if(t==='back'){nudger?.stop();screens.show('splash');} if(t==='sound'&&state.mode) say(currentStep()); if(t==='again') startMode(state.mode); if(t==='choose') choose(); });
document.addEventListener('visibilitychange',()=>{if(document.hidden) gesture.cancel('hidden');}); window.addEventListener('blur',()=>gesture.cancel('blur'));
nudger=createNudger({first:9000,repeat:7500,onNudge:(n)=>{ els.play.classList.add('is-gesture'); say('nudge'); if(n>1) showFeedback(); }});
function setMuted(on=true) { const muted=Boolean(on); state.muted=muted; voiceClips.setMuted(muted); bgm.setMuted(muted); if(muted) narrator.stop?.(); document.querySelectorAll('audio,video').forEach((node)=>{node.muted=muted;}); return muted; }
async function debugWinRound() { let guard=0; while(state.screen==='play'&&guard++<80){const p=currentStep();if(activeGesture())addCoverage(coverageTarget());else if(p==='floss')[0,1,2].forEach(acceptFloss);else if(p==='soap'){discrete();discrete();}else discrete();await new Promise((resolve)=>setTimeout(resolve,Math.max(1,timers.ms(450))));}if(state.screen==='play')throw new Error('debug winRound did not converge');return state.screen; }
const flattenAssets = (value) => Array.isArray(value) ? value.flatMap(flattenAssets) : value && typeof value === 'object' ? Object.values(value).flatMap(flattenAssets) : typeof value === 'string' ? [value] : [];
const assetUrls=flattenAssets(A);
const ready=Promise.all([voiceClips.init(config.audio.manifest,config.audio.lines,config.voice),preloadImages(assetUrls),bgm.preload(config.music)]).catch(()=>undefined);
installUnlockOnGesture({extra:[bgm.unlock]}); installKioskGuards();
installDebug({gameId:config.id,engine:'custom-hygiene',ready,listModes:()=>[{id:'suds',title:'Suds Shield'},{id:'smile',title:'Smile Shield'}],startMode:async(id)=>startMode(id),getState:()=>JSON.parse(JSON.stringify(state)),tap:async(id)=>{if(id==='suds'||id==='smile')return startMode(id);if(id==='tool')return discrete();if(id.startsWith('floss-'))return acceptFloss(+id.split('-')[1]);return document.querySelector(`[data-target="${id}"]`)?.click();},stroke:(zone,amount)=>{if(zone===state.zone)return addCoverage(amount);return false;},completeStep:()=>{const p=currentStep();if(activeGesture())return addCoverage(coverageTarget());if(p==='floss')return [0,1,2].forEach(acceptFloss);if(p==='soap'){discrete();return discrete();}return discrete();},winRound:debugWinRound,home:()=>screens.show('splash'),mute:setMuted,getAudioLog:()=>voiceClips.getAudioLog(),clearAudioLog:()=>voiceClips.clearAudioLog(),musicStats:()=>bgm.stats(),timers,narrator,voice:voiceClips,onSeed:(_,seed)=>{state.seed=seed;}});
