const pgp = require('pg-promise')();
require('dotenv').config();
const db = pgp({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'sherubtse_pass_portal',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
module.exports = db;
