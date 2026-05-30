const prisma = require('../lib/prisma')

const addProduct = async (req, res) => {
  try {
    const { name, description, price, stockQty, categoryId, images, condition } = req.body
    const formattedName = name?.trim()
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.userId } })
    if (!vendor) return res.status(403).json({ error: 'You need a store first' })
      if (vendor.status !== 'APPROVED') {
  return res.status(403).json({
    error: 'Vendor approval required'
  })
}

if (vendor.subscriptionStatus !== 'ACTIVE') {
  return res.status(403).json({
    error: 'Active subscription required'
  })
}
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId,
        name: formattedName,
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
    const { search, categoryId, categoryName, vendorId, condition } = req.query

    // Resolve category filter: support either an explicit categoryId (existing
    // behavior) OR a category name passed via ?categoryName=... or ?category=...
    // (the legacy query param the home page links use).
    //
    // If the resolved category has children (a parent in the tree), match
    // products whose categoryId is in {self, ...children}. Otherwise exact match.
    let categoryFilter = undefined
    const rawName = categoryName || req.query.category
    if (categoryId || rawName) {
      let cat = null
      if (categoryId) {
        cat = await prisma.category.findUnique({
          where: { id: categoryId },
          include: { children: { select: { id: true } } }
        })
      } else if (rawName) {
        cat = await prisma.category.findFirst({
          where: { name: { equals: rawName.trim(), mode: 'insensitive' } },
          include: { children: { select: { id: true } } }
        })
      }
      if (cat) {
        const ids = [cat.id, ...(cat.children?.map(c => c.id) || [])]
        categoryFilter = ids.length > 1 ? { in: ids } : cat.id
      } else if (rawName) {
        // Name didn't resolve — return no products rather than all, so users
        // don't see unrelated items when they click a "Coming Soon" parent.
        return res.json([])
      }
    }

    // When the search term looks like a category name, find matching
    // categories AND their children, so searching "computer" surfaces
    // laptops/mice/keyboards (which live in child categories), not just
    // products literally tagged "Computers".
    let searchCategoryIds = []
    if (search && search.trim()) {
      const matchingCats = await prisma.category.findMany({
        where: { name: { contains: search.trim(), mode: 'insensitive' } },
        include: { children: { select: { id: true } } }
      })
      for (const mc of matchingCats) {
        searchCategoryIds.push(mc.id, ...(mc.children?.map(c => c.id) || []))
      }
      searchCategoryIds = [...new Set(searchCategoryIds)]
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(search && {
  OR: [
    {
      name: {
        contains: search,
        mode: 'insensitive'
      }
    },
    {
      description: {
        contains: search,
        mode: 'insensitive'
      }
    },
    {
      vendor: {
        storeName: {
          contains: search,
          mode: 'insensitive'
        }
      }
    },
    {
      category: {
        name: {
          contains: search,
          mode: 'insensitive'
        }
      }
    },
    // Products whose category (or whose parent category) name matched
    ...(searchCategoryIds.length ? [{ categoryId: { in: searchCategoryIds } }] : [])
  ]
}),
        ...(categoryFilter && { categoryId: categoryFilter }),
        ...(vendorId && { vendorId }),
        ...(condition && { condition })
      },
      include: {
        vendor: { select: { storeName: true, isVerified: true } },
        category: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(products)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const getProduct = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: { select: { storeName: true, isVerified: true } },
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