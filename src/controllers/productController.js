const prisma = require('../lib/prisma')

const addProduct = async (req, res) => {
  try {
    const { name, description, price, stockQty, categoryId, images, condition } = req.body
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(403).json({ error: 'You need a store first' })
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId,
        name,
        description,
        price: parseFloat(price),
        stockQty: parseInt(stockQty),
        images: images || [],
        condition: condition || 'NEW'
      }
    })
    res.status(201).json({ message: 'Product added successfully', product })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getProducts = async (req, res) => {
  try {
    const { search, categoryId, vendorId, condition } = req.query
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
        ...(categoryId && { categoryId }),
        ...(vendorId && { vendorId }),
        ...(condition && { condition })
      },
      include: {
        vendor: { select: { storeName: true } },
        category: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(products)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getProduct = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: { select: { storeName: true } },
        category: { select: { name: true } },
        reviews: true
      }
    })
    if (!product) return res.status(404).json({ error: 'Product not found' })
    res.json(product)
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const updateProduct = async (req, res) => {
  try {
    const { name, description, price, stockQty, isActive, categoryId, images, condition } = req.body
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        price: parseFloat(price),
        stockQty: parseInt(stockQty),
        isActive,
        ...(categoryId && { categoryId }),
        ...(images && { images }),
        ...(condition && { condition })
      }
    })
    res.json({ message: 'Product updated', product })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const deleteProduct = async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false }
    })
    res.json({ message: 'Product removed' })
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' })
  }
}

module.exports = { addProduct, getProducts, getProduct, updateProduct, deleteProduct }