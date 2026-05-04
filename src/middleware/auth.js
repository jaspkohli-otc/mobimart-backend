const jwt = require('jsonwebtoken')

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.userId = decoded.userId
    req.userRole = decoded.role
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const requireVendor = (req, res, next) => {
  if (req.userRole !== 'VENDOR') {
    return res.status(403).json({ error: 'Vendor access only' })
  }
  next()
}

const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access only' })
  }
  next()
}

module.exports = { authenticate, requireVendor, requireAdmin }