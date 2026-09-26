// API tests for the Reservations API using a fake database.
const request = require('supertest');
const { createApp } = require('../src/app');

// A fake db that returns the given results in order, one per query
function fakeDb(...results) {
  const query = jest.fn();
  results.forEach((r) => query.mockResolvedValueOnce(r));
  query.mockResolvedValue({ rows: [] });
  return { query };
}

const booking = {
  court_id: 2,
  customer_name: 'Maria Santos',
  contact: '09171234567',
  play_date: '2099-12-31',
  start_hour: 16,
  hours: 2,
};

describe('GET /health', () => {
  test('returns 200 when the database is reachable', async () => {
    const res = await request(createApp(fakeDb({ rows: [] }))).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('reservations-api');
  });
});

describe('POST /api/reservations', () => {
  test('creates a reservation with the computed total', async () => {
    const db = fakeDb(
      { rows: [{ id: 2, name: 'Court 2', hourly_rate: 400, is_active: true }] }, // court lookup
      { rows: [{ start_hour: 8, hours: 2 }] },                                  // existing bookings (no clash)
      { rows: [{ id: 10, ...booking, total: 880, status: 'pending' }] }         // insert
    );
    const res = await request(createApp(db)).post('/api/reservations').send(booking);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(880);
    expect(res.body.court_name).toBe('Court 2');
    // total passed to the INSERT is 400 (16:00) + 480 (17:00 peak)
    expect(db.query.mock.calls[2][1][6]).toBe(880);
  });

  test('returns 409 when the slot is already booked', async () => {
    const db = fakeDb(
      { rows: [{ id: 2, name: 'Court 2', hourly_rate: 400, is_active: true }] },
      { rows: [{ start_hour: 17, hours: 1 }] }
    );
    const res = await request(createApp(db)).post('/api/reservations').send(booking);
    expect(res.status).toBe(409);
    expect(db.query).toHaveBeenCalledTimes(2); // nothing was inserted
  });

  test('returns 404 when the court does not exist', async () => {
    const res = await request(createApp(fakeDb({ rows: [] }))).post('/api/reservations').send(booking);
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid input without touching the database', async () => {
    const db = fakeDb();
    const res = await request(createApp(db)).post('/api/reservations').send({ ...booking, hours: 0 });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/reservations/:id/status', () => {
  test('confirms a pending reservation', async () => {
    const db = fakeDb({ rows: [{ status: 'pending' }] }, { rows: [{ id: 1, status: 'confirmed' }] });
    const res = await request(createApp(db)).patch('/api/reservations/1/status').send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  test('rejects an invalid status change', async () => {
    const db = fakeDb({ rows: [{ status: 'cancelled' }] });
    const res = await request(createApp(db)).patch('/api/reservations/1/status').send({ status: 'confirmed' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reservations/summary', () => {
  test('counts statuses and sums revenue from confirmed and completed only', async () => {
    const db = fakeDb({
      rows: [
        { status: 'pending', count: 2, amount: 800 },
        { status: 'confirmed', count: 1, amount: 600 },
        { status: 'completed', count: 3, amount: 1500 },
        { status: 'cancelled', count: 1, amount: 300 },
      ],
    });
    const res = await request(createApp(db)).get('/api/reservations/summary');
    expect(res.body).toEqual({
      total_reservations: 7,
      by_status: { pending: 2, confirmed: 1, completed: 3, cancelled: 1 },
      revenue: 2100,
    });
  });
});
