import { onTap } from '../../../shared/js/tap.js';

const round = (value) => Math.round(value * 100) / 100;

function asNumber(value) {
  const match = String(value ?? '').match(/(?:stone-)?(\d+)$/);
  return match ? Number(match[1]) : NaN;
}

/**
 * Render and run one five-stone tableau at a time. The authored sprites are the
 * visible game; the buttons only provide layout, focus, and forgiving input.
 */
export function createTrailBoard({
  host,
  route,
  onAdvance,
  onWrong,
  onComplete,
  reducedMotion = false,
  timers = null,
} = {}) {
  if (!host) throw new Error('createTrailBoard: host is required');
  if (!route?.segments?.length) throw new Error('createTrailBoard: route segments are required');

  const assets = route.assets || {};
  const timing = route.timing || {};
  const tapDisposers = [];
  const localTimers = new Set();
  const acceptedNumbers = [];

  let destroyed = false;
  let segmentIndex = -1;
  let segment = null;
  let expected = null;
  let completedInSegment = 0;
  let phase = 'idle';
  let busy = false;
  let inputLocked = false;
  let generation = 0;
  let wrongAttempts = 0;
  let lastWrong = null;
  let fox = null;
  let pennantNumber = null;
  let segmentReadout = null;
  let stoneButtons = [];

  function scaledMs(ms) {
    if (reducedMotion) return Math.min(40, Number(ms) || 0);
    return timers?.ms ? timers.ms(ms) : Math.max(0, Number(ms) || 0);
  }

  function wait(ms) {
    if (timers?.wait) return timers.wait(reducedMotion ? Math.min(40, ms) : ms);
    return new Promise((resolve) => {
      const id = window.setTimeout(() => {
        localTimers.delete(id);
        resolve();
      }, reducedMotion ? Math.min(40, ms) : ms);
      localTimers.add(id);
    });
  }

  function after(ms, fn) {
    if (timers?.after) return timers.after(reducedMotion ? Math.min(40, ms) : ms, fn);
    const id = window.setTimeout(() => {
      localTimers.delete(id);
      fn();
    }, reducedMotion ? Math.min(40, ms) : ms);
    localTimers.add(id);
    return id;
  }

  function clearMarkup() {
    tapDisposers.splice(0).forEach((dispose) => dispose());
    host.replaceChildren();
    stoneButtons = [];
    fox = null;
    pennantNumber = null;
    segmentReadout = null;
  }

  function setPosition(node, point) {
    node.style.left = `${point.x}%`;
    node.style.top = `${point.y}%`;
  }

  function makeProgress() {
    const progress = document.createElement('div');
    progress.className = 'trail-progress';
    progress.setAttribute('aria-hidden', 'true');

    const pennant = document.createElement('div');
    pennant.className = 'count-pennant';
    const art = document.createElement('img');
    art.src = assets.pennant;
    art.alt = '';
    art.draggable = false;
    pennantNumber = document.createElement('strong');
    pennantNumber.className = 'count-pennant-number';
    pennantNumber.textContent = String(segment.start);
    pennant.append(art, pennantNumber);

    segmentReadout = document.createElement('span');
    segmentReadout.className = 'segment-readout';
    segmentReadout.textContent = route.segments.length > 1
      ? `${segmentIndex + 1} of ${route.segments.length}`
      : segment.label;

    progress.append(pennant, segmentReadout);
    host.append(progress);
  }

  function makeFinishFlag() {
    if (segmentIndex !== route.segments.length - 1) return;
    const flag = document.createElement('img');
    flag.className = 'trail-finish-flag';
    flag.src = assets.finishFlag;
    flag.alt = '';
    flag.draggable = false;
    host.append(flag);
  }

  function makeFox() {
    fox = document.createElement('img');
    fox.className = 'trail-fox';
    fox.src = assets.foxIdle;
    fox.alt = '';
    fox.draggable = false;
    fox.style.setProperty('--hop-ms', `${scaledMs(timing.hopMs || 520)}ms`);
    setPosition(fox, segment.foxStart || { x: 4, y: 73 });
    host.append(fox);
  }

  function makeStone(point, offset) {
    const number = segment.start + offset;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trail-stone';
    button.dataset.target = `stone-${number}`;
    button.dataset.number = String(number);
    button.dataset.role = offset === 0 ? 'expected' : 'wrong';
    button.setAttribute('aria-label', `Stepping stone ${number}`);
    button.style.left = `${point.x}%`;
    button.style.top = `${point.y}%`;
    button.style.setProperty('--stone-turn', `${Number(point.rotation) || 0}deg`);

    const activeMat = document.createElement('img');
    activeMat.className = 'stone-active-mat';
    activeMat.src = assets.activeMat;
    activeMat.alt = '';
    activeMat.draggable = false;

    const art = document.createElement('img');
    art.className = 'stone-art';
    art.src = assets.stone;
    art.alt = '';
    art.draggable = false;

    const label = document.createElement('span');
    label.className = 'stone-number';
    label.textContent = String(number);

    const star = document.createElement('img');
    star.className = 'stone-earned-star';
    star.src = assets.star;
    star.alt = '';
    star.draggable = false;

    button.append(activeMat, art, label, star);
    tapDisposers.push(onTap(button, () => tapStone(number), {
      feedback: (event) => {
        event.preventDefault();
        button.classList.add('is-pressed');
        after(150, () => button.classList.remove('is-pressed'));
      },
    }));
    stoneButtons.push(button);
    host.append(button);
  }

  function updateStoneStates() {
    for (const button of stoneButtons) {
      const number = Number(button.dataset.number);
      const visited = acceptedNumbers.includes(number);
      const active = phase === 'active' && number === expected;
      button.classList.toggle('is-visited', visited);
      button.classList.toggle('is-active', active);
      button.dataset.role = visited ? 'done' : active ? 'expected' : 'wrong';
      button.setAttribute('aria-current', active ? 'step' : 'false');
    }
  }

  function renderSegment() {
    clearMarkup();
    host.classList.toggle('is-reduced-motion', reducedMotion);
    host.dataset.segment = String(segmentIndex + 1);
    host.setAttribute('aria-label', `${route.title}, ${segment.label}, stones ${segment.start} through ${segment.start + 4}`);
    makeProgress();
    makeFinishFlag();
    makeFox();
    segment.stones.forEach(makeStone);
    updateStoneStates();
  }

  function startSegment(index = 0, { locked = false } = {}) {
    if (destroyed) return { accepted: false, reason: 'destroyed' };
    const next = route.segments[index];
    if (!next) return { accepted: false, reason: 'unknown-segment' };
    generation += 1;
    segmentIndex = index;
    segment = next;
    expected = segment.start;
    completedInSegment = 0;
    phase = 'active';
    busy = false;
    inputLocked = Boolean(locked);
    lastWrong = null;
    renderSegment();
    return { accepted: true, generation, state: getState() };
  }

  function unlockSegment(expectedGeneration = generation) {
    if (destroyed) return { accepted: false, reason: 'destroyed' };
    if (expectedGeneration !== generation) {
      return { accepted: false, reason: 'stale-generation', generation, state: getState() };
    }
    if (phase !== 'active') return { accepted: false, reason: phase, state: getState() };
    inputLocked = false;
    return { accepted: true, generation, state: getState() };
  }

  async function hopFox(point) {
    if (!fox || destroyed) return;
    fox.style.setProperty('--hop-ms', `${scaledMs(timing.hopMs || 520)}ms`);
    fox.src = assets.foxHop;
    fox.classList.remove('is-hopping');
    void fox.offsetWidth;
    fox.classList.add('is-hopping');
    setPosition(fox, point);
    await wait(timing.hopMs || 520);
    if (!fox || destroyed) return;
    fox.src = assets.foxIdle;
    fox.classList.remove('is-hopping');
  }

  function nudge() {
    if (destroyed || phase !== 'active' || busy || inputLocked) return false;
    const active = stoneButtons.find((button) => Number(button.dataset.number) === expected);
    if (!active) return false;
    active.classList.remove('is-nudging');
    void active.offsetWidth;
    active.classList.add('is-nudging');
    after(timing.wrongMs || 620, () => active.classList.remove('is-nudging'));
    return true;
  }

  async function reject(number) {
    wrongAttempts += 1;
    lastWrong = Number.isFinite(number) ? number : null;
    const wrong = stoneButtons.find((button) => Number(button.dataset.number) === number);
    if (wrong) {
      wrong.classList.remove('is-wrong');
      void wrong.offsetWidth;
      wrong.classList.add('is-wrong');
      after(timing.wrongMs || 620, () => wrong.classList.remove('is-wrong'));
    }
    nudge();
    if (typeof onWrong === 'function') {
      await Promise.resolve(onWrong({ number, expected, segmentIndex, routeId: route.id }));
    }
    return { accepted: false, reason: 'out-of-order', expected, state: getState() };
  }

  async function tapStone(idOrNumber) {
    const number = asNumber(idOrNumber);
    const tapGeneration = generation;
    if (destroyed) return { accepted: false, reason: 'destroyed' };
    if (phase !== 'active') return { accepted: false, reason: phase };
    if (inputLocked) return { accepted: false, reason: 'transition', expected, state: getState() };
    if (busy) return { accepted: false, reason: 'busy', expected, state: getState() };
    if (!Number.isFinite(number) || number !== expected) return reject(number);

    const localOffset = number - segment.start;
    const point = segment.stones[localOffset];
    if (!point) return reject(number);

    busy = true;
    acceptedNumbers.push(number);
    completedInSegment += 1;
    expected = completedInSegment < segment.stones.length ? number + 1 : null;
    if (pennantNumber) pennantNumber.textContent = String(number);
    updateStoneStates();

    const advance = typeof onAdvance === 'function'
      ? Promise.resolve(onAdvance({
        number,
        expected,
        segmentIndex,
        segmentDone: completedInSegment === segment.stones.length,
        totalAccepted: acceptedNumbers.length,
        routeId: route.id,
      }))
      : Promise.resolve();

    await Promise.all([hopFox(point), advance]);
    if (destroyed) return { accepted: true, number, state: getState() };

    if (completedInSegment === segment.stones.length) {
      phase = 'segment-complete';
      updateStoneStates();
      if (typeof onComplete === 'function') {
        await Promise.resolve(onComplete({
          segmentIndex,
          routeDone: segmentIndex === route.segments.length - 1,
          totalAccepted: acceptedNumbers.length,
          routeId: route.id,
        }));
      }
    }
    // onComplete may have rendered the next five-stone tableau while this
    // earlier tap was awaiting its transition narration. Never let that stale
    // completion clear the newer generation's lock or in-flight tap.
    if (tapGeneration === generation) busy = false;
    return { accepted: true, number, state: getState() };
  }

  function getTargets() {
    return stoneButtons
      .filter((button) => button.getClientRects().length)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          id: button.dataset.target,
          role: button.dataset.role,
          rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
        };
      });
  }

  function getState() {
    return {
      routeId: route.id,
      segmentIndex,
      segmentsTotal: route.segments.length,
      segmentId: segment?.id || null,
      phase,
      busy: busy || inputLocked,
      inputLocked,
      generation,
      expected,
      completedInSegment,
      totalAccepted: acceptedNumbers.length,
      accepted: acceptedNumbers.slice(),
      wrongAttempts,
      lastWrong,
      reducedMotion,
    };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    phase = 'destroyed';
    inputLocked = true;
    tapDisposers.splice(0).forEach((dispose) => dispose());
    for (const id of localTimers) window.clearTimeout(id);
    localTimers.clear();
    host.replaceChildren();
    stoneButtons = [];
    fox = null;
  }

  return { startSegment, unlockSegment, tapStone, nudge, getState, getTargets, destroy };
}
