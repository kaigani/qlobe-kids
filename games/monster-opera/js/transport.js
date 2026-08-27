export function wrap(value, length) {
  if (!Number.isFinite(value) || !Number.isFinite(length) || length <= 0) return 0;
  return ((value % length) + length) % length;
}

export function circularDistance(a, b, length) {
  const diff = Math.abs(wrap(a, length) - wrap(b, length));
  return Math.min(diff, length - diff);
}

export function overlapsBlock(events, candidate, { loopSeconds, clipSeconds }) {
  return events.some((event) => (
    event.laneId === candidate.laneId
    && event.monsterId === candidate.monsterId
    && circularDistance(event.at, candidate.at, loopSeconds) < clipSeconds
  ));
}

export function composerPosition(elapsed, laneSeconds, laneCount) {
  const safeElapsed = Math.max(0, Number(elapsed) || 0);
  const cycle = laneSeconds * laneCount;
  const inCycle = wrap(safeElapsed, cycle);
  return {
    laneIndex: Math.floor(inCycle / laneSeconds) % laneCount,
    phase: wrap(inCycle, laneSeconds),
    cycle: Math.floor(safeElapsed / cycle),
  };
}

export function occurrencesBetween(events, from, to, loopSeconds) {
  if (!events.length || to < from) return [];
  const firstLoop = Math.floor((from - loopSeconds) / loopSeconds);
  const lastLoop = Math.floor((to + loopSeconds) / loopSeconds);
  const found = [];
  for (let loop = firstLoop; loop <= lastLoop; loop += 1) {
    for (const event of events) {
      const at = loop * loopSeconds + wrap(event.at, loopSeconds);
      if (at >= from && at <= to) found.push({ event, loop, at });
    }
  }
  return found.sort((a, b) => a.at - b.at || a.event.createdAt - b.event.createdAt);
}

export function createClock(now = () => performance.now()) {
  let baseSeconds = 0;
  let startedAt = now();
  let speed = 1;
  let running = false;

  function value() {
    if (!running) return baseSeconds;
    return baseSeconds + Math.max(0, now() - startedAt) * speed / 1000;
  }

  return {
    get running() { return running; },
    get speed() { return speed; },
    elapsed: value,
    start(at = baseSeconds) {
      baseSeconds = Math.max(0, Number(at) || 0);
      startedAt = now();
      running = true;
      return baseSeconds;
    },
    pause() {
      if (running) baseSeconds = value();
      running = false;
      return baseSeconds;
    },
    resume() {
      if (!running) {
        startedAt = now();
        running = true;
      }
      return baseSeconds;
    },
    set(at = 0) {
      baseSeconds = Math.max(0, Number(at) || 0);
      startedAt = now();
      return baseSeconds;
    },
    setSpeed(next = 1) {
      baseSeconds = value();
      startedAt = now();
      speed = Math.max(0.05, Math.min(50, Number(next) || 1));
      return speed;
    },
  };
}
