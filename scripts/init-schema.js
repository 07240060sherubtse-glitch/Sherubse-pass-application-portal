require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pgp = require('pg-promise')();
const db = pgp({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'sherubtse_pass_portal',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await db.none(schema);
    console.log(`Database schema is ready in "${process.env.DB_NAME || 'sherubtse_pass_portal'}".`);
  } catch (error) {
    console.error('Could not create the tables. Run the database creation step first and check your .env settings.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.$pool.end();
  }
})();
