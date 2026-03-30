class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function badRequest(message) {
  return new HttpError(400, message);
}

function readArray(value, field, { minLength = 0 } = {}) {
  if (!Array.isArray(value)) throw badRequest(`${field} inválido`);
  if (value.length < minLength) throw badRequest(`${field} inválido`);
  return value;
}

function readNumber(value, field, { integer = false, min, optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;

  const num = Number(value);
  if (!Number.isFinite(num)) throw badRequest(`${field} inválido`);
  if (integer && !Number.isInteger(num)) throw badRequest(`${field} inválido`);
  if (min !== undefined && num < min) throw badRequest(`${field} inválido`);
  return num;
}

function readString(value, field, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return null;

  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) {
    if (optional) return null;
    throw badRequest(`${field} inválido`);
  }
  return str;
}

function handleRouteError(res, err, context, fallbackMessage = 'Error interno') {
  if (err instanceof HttpError || (err && err.name === 'HttpError' && err.status)) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(context, err);
  return res.status(500).json({ error: err.message || fallbackMessage });
}

module.exports = {
  HttpError,
  badRequest,
  readArray,
  readNumber,
  readString,
  handleRouteError,
};
