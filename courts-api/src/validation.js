// Input validation for courts. Kept separate from the routes so it is easy to unit test.

function validateCourt(body, { partial = false } = {}) {
  const errors = [];
  const data = body || {};

  if (!partial || data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('name is required');
    } else if (data.name.trim().length > 80) {
      errors.push('name must be at most 80 characters');
    }
  }

  if (data.surface !== undefined) {
    if (typeof data.surface !== 'string' || data.surface.trim().length === 0 || data.surface.length > 40) {
      errors.push('surface must be a non-empty string (max 40 characters)');
    }
  }

  if (!partial || data.hourly_rate !== undefined) {
    const rate = Number(data.hourly_rate);
    if (data.hourly_rate === null || data.hourly_rate === '' || !Number.isFinite(rate) || rate < 0 || rate > 100000) {
      errors.push('hourly_rate must be a number between 0 and 100000');
    }
  }

  if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
    errors.push('is_active must be true or false');
  }

  return errors;
}

module.exports = { validateCourt };
