import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GapQueue } from '../lib/queue.mjs';

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test('runs tasks one at a time, in order', async () => {
  const clock = fakeClock();
  const q = new GapQueue({ minGapMs: 0, now: clock.now, sleep: async () => {} });
  const order = [];
  const a = q.run(async () => {
    order.push('a-start');
    await Promise.resolve();
    order.push('a-end');
    return 'a';
  });
  const b = q.run(async () => {
    order.push('b-start');
    return 'b';
  });
  assert.deepEqual(await Promise.all([a, b]), ['a', 'b']);
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start']);
});

test('waits at least minGapMs between the start of each task', async () => {
  const clock = fakeClock();
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
    clock.advance(ms);
  };
  const q = new GapQueue({ minGapMs: 3000, now: clock.now, sleep });

  await q.run(async () => {});
  clock.advance(500); // only 500ms passed before the next one is queued
  await q.run(async () => {});

  assert.deepEqual(waits, [2500]); // needed 3000 total, 500 already passed
});

test('does not wait when the gap has already passed', async () => {
  const clock = fakeClock();
  const waits = [];
  const sleep = async (ms) => waits.push(ms);
  const q = new GapQueue({ minGapMs: 3000, now: clock.now, sleep });

  await q.run(async () => {});
  clock.advance(5000); // plenty of time passed
  await q.run(async () => {});

  assert.deepEqual(waits, []);
});

test('a task that throws does not jam the queue', async () => {
  const q = new GapQueue({ minGapMs: 0, sleep: async () => {} });
  await assert.rejects(
    q.run(async () => {
      throw new Error('boom');
    }),
  );
  assert.equal(await q.run(async () => 'ok'), 'ok');
});
