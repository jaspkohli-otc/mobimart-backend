require('dns').setDefaultResultOrder('ipv4first')

const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const vendorRoutes = require('./routes/vendor')
const productRoutes = require('./routes/products')
const cartRoutes = require('./routes/cart')
const orderRoutes = require('./routes/orders')
const paymentRoutes = require('./routes/payment')

const app = express()
const PORT = process.env.PORT || 3000

// CORS configuration — whitelist live domain, Vercel preview, and local dev
const allowedOrigins = [
  'https://www.jasprmarket.com',
  'https://mobimart-frontend-app.vercel.app',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'http://10.0.2.2:3000',
]

app.use(cors({
  origin: true,
  credentials: true
}))

app.use(express.json())

// ✅ Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req, res) => {
  res.json({ message: 'MobiMart API is running!' })
})

app.use('/api/auth', authRoutes)
app.use('/api/vendors', vendorRoutes)
app.use('/api/products', productRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/payments', paymentRoutes)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})