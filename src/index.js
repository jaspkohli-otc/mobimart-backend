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

app.use(cors())
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