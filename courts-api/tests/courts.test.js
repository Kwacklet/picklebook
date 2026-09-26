// Automated tests for the Courts API.
// A fake database (jest.fn) is used, so no real PostgreSQL is needed.
// Jenkins runs these with: docker build --target test ./courts-api
const request = require('supertest');
const { createApp } = require('../src/app');
const { validateCourt } = require('../src/validation');

function fakeDb(rows = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

describe('GET /health', () => {
  test('returns 200 when the database is reachable', async () => {
    const res = await request(createApp(fakeDb())).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'courts-api', db: 'up' });
  });

  test('returns 503 when the database is down', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const res = await request(createApp(db)).get('/api/courts/health');
    expect(res.status).toBe(503);
    expect(res.body.db).toBe('down');
  });
});

describe('GET /api/courts', () => {
  test('returns the list of courts', async () => {
    const courts = [{ id: 1, name: 'Court 1', surface: 'Indoor', hourly_rate: 500, is_active: true }];
    const res = await request(createApp(fakeDb(courts))).get('/api/courts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(courts);
  });

  test('filters active courts when ?active=true', async () => {
    const db = fakeDb([]);
    await request(createApp(db)).get('/api/courts?active=true');
    expect(db.query.mock.calls[0][0]).toMatch(/is_active = TRUE/);
  });
});

describe('GET /api/courts/:id', () => {
  test('returns 404 when the court does not exist', async () => {
    const res = await request(createApp(fakeDb([]))).get('/api/courts/99');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/courts', () => {
  test('creates a court and returns 201', async () => {
    const created = { id: 5, name: 'Court 5', surface: 'Outdoor', hourly_rate: 350, is_active: true };
    const db = fakeDb([created]);
    const res = await request(createApp(db))
      .post('/api/courts')
      .send({ name: '  Court 5 ', hourly_rate: 350 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(db.query.mock.calls[0][1]).toEqual(['Court 5', 'Outdoor', 350]);
  });

  test('rejects a missing name and negative rate with 400', async () => {
    const db = fakeDb();
    const res = await request(createApp(db)).post('/api/courts').send({ hourly_rate: -1 });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 409 for a duplicate court name', async () => {
    const err = Object.assign(new Error('duplicate'), { code: '23505' });
    const db = { query: jest.fn().mockRejectedValue(err) };
    const res = await request(createApp(db)).post('/api/courts').send({ name: 'Court 1', hourly_rate: 100 });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/courts/:id', () => {
  test('updates only the fields that were sent', async () => {
    const db = fakeDb([{ id: 2, hourly_rate: 450 }]);
    const res = await request(createApp(db)).put('/api/courts/2').send({ hourly_rate: 450 });
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual([null, null, 450, null, '2']);
  });

  test('returns 404 when the court does not exist', async () => {
    const res = await request(createApp(fakeDb([]))).put('/api/courts/99').send({ is_active: false });
    expect(res.status).toBe(404);
  });
});

describe('validateCourt()', () => {
  test('accepts a valid court', () => {
    expect(validateCourt({ name: 'Court 9', hourly_rate: 250 })).toEqual([]);
  });

  test('partial validation ignores fields that were not sent', () => {
    expect(validateCourt({ is_active: false }, { partial: true })).toEqual([]);
  });

  test('rejects a non-boolean is_active', () => {
    expect(validateCourt({ is_active: 'yes' }, { partial: true })).toContain('is_active must be true or false');
  });
});
