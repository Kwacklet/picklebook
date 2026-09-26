// Courts API: manages the list of pickleball courts and their hourly rates.
// createApp() receives the database as a parameter so tests can pass a fake one.
const express = require('express');
const { validateCourt } = require('./validation');

function createApp(db) {
  const app = express();
  app.use(express.json());

  // Health check: used by Docker HEALTHCHECK and the Jenkins smoke test.
  // Returns 503 if the database cannot be reached.
  app.get(['/health', '/api/courts/health'], async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', service: 'courts-api', db: 'up' });
    } catch (err) {
      res.status(503).json({ status: 'error', service: 'courts-api', db: 'down' });
    }
  });

  // GET /api/courts            -> all courts
  // GET /api/courts?active=true -> only active courts
  app.get('/api/courts', async (req, res, next) => {
    try {
      const onlyActive = req.query.active === 'true';
      const sql = onlyActive
        ? 'SELECT * FROM courts WHERE is_active = TRUE ORDER BY id'
        : 'SELECT * FROM courts ORDER BY id';
      const result = await db.query(sql);
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/courts/:id
  app.get('/api/courts/:id(\\d+)', async (req, res, next) => {
    try {
      const result = await db.query('SELECT * FROM courts WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Court not found' });
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/courts  { name, surface?, hourly_rate }
  app.post('/api/courts', async (req, res, next) => {
    const errors = validateCourt(req.body);
    if (errors.length) return res.status(400).json({ errors });
    try {
      const { name, surface = 'Outdoor', hourly_rate } = req.body;
      const result = await db.query(
        'INSERT INTO courts (name, surface, hourly_rate) VALUES ($1, $2, $3) RETURNING *',
        [name.trim(), surface.trim(), Number(hourly_rate)]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/courts/:id  { name?, surface?, hourly_rate?, is_active? }  (only sent fields change)
  app.put('/api/courts/:id(\\d+)', async (req, res, next) => {
    const errors = validateCourt(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ errors });
    try {
      const { name, surface, hourly_rate, is_active } = req.body;
      const result = await db.query(
        `UPDATE courts SET
           name        = COALESCE($1, name),
           surface     = COALESCE($2, surface),
           hourly_rate = COALESCE($3, hourly_rate),
           is_active   = COALESCE($4, is_active)
         WHERE id = $5 RETURNING *`,
        [
          name !== undefined ? name.trim() : null,
          surface !== undefined ? surface.trim() : null,
          hourly_rate !== undefined ? Number(hourly_rate) : null,
          is_active !== undefined ? is_active : null,
          req.params.id,
        ]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Court not found' });
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // Error handler: duplicate court name -> 409, everything else -> 500
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.code === '23505') return res.status(409).json({ error: 'A court with that name already exists' });
    console.error('[courts-api]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
