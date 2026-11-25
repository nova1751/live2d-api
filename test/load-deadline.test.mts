import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDeadline, shareLoadClock, trackResponse } from '../src/runtime/request.ts';

test('only bytes from the active load extend its deadline, up to three minutes', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const active = new AbortController();
  const renderer = new AbortController();
  const stalled = new AbortController();
  const cancelActive = loadDeadline(active.signal, () => active.abort());
  const cancelStalled = loadDeadline(stalled.signal, () => stalled.abort());
  shareLoadClock(renderer.signal, active.signal);
  let stream;
  const response = new Response(new ReadableStream({ start(controller) { stream = controller; } }));
  const reader = trackResponse(response, renderer.signal).body.getReader();
  try {
    for (let seconds = 10; seconds < 180; seconds += 10) {
      t.mock.timers.tick(10_000);
      stream.enqueue(new Uint8Array([1]));
      await reader.read();
      assert.equal(active.signal.aborted, false);
      assert.equal(stalled.signal.aborted, seconds >= 15);
    }
    t.mock.timers.tick(10_000);
    assert.equal(active.signal.aborted, true);
  } finally {
    cancelActive();
    cancelStalled();
    await reader.cancel();
  }
});
