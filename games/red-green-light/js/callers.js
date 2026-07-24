// callers.js — the video-puppet caller roster. Each caller has a poster
// (select-screen tile + video poster frame), three cue videos (green/red/
// yellow) with the caller's voice baked in, and two spoken lines (greet on
// select, cheer at the end). Only `ready` callers appear on the select screen;
// the rest are produced in later batches. Paths are relative + lowercase for
// GitHub Pages. Keep the accent close to the character's dominant color.
const dir = (id) => `./assets/callers/${id}`;

const ROSTER = [
  { id: 'growlie', name: 'Growlie', accent: '#3a9bd6', ready: true },
  { id: 'twinkle', name: 'Twinkle', accent: '#e85aa8', ready: true },
  { id: 'bolt',    name: 'Bolt',    accent: '#2bb8d6', ready: true },
  { id: 'gilly',   name: 'Gilly',   accent: '#1f9e8a', ready: true },
  { id: 'ember',   name: 'Ember',   accent: '#f0742a', ready: true },
  { id: 'pip',     name: 'Pip',     accent: '#8b5cf6', ready: true },
  { id: 'zoom',    name: 'Zoom',    accent: '#3b7dd8', ready: true },
  { id: 'luna',    name: 'Luna',    accent: '#5b53c4', ready: true },
];

export const CALLERS = ROSTER.map((c) => ({
  ...c,
  poster: `${dir(c.id)}/poster.jpg`,
  video: {
    green:  `${dir(c.id)}/green.mp4`,
    red:    `${dir(c.id)}/red.mp4`,
    yellow: `${dir(c.id)}/yellow.mp4`,
    idle:   `${dir(c.id)}/idle.mp4`,
  },
  audio: {
    greet: `${dir(c.id)}/greet.m4a`,
    cheer: `${dir(c.id)}/cheer.m4a`,
  },
}));

export const READY_CALLERS = CALLERS.filter((c) => c.ready);
