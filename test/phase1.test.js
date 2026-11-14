process.env.JWT_SECRET = 'test-secret-key-for-phase1';
process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SENSOR_API_KEY = 'test-sensor-api-key';
process.env.NODE_ENV = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replSet;
let app;
let token;
let horseId;
let alertId;
let memberId;
let memberPassword;

const auth = (value = token) => ({ Authorization: `Bearer ${value}` });

describe('Phase 1 API', { concurrency: false }, () => {
  before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    app = require('../src/index');
  });

  after(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  it('reports database health', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.db, 'connected');
  });

  it('rejects an incomplete signup', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      name: 'A',
      email: 'not-an-email',
      password: 'short',
    });
    assert.equal(res.status, 422);
  });

  it('creates a barn and owner', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      name: 'Ada Owner',
      email: 'ada@example.com',
      password: 'password123',
      barnName: 'North Barn',
      timezone: 'America/New_York',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'all_access');
    assert.equal(res.body.barn.name, 'North Barn');
    assert.ok(res.body.token);
    token = res.body.token;
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      name: 'Ada Owner',
      email: 'ada@example.com',
      password: 'password123',
    });
    assert.equal(res.status, 409);
  });

  it('rejects a bad password and then logs in', async () => {
    const bad = await request(app).post('/api/v1/auth/login').send({
      email: 'ada@example.com',
      password: 'wrong-password',
    });
    assert.equal(bad.status, 401);

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'ada@example.com',
      password: 'password123',
    });
    assert.equal(res.status, 200);
    token = res.body.token;
  });

  it('returns the current user', async () => {
    const missing = await request(app).get('/api/v1/me');
    assert.equal(missing.status, 401);

    const res = await request(app).get('/api/v1/me').set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'ada@example.com');
    assert.equal(res.body.user.role, 'all_access');
    assert.equal(res.body.barn.name, 'North Barn');
  });

  it('creates, edits, moves, and archives a horse', async () => {
    const created = await request(app).post('/api/v1/horses').set(auth()).send({
      name: 'Star',
      stall: '12',
      aisle: 'B',
      age: 8,
      discipline: 'jumper',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.horse.sensorId, 'SV-0012');
    horseId = created.body.horse._id;

    const other = await request(app).post('/api/v1/auth/signup').send({
      name: 'Bea Owner',
      email: 'bea@example.com',
      password: 'password123',
      barnName: 'South Barn',
    });
    assert.equal(other.status, 201);
    const peek = await request(app).get(`/api/v1/horses/${horseId}`).set(auth(other.body.token));
    assert.equal(peek.status, 403);

    const listed = await request(app).get('/api/v1/horses').set(auth());
    assert.equal(listed.status, 200);
    assert.equal(listed.body.horses.length, 1);

    const patched = await request(app).patch(`/api/v1/horses/${horseId}`).set(auth()).send({
      name: 'Starlight',
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.horse.name, 'Starlight');

    const moved = await request(app).post(`/api/v1/horses/${horseId}/move`).set(auth()).send({
      stall: '4',
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.horse.stall, '4');
    assert.equal(moved.body.horse.sensorId, 'SV-0004');

    const archived = await request(app)
      .post(`/api/v1/horses/${horseId}/archive`)
      .set(auth())
      .send({ archived: true });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.horse.archived, true);

    const onlyArchived = await request(app).get('/api/v1/horses?archived=true').set(auth());
    assert.equal(onlyArchived.body.horses.length, 1);

    const restored = await request(app)
      .post(`/api/v1/horses/${horseId}/archive`)
      .set(auth())
      .send({ archived: false });
    assert.equal(restored.body.horse.archived, false);
  });

  it('records water sensor readings and returns latest/history to authorized users', async () => {
    const recordedAt = '2026-11-05T10:00:00.000Z';
    const denied = await request(app)
      .post('/api/v1/sensor/readings')
      .set('x-sensor-api-key', 'wrong-key')
      .send({ horseId, waterConsumedLiters: 2 });
    assert.equal(denied.status, 401);

    const invalid = await request(app)
      .post('/api/v1/sensor/readings')
      .set('x-sensor-api-key', 'test-sensor-api-key')
      .send({ horseId, waterConsumedLiters: -1 });
    assert.equal(invalid.status, 422);

    const first = await request(app)
      .post('/api/v1/sensor/readings')
      .set('x-sensor-api-key', 'test-sensor-api-key')
      .send({ horseId, waterConsumedLiters: 2.5, recordedAt });
    assert.equal(first.status, 201);
    assert.equal(first.body.reading.waterConsumedLiters, 2.5);
    assert.equal(first.body.reading.horseId, horseId);

    const second = await request(app)
      .post('/api/v1/sensor/readings')
      .set('x-sensor-api-key', 'test-sensor-api-key')
      .send({ horseId, waterConsumedLiters: 1.25, recordedAt: '2026-11-05T11:00:00.000Z' });
    assert.equal(second.status, 201);

    const unauthenticated = await request(app).get(`/api/v1/horses/${horseId}/sensor-readings`);
    assert.equal(unauthenticated.status, 401);

    const readings = await request(app)
      .get(`/api/v1/horses/${horseId}/sensor-readings?limit=10`)
      .set(auth());
    assert.equal(readings.status, 200);
    assert.equal(readings.body.readings.length, 2);
    assert.equal(readings.body.readings[0].waterConsumedLiters, 1.25);

    const latest = await request(app)
      .get(`/api/v1/horses/${horseId}/sensor-readings/latest`)
      .set(auth());
    assert.equal(latest.status, 200);
    assert.equal(latest.body.reading.waterConsumedLiters, 1.25);
  });

  it('records notes, care, and an exportable report on the profile', async () => {
    const note = await request(app)
      .post(`/api/v1/horses/${horseId}/log-notes`)
      .set(auth())
      .send({ text: 'Ate well this morning' });
    assert.equal(note.status, 201);
    assert.equal(note.body.note.author, 'Ada Owner');

    const notes = await request(app).get(`/api/v1/horses/${horseId}/log-notes`).set(auth());
    assert.equal(notes.body.notes.length, 1);

    const care = await request(app)
      .post(`/api/v1/horses/${horseId}/care-entries`)
      .set(auth())
      .send({
        category: 'food',
        item: 'Hay',
        amount: '2 flakes',
        notes: 'soaked',
        at: new Date().toISOString(),
      });
    assert.equal(care.status, 201);

    const entries = await request(app).get(`/api/v1/horses/${horseId}/care-entries`).set(auth());
    assert.equal(entries.body.entries.length, 1);

    const report = await request(app).get(`/api/v1/horses/${horseId}/care-report`).set(auth());
    assert.equal(report.status, 200);
    assert.equal(report.body.totalEntries, 1);
    assert.equal(report.body.byCategory.food.length, 1);

    const csv = await request(app)
      .get(`/api/v1/horses/${horseId}/care-report?format=csv`)
      .set(auth());
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.text, /Hay/);

    const profile = await request(app).get(`/api/v1/horses/${horseId}`).set(auth());
    assert.equal(profile.status, 200);
    assert.equal(profile.body.horse.name, 'Starlight');
    assert.equal(profile.body.summary.noteCount, 1);
    assert.equal(profile.body.summary.careEntryCount, 1);
    assert.equal(profile.body.summary.openAlertCount, 0);
  });

  it('reads and updates barn settings', async () => {
    const updated = await request(app).patch('/api/v1/settings').set(auth()).send({
      checkSensitivity: 'more',
      notifyOffline: false,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.settings.checkSensitivity, 'more');
    assert.equal(updated.body.settings.notifyOffline, false);

    const read = await request(app).get('/api/v1/settings').set(auth());
    assert.equal(read.body.settings.name, 'North Barn');
    assert.equal(read.body.settings.checkSensitivity, 'more');
  });

  it('sells a plan only after the payment webhook confirms it', async () => {
    const current = await request(app).get('/api/v1/subscription').set(auth());
    assert.equal(current.status, 200);
    assert.equal(current.body.subscription.status, 'none');

    const checkout = await request(app).post('/api/v1/subscription/checkout').set(auth()).send({
      plan: 'monthly',
      cardLast4: '4242',
    });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.checkout.status, 'pending');
    const checkoutId = checkout.body.checkout.checkoutId;

    const denied = await request(app).post('/api/v1/webhooks/payment').send({
      checkoutId,
      event: 'payment.succeeded',
    });
    assert.equal(denied.status, 401);

    const paid = await request(app)
      .post('/api/v1/webhooks/payment')
      .set('x-webhook-secret', 'test-webhook-secret')
      .send({ checkoutId, event: 'payment.succeeded' });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.subscription.status, 'active');
    assert.equal(paid.body.subscription.plan, 'monthly');
    assert.equal(paid.body.subscription.cardLast4, '4242');
    assert.ok(paid.body.subscription.renewsAt);

    const again = await request(app)
      .post('/api/v1/webhooks/payment')
      .set('x-webhook-secret', 'test-webhook-secret')
      .send({ checkoutId, event: 'payment.succeeded' });
    assert.equal(again.status, 200);
    assert.equal(again.body.subscription.status, 'active');
  });

  it('creates, acknowledges, and resolves a manual alert', async () => {
    const created = await request(app).post('/api/v1/alerts').set(auth()).send({
      horseId,
      severity: 'urgent',
      kind: 'noDrink',
      message: 'No drink since last night',
    });
    assert.equal(created.status, 201);
    alertId = created.body.alert._id;

    const list = await request(app).get('/api/v1/alerts?state=open').set(auth());
    assert.equal(list.body.alerts.length, 1);

    const missingAction = await request(app)
      .post(`/api/v1/alerts/${alertId}/resolve`)
      .set(auth())
      .send({});
    assert.equal(missingAction.status, 422);

    const ack = await request(app).post(`/api/v1/alerts/${alertId}/acknowledge`).set(auth());
    assert.equal(ack.status, 200);
    assert.equal(ack.body.alert.state, 'acknowledged');
    assert.equal(ack.body.alert.acknowledgedBy, 'Ada Owner');

    const resolved = await request(app)
      .post(`/api/v1/alerts/${alertId}/resolve`)
      .set(auth())
      .send({ action: 'manualWaterOffered', note: 'Offered a bucket' });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.alert.state, 'resolved');
    assert.equal(resolved.body.alert.resolutionAction, 'manualWaterOffered');

    const profile = await request(app).get(`/api/v1/horses/${horseId}`).set(auth());
    assert.equal(profile.body.summary.openAlertCount, 0);
  });

  it('invites a member and limits view-only access', async () => {
    const second = await request(app).post('/api/v1/horses').set(auth()).send({
      name: 'Comet',
      stall: '9',
    });
    const hiddenId = second.body.horse._id;

    const invite = await request(app).post('/api/v1/users/invite').set(auth()).send({
      name: 'Sam Staff',
      email: 'sam@example.com',
      role: 'view_only',
      allowedHorseIds: [horseId],
    });
    assert.equal(invite.status, 201);
    memberId = invite.body.user._id;
    memberPassword = invite.body.temporaryPassword;
    assert.ok(memberPassword);
    assert.notEqual(memberPassword, 'welcome123');

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'sam@example.com',
      password: memberPassword,
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.status, 'active');
    const sam = login.body.token;

    const horses = await request(app).get('/api/v1/horses').set(auth(sam));
    assert.equal(horses.body.horses.length, 1);
    assert.equal(horses.body.horses[0].name, 'Starlight');

    const deniedHorse = await request(app).get(`/api/v1/horses/${hiddenId}`).set(auth(sam));
    assert.equal(deniedHorse.status, 403);

    const deniedCreate = await request(app).post('/api/v1/horses').set(auth(sam)).send({
      name: 'Nope',
      stall: '1',
    });
    assert.equal(deniedCreate.status, 403);

    const deniedAlert = await request(app).post('/api/v1/alerts').set(auth(sam)).send({
      horseId,
      severity: 'check',
      kind: 'lowWaterCheck',
      message: 'low',
    });
    assert.equal(deniedAlert.status, 403);

    const role = await request(app).patch(`/api/v1/users/${memberId}`).set(auth()).send({
      role: 'basic_access',
    });
    assert.equal(role.status, 200);
    assert.equal(role.body.user.role, 'basic_access');
  });

  it('protects the owner and removes a member', async () => {
    const me = await request(app).get('/api/v1/me').set(auth());
    const ownerId = me.body.user._id;

    const demote = await request(app).patch(`/api/v1/users/${ownerId}`).set(auth()).send({
      role: 'view_only',
    });
    assert.equal(demote.status, 400);

    const removeOwner = await request(app).delete(`/api/v1/users/${ownerId}`).set(auth());
    assert.equal(removeOwner.status, 400);

    const removed = await request(app).delete(`/api/v1/users/${memberId}`).set(auth());
    assert.equal(removed.status, 200);

    const users = await request(app).get('/api/v1/users').set(auth());
    assert.equal(users.body.users.length, 1);
  });

  it('resets a password with a one-time code', async () => {
    const session = await request(app).post('/api/v1/auth/login').send({
      email: 'ada@example.com',
      password: 'password123',
    });
    assert.equal(session.status, 200);
    const previousToken = session.body.token;

    const missing = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'nobody@example.com',
    });
    assert.equal(missing.status, 200);
    assert.equal(missing.body.otp, undefined);

    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'ada@example.com',
    });
    assert.equal(forgot.status, 200);
    assert.match(forgot.body.otp, /^\d{6}$/);

    const wrong = await request(app).post('/api/v1/auth/verify-otp').send({
      email: 'ada@example.com',
      otp: '000000',
    });
    assert.equal(wrong.status, 401);

    const verified = await request(app).post('/api/v1/auth/verify-otp').send({
      email: 'ada@example.com',
      otp: forgot.body.otp,
    });
    assert.equal(verified.status, 200);
    assert.ok(verified.body.resetToken);

    const reusedCode = await request(app).post('/api/v1/auth/verify-otp').send({
      email: 'ada@example.com',
      otp: forgot.body.otp,
    });
    assert.equal(reusedCode.status, 401);

    const samePassword = await request(app).post('/api/v1/auth/reset-password').send({
      resetToken: verified.body.resetToken,
      password: 'password123',
    });
    assert.equal(samePassword.status, 422);

    const reset = await request(app).post('/api/v1/auth/reset-password').send({
      resetToken: verified.body.resetToken,
      password: 'NewPassword123',
    });
    assert.equal(reset.status, 200);

    const spent = await request(app).post('/api/v1/auth/reset-password').send({
      resetToken: verified.body.resetToken,
      password: 'AnotherPassword123',
    });
    assert.equal(spent.status, 401);

    const oldPassword = await request(app).post('/api/v1/auth/login').send({
      email: 'ada@example.com',
      password: 'password123',
    });
    assert.equal(oldPassword.status, 401);

    const stale = await request(app).get('/api/v1/me').set(auth(previousToken));
    assert.equal(stale.status, 401);

    const fresh = await request(app).post('/api/v1/auth/login').send({
      email: 'ada@example.com',
      password: 'NewPassword123',
    });
    assert.equal(fresh.status, 200);
    token = fresh.body.token;
  });

  it('revokes the token on logout', async () => {
    const out = await request(app).post('/api/v1/auth/logout').set(auth());
    assert.equal(out.status, 200);

    const me = await request(app).get('/api/v1/me').set(auth());
    assert.equal(me.status, 401);
    assert.equal(me.body.message, 'Token has been revoked');
  });
});
