const prisma = require('../lib/prisma')

// ✅ Add a review — only verified buyers
const addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body
    const productId = req.params.id

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' })
    }

    // Check if user has a delivered order with this product
    const hasOrdered = await prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId: req.userId,
          status: 'DELIVERED'
        }
      }
    })

    if (!hasOrdered) {
      return res.status(403).json({ error: 'You can only review products you have purchased and received' })
    }

    // Check if already reviewed
    const existing = await prisma.review.findUnique({
      where: { userId_productId: { userId: req.userId, productId } }
    })

    if (existing) {
      return res.status(400).json({ error: 'You have already reviewed this product' })
    }

    const review = await prisma.review.create({
      data: { userId: req.userId, productId, rating: parseInt(rating), comment },
      include: { user: { select: { name: true } } }
    })

    // Update average rating on product
    const allReviews = await prisma.review.findMany({ where: { productId } })
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length

    await prisma.product.update({
      where: { id: productId },
      data: { avgRating: parseFloat(avgRating.toFixed(1)) }
    })

    res.status(201).json({ message: 'Review added successfully', review })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Get reviews for a product
const getReviews = async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { productId: req.params.id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(reviews)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

// ✅ Delete own review
const deleteReview = async (req, res) => {
  try {
    const review = await prisma.review.findUnique({
      where: { userId_productId: { userId: req.userId, productId: req.params.id } }
    })

    if (!review) return res.status(404).json({ error: 'Review not found' })
    if (review.userId !== req.userId) return res.status(403).json({ error: 'Not your review' })

    await prisma.review.delete({
      where: { userId_productId: { userId: req.userId, productId: req.params.id } }
    })

    // Recalculate average rating
    const allReviews = await prisma.review.findMany({ where: { productId: req.params.id } })
    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0

    await prisma.product.update({
      where: { id: req.params.id },
      data: { avgRating: parseFloat(avgRating.toFixed(1)) }
    })

    res.json({ message: 'Review deleted' })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = { addReview, getReviews, deleteReview }