import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorFingerprint } from './fingerprint';
import { extractSignals } from './signals';
import { CUSTOM_EVENT_TAGS, type RrwebEvent } from '@rrkit/shared';

test('errorFingerprint groups errors that differ only by numbers/positions', () => {
  const a = errorFingerprint('Cannot read property x of undefined at 42', 'Error\n  at foo (app.js:10:5)');
  const b = errorFingerprint('Cannot read property x of undefined at 99', 'Error\n  at foo (app.js:88:9)');
  assert.equal(a, b);
});

test('errorFingerprint distinguishes different messages', () => {
  assert.notEqual(errorFingerprint('TypeError: a'), errorFingerprint('RangeError: b'));
});

function custom(tag: string, payload: unknown, timestamp = 1000): RrwebEvent {
  return { type: 5, data: { tag, payload }, timestamp } as RrwebEvent;
}

test('extractSignals pulls errors, rage and dead clicks; ignores other events', () => {
  const events: RrwebEvent[] = [
    { type: 2, data: {}, timestamp: 1 } as RrwebEvent, // full snapshot, ignored
    custom(CUSTOM_EVENT_TAGS.error, { kind: 'error', message: 'Boom', stack: 'Error\n  at x (a.js:1:1)' }),
    custom(CUSTOM_EVENT_TAGS.rage, { x: 1, y: 2, count: 4, selector: 'button.buy' }),
    custom(CUSTOM_EVENT_TAGS.deadClick, { x: 3, y: 4, selector: 'div.hero' }),
    custom(CUSTOM_EVENT_TAGS.console, { level: 'log', args: ['hi'] }), // not a signal
  ];
  const signals = extractSignals(events);
  assert.equal(signals.length, 3);
  assert.equal(signals[0].kind, 'error');
  assert.ok(signals[0].fingerprint);
  assert.equal(signals[1].kind, 'rage');
  assert.equal(signals[1].fingerprint, null);
  assert.equal(signals[2].kind, 'deadclick');
});

test('extractSignals is empty for a batch with no custom events', () => {
  assert.deepEqual(extractSignals([{ type: 3, data: {}, timestamp: 1 } as RrwebEvent]), []);
});
