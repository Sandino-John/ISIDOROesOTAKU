const BOLIVIA_OFFSET_HOURS = -4;
const BOLIVIA_OFFSET_MS = BOLIVIA_OFFSET_HOURS * 60 * 60 * 1000;

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

function nextMonthKey(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${pad2(month + 1)}`;
}

function monthRange(monthKey = boliviaMonthKey()) {
  return {
    start: `${monthKey}-01`,
    end: `${nextMonthKey(monthKey)}-01`,
  };
}

module.exports = {
  boliviaDateKey,
  boliviaMonthKey,
  operativeDateKey,
  nextMonthKey,
  monthRange,
};
