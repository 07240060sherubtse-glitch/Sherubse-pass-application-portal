require('dotenv').config();
if (!process.env.JWT_SECRET) console.warn('Warning: set JWT_SECRET in .env before using authentication.');
const app = require('./app');
const port = process.env.PORT || 3000;
app.listen(port,()=>console.log(`Sherubtse Pass Application Portal API running at http://localhost:${port}`));
