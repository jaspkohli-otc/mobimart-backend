const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://postgres:aAjBeUgWRQxGonXbTXYZOLzFMbRDTfLd@switchback.proxy.rlwy.net:58690/railway',
  ssl: { rejectUnauthorized: false }
})
async function clearData() {
  await pool.query('DELETE FROM "VendorDocument"')
  console.log('VendorDocument cleared')
  await pool.query('DELETE FROM "Review"')
  console.log('Reviews cleared')
  await pool.query('DELETE FROM "OrderItem"')
  console.log('OrderItems cleared')
  await pool.query('DELETE FROM "Order"')
  console.log('Orders cleared')
  await pool.query('DELETE FROM "CartItem"')
  console.log('CartItems cleared')
  await pool.query('DELETE FROM "Product"')
  console.log('Products cleared')
  await pool.query('DELETE FROM "Vendor"')
  console.log('Vendors cleared')
  await pool.query('DELETE FROM "Subscription"')
  console.log('Subscriptions cleared')
  await pool.query('DELETE FROM "User" WHERE role != \'ADMIN\'')
  console.log('Users cleared - admin kept')
  await pool.end()
  console.log('ALL DONE!')
}
clearData().catch(console.error)