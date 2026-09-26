// Reservations API: books courts, prevents double booking, computes the price,
// and moves reservations through their statuses.
const express = require('express');
const { computeTotal, overlaps, canTransition, validateReservation, isValidDateString } = require('./rules');

const STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];

const SELECT_WITH_COURT = `
  SELECT r.id, r.court_id, c.name AS court_name, r.customer_name, r.contact,
         r.play_date, r.start_hour, r.hours, r.total, r.status, r.created_at
  FROM reservations r
  JOIN courts c ON c.id = r.court_id`;

function createApp(db) {
  const app = express();
  app.use(express.json());

  // Health check for Docker HEALTHCHECK and the Jenkins smoke test
  app.get(['/health', '/api/reservations/health'], async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', service: 'reservations-api', db: 'up' });
    } catch (err) {
      res.status(503).json({ status: 'error', service: 'reservations-api', db: 'down' });
    }
  });

  // GET /api/reservations?date=YYYY-MM-DD&status=pending
  app.get('/api/reservations', async (req, res, next) => {
    const { date, status } = req.query;
    if (date !== undefined && !isValidDateString(date)) return res.status(400).json({ error: 'Invalid date' });
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
      const conditions = [];
      const params = [];
      if (date) { params.push(date); conditions.push(`r.play_date = $${params.length}`); }
      if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const result = await db.query(`${SELECT_WITH_COURT}${where} ORDER BY r.play_date DESC, r.start_hour, r.id`, params);
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/reservations/summary -> counts per status and revenue (confirmed + completed)
  app.get('/api/reservations/summary', async (req, res, next) => {
    try {
      const result = await db.query('SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS amount FROM reservations GROUP BY status');
      const byStatus = { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
      let revenue = 0;
      let totalReservations = 0;
      for (const row of result.rows) {
        byStatus[row.status] = row.count;
        totalReservations += row.count;
        if (row.status === 'confirmed' || row.status === 'completed') revenue += Number(row.amount);
      }
      res.json({ total_reservations: totalReservations, by_status: byStatus, revenue: Math.round(revenue * 100) / 100 });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/reservations/:id
  app.get('/api/reservations/:id(\\d+)', async (req, res, next) => {
    try {
      const result = await db.query(`${SELECT_WITH_COURT} WHERE r.id = $1`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Reservation not found' });
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/reservations { court_id, customer_name, contact, play_date, start_hour, hours }
  app.post('/api/reservations', async (req, res, next) => {
    const errors = validateReservation(req.body);
    if (errors.length) return res.status(400).json({ errors });

    const { court_id, customer_name, contact, play_date, start_hour, hours } = req.body;
    try {
      // 1. The court must exist and be active
      const courtResult = await db.query('SELECT id, name, hourly_rate, is_active FROM courts WHERE id = $1', [court_id]);
      const court = courtResult.rows[0];
      if (!court) return res.status(404).json({ error: 'Court not found' });
      if (!court.is_active) return res.status(400).json({ error: 'Court is not available for booking' });

      // 2. No overlapping pending/confirmed booking on the same court and date
      const existing = await db.query(
        `SELECT start_hour, hours FROM reservations
         WHERE court_id = $1 AND play_date = $2 AND status IN ('pending', 'confirmed')`,
        [court_id, play_date]
      );
      const clash = existing.rows.find((r) => overlaps(start_hour, hours, r.start_hour, r.hours));
      if (clash) {
        return res.status(409).json({
          error: `Court is already booked from ${clash.start_hour}:00 to ${clash.start_hour + clash.hours}:00 on that date`,
        });
      }

      // 3. Compute the price (peak hours cost more) and save
      const total = computeTotal(Number(court.hourly_rate), start_hour, hours);
      const insert = await db.query(
        `INSERT INTO reservations (court_id, customer_name, contact, play_date, start_hour, hours, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [court_id, customer_name.trim(), contact.trim(), play_date, start_hour, hours, total]
      );
      res.status(201).json({ ...insert.rows[0], court_name: court.name });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/reservations/:id/status { status }
  app.patch('/api/reservations/:id(\\d+)/status', async (req, res, next) => {
    const next_status = req.body && req.body.status;
    if (!STATUSES.includes(next_status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    try {
      const current = await db.query('SELECT status FROM reservations WHERE id = $1', [req.params.id]);
      if (current.rows.length === 0) return res.status(404).json({ error: 'Reservation not found' });
      const from = current.rows[0].status;
      if (!canTransition(from, next_status)) {
        return res.status(400).json({ error: `Cannot change status from ${from} to ${next_status}` });
      }
      const updated = await db.query('UPDATE reservations SET status = $1 WHERE id = $2 RETURNING *', [next_status, req.params.id]);
      res.json(updated.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    console.error('[reservations-api]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
