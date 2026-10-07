const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:RAVI312005@localhost:5432/trusthire_db'
});

module.exports = pool;