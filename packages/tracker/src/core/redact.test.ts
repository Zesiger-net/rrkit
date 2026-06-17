import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scrubText,
  compileMatchers,
  matchesAny,
  redactHeaders,
  redactBody,
  truncateBody,
  contentTypeAllowed,
} from './redact';

test('scrubText redacts emails', () => {
  assert.equal(scrubText('contact jane@acme.com now'), 'contact [redacted-email] now');
});

test('scrubText redacts SSNs and card-like numbers', () => {
  assert.equal(scrubText('ssn 123-45-6789'), 'ssn [redacted-ssn]');
  assert.match(scrubText('card 4111 1111 1111 1111'), /\[redacted-number\]/);
});

test('scrubText leaves ordinary text untouched', () => {
  assert.equal(scrubText('just a normal sentence with 42 apples'), 'just a normal sentence with 42 apples');
});

test('compileMatchers skips invalid regexes', () => {
  const m = compileMatchers(['^/api', '(((', '']);
  assert.equal(m.length, 1);
  assert.ok(matchesAny('/api/users', m));
  assert.equal(matchesAny('/web', m), false);
});

test('matchesAny is false for empty matcher list', () => {
  assert.equal(matchesAny('/anything', []), false);
});

test('redactHeaders redacts denied names case-insensitively', () => {
  const out = redactHeaders(
    { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    ['authorization'],
  );
  assert.equal(out.Authorization, '[redacted]');
  assert.equal(out['Content-Type'], 'application/json');
});

test('redactBody redacts JSON keys recursively', () => {
  const out = redactBody(JSON.stringify({ password: 'hunter2', nested: { token: 'abc' }, keep: 1 }), [
    'password',
    'token',
  ]);
  const parsed = JSON.parse(out);
  assert.equal(parsed.password, '[redacted]');
  assert.equal(parsed.nested.token, '[redacted]');
  assert.equal(parsed.keep, 1);
});

test('redactBody redacts form-urlencoded fields', () => {
  const out = redactBody('user=jane&password=hunter2&keep=1', ['password']);
  assert.equal(out, 'user=jane&password=[redacted]&keep=1');
});

test('redactBody is a no-op with no keys', () => {
  assert.equal(redactBody('{"password":"x"}', []), '{"password":"x"}');
});

test('truncateBody caps at maxBytes', () => {
  assert.deepEqual(truncateBody('hello', 0), { value: 'hello', truncated: false });
  assert.deepEqual(truncateBody('hello world', 5), { value: 'hello', truncated: true });
  assert.deepEqual(truncateBody('hi', 5), { value: 'hi', truncated: false });
});

test('contentTypeAllowed matches prefixes; empty allowlist allows all', () => {
  assert.equal(contentTypeAllowed('application/json; charset=utf-8', ['application/json']), true);
  assert.equal(contentTypeAllowed('image/png', ['application/json', 'text/']), false);
  assert.equal(contentTypeAllowed('anything', []), true);
});
