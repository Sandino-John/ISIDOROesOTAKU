(function attachNoctaTime(global) {
  const BOLIVIA_OFFSET_HOURS = -4;
  const BOLIVIA_OFFSET_MS = BOLIVIA_OFFSET_HOURS * 60 * 60 * 1000;
  const BOLIVIA_TZ = 'America/La_Paz';

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function shiftedDate(timestamp = Date.now()) {
    return new Date(Number(timestamp) + BOLIVIA_OFFSET_MS);
  }

  function dateKeyFromShifted(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  function boliviaDateKey(timestamp = Date.now()) {
    return dateKeyFromShifted(shiftedDate(timestamp));
  }

  function boliviaMonthKey(timestamp = Date.now()) {
    const date = shiftedDate(timestamp);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
  }

  function operativeDateKey(timestamp = Date.now(), cutoffHour = 6) {
    const date = shiftedDate(timestamp);
    if (date.getUTCHours() < cutoffHour) date.setUTCDate(date.getUTCDate() - 1);
    return dateKeyFromShifted(date);
  }

  function boliviaHour(timestamp = Date.now()) {
    return shiftedDate(timestamp).getUTCHours();
  }

  function formatDateTime(timestamp, options = {}) {
    if (timestamp == null) return '—';
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: BOLIVIA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    }).format(new Date(timestamp));
  }

  function formatDate(timestamp, options = {}) {
    if (timestamp == null) return '—';
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: BOLIVIA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...options,
    }).format(new Date(timestamp));
  }

  function formatTime(timestamp, options = {}) {
    if (timestamp == null) return '—';
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: BOLIVIA_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...options,
    }).format(new Date(timestamp));
  }

  global.NOCTA_TIME = {
    boliviaDateKey,
    boliviaMonthKey,
    operativeDateKey,
    boliviaHour,
    formatDateTime,
    formatDate,
    formatTime,
    timeZone: BOLIVIA_TZ,
  };
})(window);
