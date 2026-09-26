// Unit tests for the reservation business rules.
const { computeTotal, overlaps, canTransition, validateReservation, todayInManila } = require('../src/rules');

describe('computeTotal()', () => {
  test('off-peak hours use the normal hourly rate', () => {
    expect(computeTotal(300, 8, 2)).toBe(600);
  });

  test('peak hours (5 PM onwards) cost 20% more', () => {
    expect(computeTotal(500, 18, 2)).toBe(1200);
  });

  test('a booking that crosses into peak time is priced per hour', () => {
    // 16:00 is off-peak (400) and 17:00 is peak (480)
    expect(computeTotal(400, 16, 2)).toBe(880);
  });
});

describe('overlaps()', () => {
  test('detects overlapping slots', () => {
    expect(overlaps(10, 2, 11, 1)).toBe(true); // 10-12 vs 11-12
    expect(overlaps(10, 3, 9, 2)).toBe(true);  // 10-13 vs 9-11
  });

  test('back-to-back slots do not overlap', () => {
    expect(overlaps(10, 2, 12, 1)).toBe(false); // 10-12 vs 12-13
    expect(overlaps(12, 1, 10, 2)).toBe(false);
  });
});

describe('canTransition()', () => {
  test('allows the normal flow', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'completed')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
  });

  test('blocks invalid changes', () => {
    expect(canTransition('pending', 'completed')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('completed', 'pending')).toBe(false);
  });
});

describe('validateReservation()', () => {
  const today = '2026-10-01';
  const valid = {
    court_id: 1,
    customer_name: 'Juan Dela Cruz',
    contact: '0917 123 4567',
    play_date: '2026-10-05',
    start_hour: 9,
    hours: 2,
  };

  test('accepts a valid reservation', () => {
    expect(validateReservation(valid, today)).toEqual([]);
  });

  test('rejects dates in the past', () => {
    expect(validateReservation({ ...valid, play_date: '2026-09-30' }, today)).toContain('play_date cannot be in the past');
  });

  test('rejects bookings that end after closing time', () => {
    expect(validateReservation({ ...valid, start_hour: 21, hours: 3 }, today)).toContain('booking must end by 23:00');
  });

  test('rejects impossible dates and too many hours', () => {
    const errors = validateReservation({ ...valid, play_date: '2026-02-30', hours: 5 }, today);
    expect(errors).toContain('play_date must be a valid date (YYYY-MM-DD)');
    expect(errors).toContain('hours must be a whole number from 1 to 4');
  });

  test('todayInManila() uses Philippine time', () => {
    // 2026-10-01 20:00 UTC is already 2026-10-02 04:00 in Manila
    expect(todayInManila(new Date('2026-10-01T20:00:00Z'))).toBe('2026-10-02');
  });
});
