import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminHeaders,
  createTestApp,
  ingestHeaders,
  loginCookie,
  seedCompleteSetup,
  setS3ValidateResult,
  VALID_S3_CONFIG,
  type TestApp,
} from './harness';

let t: TestApp;

before(async () => {
  t = await createTestApp();
});

beforeEach(() => {
  setS3ValidateResult({ ok: true, detail: 'fake ok' });
});

async function freshApp(): Promise<TestApp> {
  t = await createTestApp();
  return t;
}

test('health is reachable before setup completes', async () => {
  await freshApp();
  const res = await t.app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, 'ok');
});

test('setup gate locks protected APIs with 423 until complete', async () => {
  await freshApp();
  const res = await t.app.inject({
    method: 'GET',
    url: '/api/config',
    headers: ingestHeaders('whatever'),
  });
  assert.equal(res.statusCode, 423);
  assert.equal(res.json().code, 'SETUP_REQUIRED');
});

test('status reports setup incomplete and unauthenticated initially', async () => {
  await freshApp();
  const res = await t.app.inject({ method: 'GET', url: '/api/status' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().setupComplete, false);
  assert.equal(res.json().authed, false);
});

test('full setup wizard: password → s3 → metadata → complete', async () => {
  await freshApp();

  // status starts all-false
  let status = (await t.app.inject({ method: 'GET', url: '/api/setup/status' })).json();
  assert.deepEqual(status, {
    complete: false,
    passwordSet: false,
    s3Verified: false,
    metadataSet: false,
  });

  // password too short → 400
  const shortPw = await t.app.inject({
    method: 'POST',
    url: '/api/setup/password',
    payload: { password: 'short' },
  });
  assert.equal(shortPw.statusCode, 400);

  // password set
  const pw = await t.app.inject({
    method: 'POST',
    url: '/api/setup/password',
    payload: { password: 'a-good-password' },
  });
  assert.equal(pw.statusCode, 200);

  // complete blocked before S3 verified
  const early = await t.app.inject({ method: 'POST', url: '/api/setup/complete' });
  assert.equal(early.statusCode, 400);

  // S3 verify fails → 400 propagated
  setS3ValidateResult({ ok: false, detail: 'bad creds' });
  const badS3 = await t.app.inject({
    method: 'POST',
    url: '/api/setup/s3',
    payload: VALID_S3_CONFIG,
  });
  assert.equal(badS3.statusCode, 400);
  assert.equal(badS3.json().ok, false);

  // S3 verify ok
  setS3ValidateResult({ ok: true, detail: 'connected' });
  const okS3 = await t.app.inject({
    method: 'POST',
    url: '/api/setup/s3',
    payload: VALID_S3_CONFIG,
  });
  assert.equal(okS3.statusCode, 200);
  assert.equal(okS3.json().ok, true);

  // metadata
  const meta = await t.app.inject({
    method: 'POST',
    url: '/api/setup/metadata',
    payload: { fields: [{ key: 'user_email', label: 'Email', type: 'email', filterable: true }] },
  });
  assert.equal(meta.statusCode, 200);

  // complete
  const done = await t.app.inject({ method: 'POST', url: '/api/setup/complete' });
  assert.equal(done.statusCode, 200);

  status = (await t.app.inject({ method: 'GET', url: '/api/setup/status' })).json();
  assert.equal(status.complete, true);

  // setup mutations now rejected with 409
  const again = await t.app.inject({
    method: 'POST',
    url: '/api/setup/password',
    payload: { password: 'another-password' },
  });
  assert.equal(again.statusCode, 409);

  // an ingest key was generated
  const cookie = await loginCookie(t.app, 'a-good-password');
  const integration = await t.app.inject({
    method: 'GET',
    url: '/api/settings/integration',
    headers: adminHeaders(cookie),
  });
  assert.equal(integration.statusCode, 200);
  assert.ok(integration.json().ingestKey.startsWith('rrk_ik_'));
});

test('setup/complete refuses duplicate metadata keys', async () => {
  await freshApp();
  await t.app.inject({
    method: 'POST',
    url: '/api/setup/metadata',
    payload: {
      fields: [
        { key: 'plan', label: 'Plan', type: 'string', filterable: true },
        { key: 'plan', label: 'Plan 2', type: 'string', filterable: false },
      ],
    },
  }).then((res) => {
    assert.equal(res.statusCode, 400);
  });
});

test('login: wrong password 401, correct password sets cookie, lockout after repeated failures', async () => {
  await freshApp();
  seedCompleteSetup(t, { password: 'correct-horse' });

  const wrong = await t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'nope' },
    remoteAddress: '10.0.0.99',
  });
  assert.equal(wrong.statusCode, 401);

  const ok = await t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'correct-horse' },
    remoteAddress: '10.0.0.100',
  });
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.cookies.find((c) => c.name === 'rrkit_token'));

  // 5 failures from one IP triggers lockout (429), even for a correct password.
  const lockIp = '10.0.0.123';
  for (let i = 0; i < 5; i++) {
    await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong' },
      remoteAddress: lockIp,
    });
  }
  const locked = await t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'correct-horse' },
    remoteAddress: lockIp,
  });
  assert.equal(locked.statusCode, 429);
});

test('change-password requires auth and the correct current password', async () => {
  await freshApp();
  seedCompleteSetup(t, { password: 'first-password' });
  const cookie = await loginCookie(t.app, 'first-password');

  // unauthenticated → 401
  const unauth = await t.app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    payload: { currentPassword: 'first-password', newPassword: 'second-password' },
  });
  assert.equal(unauth.statusCode, 401);

  // wrong current password → 401
  const wrongCurrent = await t.app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: adminHeaders(cookie),
    payload: { currentPassword: 'WRONG', newPassword: 'second-password' },
  });
  assert.equal(wrongCurrent.statusCode, 401);

  // correct → 200 and new password works
  const changed = await t.app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: adminHeaders(cookie),
    payload: { currentPassword: 'first-password', newPassword: 'second-password' },
  });
  assert.equal(changed.statusCode, 200);

  const relogin = await t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'second-password' },
    remoteAddress: '10.0.1.1',
  });
  assert.equal(relogin.statusCode, 200);
});
