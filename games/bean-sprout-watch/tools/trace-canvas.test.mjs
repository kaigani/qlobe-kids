import assert from 'node:assert/strict';
import {resamplePath,evaluateCoverage} from '../js/trace-canvas.js';
const line=[[0,0],[1,0]];
let e=evaluateCoverage([line],[line],{radius:.08,minGesturePx:1,width:100,height:100}); assert.equal(e.complete,true); assert(e.targets[0].coverage>.9);
e=evaluateCoverage([line],[[[0,0],[.1,0]],[[.2,0],[.3,0]],[[.4,0],[.5,0]]],{radius:.08,minGesturePx:1,completion:.58,softCompletion:.45,width:100,height:100}); assert.equal(e.threshold,.45); assert.equal(e.complete,true);
e=evaluateCoverage([line],[[[.5,0]]],{radius:.08,minGesturePx:32,width:100,height:100}); assert.equal(e.meaningfulStrokes,0); assert.equal(e.complete,false);
e=evaluateCoverage([line,[[0,0],[0,1]]],[line],{radius:.08,minGesturePx:1}); assert.equal(e.complete,false);
const a=resamplePath(line,.1), b=resamplePath(line,.1); assert.deepEqual(a,b);
console.log('trace-canvas tests passed');
