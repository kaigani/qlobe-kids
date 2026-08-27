import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/transport.js', import.meta.url), 'utf8');
const transport = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const { wrap, circularDistance, overlapsBlock, composerPosition, occurrencesBetween, createClock } = transport;
let count = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); count += 1; };

check(composerPosition(0, 16, 3).laneIndex, 0);
check(composerPosition(15.999, 16, 3).laneIndex, 0);
check(composerPosition(16, 16, 3).laneIndex, 1);
check(composerPosition(32, 16, 3).laneIndex, 2);
check(composerPosition(48, 16, 3).laneIndex, 0);
check(wrap(-1, 16), 15);
check(circularDistance(15, 1, 16), 2);

const base = { laneId: 'white', monsterId: 'm1', at: 15, createdAt: 1 };
check(overlapsBlock([base], { ...base, at: 1 }, { loopSeconds: 16, clipSeconds: 4 }), true);
check(overlapsBlock([base], { ...base, at: 3 }, { loopSeconds: 16, clipSeconds: 4 }), false);
check(overlapsBlock([base], { ...base, at: 3, monsterId: 'm2' }, { loopSeconds: 16, clipSeconds: 4 }), false);
check(overlapsBlock([base], { ...base, at: 15, laneId: 'yellow' }, { loopSeconds: 16, clipSeconds: 4 }), false);

const events = [{ ...base, at: 15 }, { ...base, at: 1, createdAt: 2 }];
check(occurrencesBetween(events, 14, 18, 16).map((x) => x.at), [15, 17]);

let ms = 1000;
const clock = createClock(() => ms);
check(clock.start(2), 2);
ms += 1500;
check(clock.elapsed(), 3.5);
check(clock.pause(), 3.5);
ms += 2000;
check(clock.elapsed(), 3.5);
check(clock.setSpeed(2), 2);
check(clock.resume(), 3.5);
ms += 500;
check(clock.elapsed(), 4.5);
check(clock.set(7), 7);
console.log(`transport tests: ${count} assertions passed`);
