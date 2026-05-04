const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

const sendOrderConfirmation = async (order, user) => {
  try {
    const itemsList = order.orderItems?.map(item =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.product?.name || 'Product'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#f97316;font-weight:600">$${(item.unitPrice * item.quantity).toFixed(2)}</td>
      </tr>`
    ).join('') || ''

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
        <div style="background:linear-gradient(135deg,#0f1923,#1e3a5f);padding:32px;text-align:center">
          <h1 style="color:#f97316;margin:0;font-size:28px">MobiMart</h1>
          <p style="color:#94a3b8;margin:8px 0 0">Qatar's #1 Mobile Marketplace</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#1e3a5f">🎉 Order Confirmed!</h2>
          <p style="color:#555">Hi <strong>${user.name}</strong>, your order has been placed successfully!</p>
          <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:20px 0">
            <p style="margin:0 0 8px"><strong>Order ID:</strong> <span style="font-family:monospace;color:#666">${order.id?.slice(0,8)}...</span></p>
            <p style="margin:0 0 8px"><strong>Status:</strong> <span style="color:#f97316;font-weight:600">PENDING</span></p>
            <p style="margin:0 0 8px"><strong>Delivery to:</strong> ${order.shippingAddress?.street}, ${order.shippingAddress?.city}, ${order.shippingAddress?.country}</p>
            <p style="margin:0"><strong>Phone:</strong> ${order.shippingAddress?.phone}</p>
          </div>
          <h3 style="color:#1e3a5f">Items Ordered</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f8f9fa">
                <th style="padding:8px 12px;text-align:left;color:#666;font-size:13px">Product</th>
                <th style="padding:8px 12px;text-align:center;color:#666;font-size:13px">Qty</th>
                <th style="padding:8px 12px;text-align:right;color:#666;font-size:13px">Price</th>
              </tr>
            </thead>
            <tbody>${itemsList}</tbody>
          </table>
          <div style="border-top:2px solid #f97316;margin-top:16px;padding-top:16px;text-align:right">
            <p style="font-size:18px;font-weight:700;color:#f97316;margin:0">Total: $${order.totalAmount}</p>
          </div>
          <div style="margin-top:20px;padding:20px;background:#fefce8;border-radius:12px;border-left:4px solid #f97316">
            <p style="margin:0;color:#555">💵 <strong>Payment: Cash on Delivery</strong> — Please keep <strong>$${order.totalAmount}</strong> ready when your order arrives!</p>
          </div>
          <div style="margin-top:32px;padding:20px;background:#fff7ed;border-radius:12px;border-left:4px solid #f97316">
            <p style="margin:0;color:#555">We'll notify you when your order status changes. Thank you for shopping with MobiMart! 🛍️</p>
          </div>
        </div>
        <div style="background:#f8f9fa;padding:20px;text-align:center">
          <p style="color:#aaa;font-size:13px;margin:0">© 2026 MobiMart Qatar. All rights reserved.</p>
        </div>
      </div>
    `

    await transporter.sendMail({
      from: `"MobiMart Qatar" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `✅ Order Confirmed — #${order.id?.slice(0,8)}`,
      html
    })
    console.log('Order confirmation email sent to:', user.email)
  } catch (error) {
    console.error('Email error:', error.message)
  }
}

const sendStatusUpdate = async (order, user, newStatus) => {
  try {
    const statusInfo = {
      CONFIRMED: { emoji: '✅', color: '#3b82f6', message: 'Your order has been confirmed and is being prepared.' },
      SHIPPED: { emoji: '🚚', color: '#8b5cf6', message: 'Your order is on its way! Expect delivery soon.' },
      DELIVERED: { emoji: '🎉', color: '#10b981', message: 'Your order has been delivered. Enjoy your purchase!' },
      CANCELLED: { emoji: '❌', color: '#ef4444', message: 'Your order has been cancelled. Contact us for support.' }
    }

    const info = statusInfo[newStatus] || { emoji: '📦', color: '#f97316', message: 'Your order status has been updated.' }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
        <div style="background:linear-gradient(135deg,#0f1923,#1e3a5f);padding:32px;text-align:center">
          <h1 style="color:#f97316;margin:0;font-size:28px">MobiMart</h1>
          <p style="color:#94a3b8;margin:8px 0 0">Qatar's #1 Mobile Marketplace</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#1e3a5f">${info.emoji} Order Status Update</h2>
          <p style="color:#555">Hi <strong>${user.name}</strong>, your order status has been updated!</p>
          <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
            <p style="font-size:48px;margin:0">${info.emoji}</p>
            <p style="font-size:24px;font-weight:700;color:${info.color};margin:8px 0">${newStatus}</p>
            <p style="color:#555;margin:0">${info.message}</p>
          </div>
          <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:20px 0">
            <p style="margin:0 0 8px"><strong>Order ID:</strong> <span style="font-family:monospace;color:#666">${order.id?.slice(0,8)}...</span></p>
            <p style="margin:0 0 8px"><strong>Total:</strong> <span style="color:#f97316;font-weight:600">$${order.totalAmount}</span></p>
            <p style="margin:0"><strong>Delivery to:</strong> ${order.shippingAddress?.street}, ${order.shippingAddress?.city}</p>
          </div>
          ${newStatus === 'DELIVERED' ? `
          <div style="margin-top:20px;padding:20px;background:#d1fae5;border-radius:12px;border-left:4px solid #10b981">
            <p style="margin:0;color:#065f46">⭐ Enjoying your purchase? Leave a review on MobiMart to help other buyers!</p>
          </div>` : ''}
        </div>
        <div style="background:#f8f9fa;padding:20px;text-align:center">
          <p style="color:#aaa;font-size:13px;margin:0">© 2026 MobiMart Qatar. All rights reserved.</p>
        </div>
      </div>
    `

    await transporter.sendMail({
      from: `"MobiMart Qatar" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `${info.emoji} Order ${newStatus} — #${order.id?.slice(0,8)}`,
      html
    })
    console.log('Status update email sent to:', user.email)
  } catch (error) {
    console.error('Email error:', error.message)
  }
}

module.exports = { sendOrderConfirmation, sendStatusUpdate }