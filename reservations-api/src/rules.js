// Business rules for reservations. Pure functions, no database, easy to unit test.
//
// DEMO TIP (quality gate): change PEAK_MULTIPLIER to 1.5, commit and push.
// The "computeTotal" tests fail, Jenkins stops at the Test stage,
// and the running site stays on the previous build.

const OPEN_HOUR = 6;         // first bookable hour (6:00 AM)
const CLOSE_HOUR = 23;       // facility closes at 11:00 PM
const MAX_HOURS = 4;         // longest single booking
const PEAK_START = 17;       // 5:00 PM onwards is peak time
const PEAK_MULTIPLIER = 1.2; // peak hours cost 20% more

// Total price = sum of each booked hour; peak hours use the higher rate.
// Example: 400/hr, start 16:00, 2 hours -> 400 (16:00) + 480 (17:00, peak) = 880
function computeTotal(hourlyRate, startHour, hours) {
  let total = 0;
  for (let hour = startHour; hour < startHour + hours; hour += 1) {
    total += hour >= PEAK_START ? hourlyRate * PEAK_MULTIPLIER : hourlyRate;
  }
  return Math.round(total * 100) / 100;
}

// Two time slots on the same court and date overlap if each starts before the other ends.
function overlaps(startA, hoursA, startB, hoursB) {
  return startA < startB + hoursB && startB < startA + hoursA;
}

// Allowed status changes
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  cancelled: [],
  completed: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

// Today's date in the Philippines as 'YYYY-MM-DD' (containers run in UTC)
function todayInManila(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateReservation(body, today = todayInManila()) {
  const errors = [];
  const data = body || {};

  if (!Number.isInteger(data.court_id) || data.court_id < 1) errors.push('court_id must be a positive integer');

  if (typeof data.customer_name !== 'string' || data.customer_name.trim().length < 2 || data.customer_name.length > 100) {
    errors.push('customer_name must be 2 to 100 characters');
  }

  if (typeof data.contact !== 'string' || !/^[0-9+\-\s()]{7,20}$/.test(data.contact.trim())) {
    errors.push('contact must be a valid phone number');
  }

  if (!isValidDateString(data.play_date)) {
    errors.push('play_date must be a valid date (YYYY-MM-DD)');
  } else if (data.play_date < today) {
    errors.push('play_date cannot be in the past');
  }

  if (!Number.isInteger(data.hours) || data.hours < 1 || data.hours > MAX_HOURS) {
    errors.push(`hours must be a whole number from 1 to ${MAX_HOURS}`);
  }

  if (!Number.isInteger(data.start_hour) || data.start_hour < OPEN_HOUR || data.start_hour >= CLOSE_HOUR) {
    errors.push(`start_hour must be between ${OPEN_HOUR} and ${CLOSE_HOUR - 1}`);
  } else if (Number.isInteger(data.hours) && data.start_hour + data.hours > CLOSE_HOUR) {
    errors.push(`booking must end by ${CLOSE_HOUR}:00`);
  }

  return errors;
}

module.exports = {
  OPEN_HOUR,
  CLOSE_HOUR,
  MAX_HOURS,
  PEAK_START,
  PEAK_MULTIPLIER,
  computeTotal,
  overlaps,
  canTransition,
  todayInManila,
  isValidDateString,
  validateReservation,
};
