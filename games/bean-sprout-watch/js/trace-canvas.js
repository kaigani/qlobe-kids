/* Forgiving, normalized trace recognition and canvas renderer. */
const xy = p => Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y };
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const segDist = (p,a,b) => { const vx=b.x-a.x,vy=b.y-a.y, d=vx*vx+vy*vy; const t=d?Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/d)):0; return dist(p,{x:a.x+t*vx,y:a.y+t*vy}); };
let activeControllers=0;

export function traceCanvasStats(){return {activeControllers};}

export function resamplePath(points, spacing = .025) {
  const src = (points || []).map(xy).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (src.length < 2) return src;
  const out = [src[0]]; let carry = 0;
  for (let i=1;i<src.length;i++) { let a=src[i-1], b=src[i], d=dist(a,b); if (!d) continue;
    while (carry + d >= spacing) { const t=(spacing-carry)/d; a={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}; out.push(a); d=dist(a,b); carry=0; }
    carry += d;
  }
  if (dist(out[out.length-1],src[src.length-1]) > spacing*.35) out.push(src[src.length-1]);
  return out;
}

export function evaluateCoverage(paths, strokes, opts = {}) {
  const { radius=.06, minGesturePx=32, completion=.58, softCompletion=.45, softenAfterStrokes=3, width=1, height=1 } = opts;
  const meaningful = (strokes||[]).filter(s => (s||[]).length>1 && s.reduce((n,p,i,a)=>n+(i?dist(xy(a[i-1]),xy(p)):0),0)*Math.max(width,height) >= minGesturePx);
  const threshold = meaningful.length >= softenAfterStrokes ? softCompletion : completion;
  const details = (paths||[]).map(path => { const checkpoints=resamplePath(path), covered=checkpoints.filter(c => meaningful.some(s => s.some((p,i)=>i&&segDist(c,xy(s[i-1]),xy(p))<=radius))).length; const ratio=checkpoints.length?covered/checkpoints.length:1; return {coverage:ratio, complete:ratio>=threshold}; });
  return { complete: details.every(d=>d.complete), threshold, meaningfulStrokes: meaningful.length, targets: details, coverage: details.length ? details.reduce((n,d)=>n+d.coverage,0)/details.length : 1 };
}

export function createTraceCanvas(canvas, {paths=[], thresholds={}, brushUrl, onProgress, onComplete, reducedMotion=false} = {}) {
  const ctx=canvas?.getContext?.('2d'); let targetPaths=paths, strokes=[], active=null, done=false, destroyed=false, brush=null, animationFrame=0;
  activeControllers+=1;
  const opts=Object.assign({radius:.06,minGesturePx:32,completion:.58,softCompletion:.45,softenAfterStrokes:3,width:1,height:1},thresholds);
  function size(){ if(!canvas||!ctx)return; const r=canvas.getBoundingClientRect?.()||{width:canvas.width,height:canvas.height}; const d=globalThis.devicePixelRatio||1; canvas.width=Math.max(1,r.width*d);canvas.height=Math.max(1,r.height*d);canvas.style.width=r.width+'px';canvas.style.height=r.height+'px'; render(); }
  function render(){ if(!ctx||destroyed)return; ctx.clearRect(0,0,canvas.width,canvas.height); const w=canvas.width,h=canvas.height; ctx.save(); ctx.scale(w,h);
    for(const path of targetPaths){ctx.setLineDash([]);ctx.strokeStyle='rgba(255,249,218,.82)';ctx.lineWidth=.024;ctx.beginPath();path.forEach((p,i)=>{p=xy(p);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();ctx.setLineDash([.022,.015]);ctx.strokeStyle='rgba(42,91,53,.82)';ctx.lineWidth=.011;ctx.stroke();const p=xy(path[0]);const pulse=reducedMotion?1:(.78+.22*Math.sin(Date.now()/700));ctx.setLineDash([]);ctx.fillStyle=`rgba(72,150,82,${.78*pulse})`;ctx.beginPath();ctx.arc(p.x,p.y,.03,0,Math.PI*2);ctx.fill();}
    ctx.setLineDash([]); const all=active?[...strokes,active]:strokes; for(const s of all){ if(brush&&brush.complete&&brush.naturalWidth){ for(let i=0;i<s.length;i+=2){const p=s[i], q=s[Math.min(i+1,s.length-1)], ang=Math.atan2(q.y-p.y,q.x-p.x); ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ang);ctx.globalAlpha=.72;ctx.drawImage(brush,-.018,-.018,.036,.036);ctx.restore();} } else {ctx.beginPath(); s.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='rgba(63,139,81,.62)';ctx.lineWidth=.018;ctx.lineCap='round';ctx.stroke();} } ctx.restore(); }
  function evaluate(){ const e=evaluateCoverage(targetPaths,strokes,Object.assign({},opts,{width:canvas?.clientWidth||1,height:canvas?.clientHeight||1})); onProgress?.(e); if(e.complete&&!done){done=true;onComplete?.(e);} return e; }
  function ingest(points){ if(destroyed)return; const p=(points||[]).map(xy); if(p.length>1) strokes.push(p); render(); return evaluate(); }
  function pointerDown(e){if(active||e.isPrimary===false)return; active=[]; try{canvas.setPointerCapture?.(e.pointerId);}catch{} pointerMove(e);}
  function pointerMove(e){if(!active)return; const r=canvas.getBoundingClientRect(); active.push({x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}); render();}
  function pointerUp(){if(active){const p=active;active=null;ingest(p);}}
  const pointerCancel=()=>{active=null;render();}; const blurHandler=()=>{active=null;render();};
  canvas?.addEventListener('pointerdown',pointerDown); canvas?.addEventListener('pointermove',pointerMove); canvas?.addEventListener('pointerup',pointerUp); canvas?.addEventListener('pointercancel',pointerCancel); globalThis.addEventListener?.('blur',blurHandler);
  if(brushUrl&&typeof Image!=='undefined'){brush=new Image();brush.onload=()=>render();brush.src=brushUrl;}
  size();
  if(!reducedMotion&&typeof globalThis.requestAnimationFrame==='function'){const animate=()=>{if(destroyed)return;render();animationFrame=globalThis.requestAnimationFrame(animate);};animationFrame=globalThis.requestAnimationFrame(animate);}
  return {setPaths(p){targetPaths=p||[];strokes=[];done=false;render();evaluate();},clear(){strokes=[];done=false;render();evaluate();},snapshot(){return JSON.parse(JSON.stringify(strokes));},restore(s){strokes=JSON.parse(JSON.stringify(s||[]));render();return evaluate();},ingest,resize:size,destroy(){if(destroyed)return;destroyed=true;activeControllers=Math.max(0,activeControllers-1);if(animationFrame&&typeof globalThis.cancelAnimationFrame==='function')globalThis.cancelAnimationFrame(animationFrame);canvas?.removeEventListener('pointerdown',pointerDown);canvas?.removeEventListener('pointermove',pointerMove);canvas?.removeEventListener('pointerup',pointerUp);canvas?.removeEventListener('pointercancel',pointerCancel);globalThis.removeEventListener?.('blur',blurHandler);},getState(){return evaluate();},modelNextGap(){const e=evaluateCoverage(targetPaths,strokes,opts); return e.targets.map(t=>1-t.coverage);}};
}
