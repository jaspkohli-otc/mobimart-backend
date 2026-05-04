const prisma = require('../lib/prisma')

const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body

    const product = await prisma.product.findUnique({
      where: { id: productId }
    })
    if (!product || !product.isActive) {
      return res.status(404).json({ error: 'Product not found' })
    }
    if (product.stockQty < quantity) {
      return res.status(400).json({ error: 'Not enough stock' })
    }

    const existing = await prisma.cartItem.findUnique({
      where: { userId_productId: { userId: req.userId, productId } }
    })

    let cartItem
    if (existing) {
      cartItem = await prisma.cartItem.update({
        where: { userId_productId: { userId: req.userId, productId } },
        data: { quantity: existing.quantity + quantity }
      })
    } else {
      cartItem = await prisma.cartItem.create({
        data: { userId: req.userId, productId, quantity }
      })
    }

    res.json({ message: 'Added to cart', cartItem })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getCart = async (req, res) => {
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId: req.userId },
      include: {
        product: {
          include: { vendor: { select: { storeName: true } } }
        }
      }
    })

    const total = items.reduce((sum, item) => {
      return sum + (item.product.price * item.quantity)
    }, 0)

    res.json({ items, total: parseFloat(total.toFixed(2)) })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body
    if (quantity <= 0) {
      await prisma.cartItem.delete({
        where: { userId_productId: { userId: req.userId, productId: req.params.productId } }
      })
      return res.json({ message: 'Item removed from cart' })
    }
    const cartItem = await prisma.cartItem.update({
      where: { userId_productId: { userId: req.userId, productId: req.params.productId } },
      data: { quantity }
    })
    res.json({ message: 'Cart updated', cartItem })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const removeFromCart = async (req, res) => {
  try {
    await prisma.cartItem.delete({
      where: { userId_productId: { userId: req.userId, productId: req.params.productId } }
    })
    res.json({ message: 'Item removed from cart' })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const clearCart = async (req, res) => {
  try {
    await prisma.cartItem.deleteMany({
      where: { userId: req.userId }
    })
    res.json({ message: 'Cart cleared' })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = { addToCart, getCart, updateCartItem, removeFromCart, clearCart }