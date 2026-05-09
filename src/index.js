const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const vendorRoutes = require('./routes/vendor')
const productRoutes = require('./routes/products')
const cartRoutes = require('./routes/cart')
const orderRoutes = require('./routes/orders')

const app = express()
const PORT = process.env.PORT || 3000

// CORS configuration — whitelist live domain, Vercel preview, and local dev
const allowedOrigins = [
  'https://jasprmarket.com',
  'https://www.jasprmarket.com',
  'https://mobimart-frontend-app.vercel.app',
  'http://localhost:3001',
]

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true)
    }
    console.warn(`CORS blocked: ${origin}`)
    return callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// Handle preflight for all routes (needed for PUT/PATCH/DELETE with auth)
app.options('*', cors())

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})