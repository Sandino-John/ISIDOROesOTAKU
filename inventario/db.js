// Exporta el mismo pool que el servidor principal.
// Las tablas del almacén tienen prefijo inv_ para no colisionar con las del PMS.
const pool = require('../db/pool');
module.exports = pool;
