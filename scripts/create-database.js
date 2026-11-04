require('dotenv').config();
const pgp = require('pg-promise')();

// Connect to PostgreSQL's maintenance database first, because the target DB
// must exist before the application can connect to it.
const databaseName = process.env.DB_NAME || 'sherubtse_pass_portal';
const adminDb = pgp({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_ADMIN_DATABASE || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const existing = await adminDb.oneOrNone(
      'SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]
    );
    if (existing) {
      console.log(`Database "${databaseName}" already exists.`);
    } else {
      // The database name is quoted as an identifier after strict validation.
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
        throw new Error('DB_NAME may contain only letters, numbers and underscores, and cannot start with a number.');
      }
      await adminDb.none(`CREATE DATABASE "${databaseName}"`);
      console.log(`Created database "${databaseName}".`);
    }
  } catch (error) {
    console.error('Could not create/check the database. Confirm PostgreSQL is running and .env credentials are correct.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await adminDb.$pool.end();
  }
})();
