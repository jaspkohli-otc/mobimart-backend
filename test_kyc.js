const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://postgres:aAjBeUgWRQxGonXbTXYZOLzFMbRDTfLd@switchback.proxy.rlwy.net:58690/railway',
  ssl: { rejectUnauthorized: false }
})
async function fix() {
  await pool.query(`ALTER TABLE "VendorDocument" ALTER COLUMN "fileUrl" DROP NOT NULL`)
  console.log('Done — fileUrl is now nullable')
  await pool.end()
}
fix().catch(console.error)