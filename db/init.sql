-- PickleBook database schema + seed data.
-- PostgreSQL runs this file ONLY the first time the container starts with an
-- empty data volume (pg-data). After that, the data in the volume is kept.

CREATE TABLE IF NOT EXISTS courts (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(80)   NOT NULL UNIQUE,
    surface      VARCHAR(40)   NOT NULL DEFAULT 'Outdoor',
    hourly_rate  NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
    is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
    id             SERIAL PRIMARY KEY,
    court_id       INT           NOT NULL REFERENCES courts(id),
    customer_name  VARCHAR(100)  NOT NULL,
    contact        VARCHAR(50)   NOT NULL,
    play_date      DATE          NOT NULL,
    start_hour     SMALLINT      NOT NULL CHECK (start_hour BETWEEN 6 AND 22),
    hours          SMALLINT      NOT NULL CHECK (hours BETWEEN 1 AND 4),
    total          NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    status         VARCHAR(20)   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CHECK (start_hour + hours <= 23)
);

CREATE INDEX IF NOT EXISTS idx_reservations_court_date ON reservations (court_id, play_date);

INSERT INTO courts (name, surface, hourly_rate) VALUES
    ('Court 1 - Championship', 'Indoor',  500.00),
    ('Court 2',                'Indoor',  400.00),
    ('Court 3',                'Outdoor', 300.00),
    ('Court 4',                'Outdoor', 300.00)
ON CONFLICT (name) DO NOTHING;
