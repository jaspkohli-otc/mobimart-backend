const express = require('express')
const router = express.Router()
const { addProduct, getProducts, getProduct, updateProduct, deleteProduct } = require('../controllers/productController')
const { addReview, getReviews, deleteReview } = require('../controllers/reviewController')
const { authenticate, requireVendor } = require('../middleware/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ✅ Categories endpoint
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    res.json(categories)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
})

router.get('/', getProducts)
router.get('/:id', getProduct)
router.post('/', authenticate, requireVendor, addProduct)
router.put('/:id', authenticate, requireVendor, updateProduct)
router.delete('/:id', authenticate, requireVendor, deleteProduct)

// ✅ Review routes
router.get('/:id/reviews', getReviews)
router.post('/:id/reviews', authenticate, addReview)
router.delete('/:id/reviews', authenticate, deleteReview)

module.exports = router