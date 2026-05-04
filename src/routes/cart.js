const express = require('express')
const router = express.Router()
const { addToCart, getCart, updateCartItem, removeFromCart, clearCart } = require('../controllers/cartController')
const { authenticate } = require('../middleware/auth')

router.get('/', authenticate, getCart)
router.post('/', authenticate, addToCart)
router.put('/:productId', authenticate, updateCartItem)
router.delete('/:productId', authenticate, removeFromCart)
router.delete('/', authenticate, clearCart)

module.exports = router