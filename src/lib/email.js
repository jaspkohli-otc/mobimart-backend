const nodemailer = require('nodemailer')

const dns = require('dns').promises

// Resolve smtp.gmail.com to an IPv4 address at startup
let smtpHost = 'smtp.gmail.com'
dns.resolve4('smtp.gmail.com')
  .then(ips => {
    if (ips && ips.length > 0) {
      smtpHost = ips[0]
      console.log('SMTP host resolved to IPv4:', smtpHost)
    }
  })
  .catch(err => console.error('SMTP IPv4 resolution failed:', err.message))

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  family: 4,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  // Override DNS lookup to force IPv4
  tls: {
    servername: 'smtp.gmail.com'  // Keep TLS hostname check correct
  },
  lookup: (hostname, options, callback) => {
    require('dns').lookup(hostname, { ...options, family: 4 }, callback)
  }
})

// From-address helpers — fall back to EMAIL_USER if a specific FROM isn't set
const FROM_NOREPLY = process.env.EMAIL_FROM_NOREPLY || `"MobiMart" <${process.env.EMAIL_USER}>`
const FROM_ORDERS  = process.env.EMAIL_FROM_ORDERS  || `"MobiMart Orders" <${process.env.EMAIL_USER}>`
const FROM_SUPPORT = process.env.EMAIL_FROM_SUPPORT || `"MobiMart Support" <${process.env.EMAIL_USER}>`
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@jasprmarket.com'

// ✅ Customer — Order Confirmation + Invoice
const sendOrderConfirmation = async (order, user) => {
  try {
    const itemsList = order.orderItems?.map(item =>
      `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px">${item.product?.name || 'Product'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-size:14px">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-size:14px">QAR ${item.unitPrice.toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#f97316;font-weight:600;font-size:14px">QAR ${(item.unitPrice * item.quantity).toFixed(2)}</td>
      </tr>`
    ).join('') || ''

    const invoiceDate = new Date().toLocaleDateString('en-QA', { day: 'numeric', month: 'long', year: 'numeric' })

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0f1923,#1e3a5f);padding:32px;text-align:center">
          <h1 style="color:#f97316;margin:0;font-size:32px;letter-spacing:1px">MobiMart</h1>
          <p style="color:#94a3b8;margin:8px 0 0;font-size:14px">by JASPR Trading | Qatar's #1 Mobile Marketplace</p>
        </div>
        <div style="background:#fff7ed;padding:16px 32px;border-bottom:2px solid #f97316">
          <table style="width:100%"><tr>
            <td>
              <p style="margin:0;font-size:22px;font-weight:700;color:#1e3a5f">INVOICE</p>
              <p style="margin:4px 0 0;color:#666;font-size:13px">Order Confirmation</p>
            </td>
            <td style="text-align:right">
              <p style="margin:0;font-size:13px;color:#666">Date: ${invoiceDate}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#666">Order #: <strong style="color:#1e3a5f;font-family:monospace">${order.id?.slice(0,8).toUpperCase()}</strong></p>
            </td>
          </tr></table>
        </div>
        <div style="padding:32px">
          <p style="color:#555;font-size:16px">Dear <strong>${user.name}</strong>,</p>
          <p style="color:#555;font-size:14px;margin-bottom:24px">Thank you for your order! Here is your invoice for reference.</p>
          <table style="width:100%;margin-bottom:24px">
            <tr>
              <td style="width:48%;background:#f8f9fa;border-radius:10px;padding:16px;vertical-align:top">
                <p style="margin:0 0 8px;font-weight:700;color:#1e3a5f;font-size:12px;letter-spacing:1px">BILL TO</p>
                <p style="margin:0 0 4px;color:#555;font-size:14px"><strong>${user.name}</strong></p>
                <p style="margin:0 0 4px;color:#666;font-size:13px">${user.email}</p>
              </td>
              <td style="width:4%"></td>
              <td style="width:48%;background:#f8f9fa;border-radius:10px;padding:16px;vertical-align:top">
                <p style="margin:0 0 8px;font-weight:700;color:#1e3a5f;font-size:12px;letter-spacing:1px">SHIP TO</p>
                <p style="margin:0 0 4px;color:#555;font-size:14px"><strong>${order.shippingAddress?.name || user.name}</strong></p>
                <p style="margin:0 0 4px;color:#666;font-size:13px">${order.shippingAddress?.street}</p>
                <p style="margin:0;color:#666;font-size:13px">${order.shippingAddress?.city}, ${order.shippingAddress?.country}</p>
              </td>
            </tr>
          </table>
          <div style="background:#fff7ed;border-radius:10px;padding:12px 16px;margin-bottom:24px;border-left:4px solid #f97316">
            <p style="margin:0;color:#555;font-size:14px">📦 <strong>Status:</strong> <span style="color:#f97316;font-weight:700">PENDING</span> &nbsp;|&nbsp; 💳 <strong>Payment:</strong> Cash on Delivery</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
            <thead>
              <tr style="background:#1e3a5f">
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:13px">Product</th>
                <th style="padding:10px 12px;text-align:center;color:#fff;font-size:13px">Qty</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:13px">Unit Price</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:13px">Total</th>
              </tr>
            </thead>
            <tbody>${itemsList}</tbody>
          </table>
          <div style="border-top:2px solid #f97316;padding-top:16px;margin-top:8px">
            <table style="width:100%">
              <tr>
                <td style="padding:4px 12px;color:#666;font-size:14px">Shipping</td>
                <td style="padding:4px 12px;text-align:right;color:#10b981;font-size:14px;font-weight:600">FREE</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;font-size:18px;font-weight:700;color:#1e3a5f;background:#fff7ed;border-radius:8px 0 0 8px">TOTAL DUE</td>
                <td style="padding:10px 12px;text-align:right;font-size:18px;font-weight:700;color:#f97316;background:#fff7ed;border-radius:0 8px 8px 0">QAR ${order.totalAmount}</td>
              </tr>
            </table>
          </div>
          <div style="margin-top:24px;padding:16px;background:#d1fae5;border-radius:10px;border-left:4px solid #10b981">
            <p style="margin:0;color:#065f46;font-size:14px">💵 <strong>Cash on Delivery:</strong> Please keep <strong>QAR ${order.totalAmount}</strong> ready when your order arrives.</p>
          </div>
          <div style="margin-top:24px;padding:16px;background:#f8f9fa;border-radius:10px;text-align:center">
            <p style="margin:0;color:#555;font-size:14px">Thank you for shopping with <strong style="color:#f97316">MobiMart</strong>! 🛍️</p>
          </div>
        </div>
        <div style="background:#0f1923;padding:20px;text-align:center">
          <p style="color:#f97316;font-size:16px;font-weight:700;margin:0 0 4px">MobiMart by JASPR Trading</p>
          <p style="color:#94a3b8;font-size:12px;margin:0">Qatar's #1 Mobile Marketplace</p>
          <p style="color:#555;font-size:11px;margin:8px 0 0">© 2026 MobiMart Qatar. All rights reserved.</p>
        </div>
      </div>`

    await transporter.sendMail({
      from: FROM_ORDERS,
      to: user.email,
      subject: `✅ Invoice & Order Confirmed — #${order.id?.slice(0,8).toUpperCase()} | MobiMart`,
      html
    })
    console.log('Order confirmation email sent to:', user.email)
  } catch (error) {
    console.error('Email error:', error.message)
  }
}

// ✅ Customer — Status Update
const sendStatusUpdate = async (order, user, newStatus) => {
  try {
    const statusInfo = {
      CONFIRMED: { emoji: '✅', color: '#3b82f6', message: 'Your order has been confirmed and is being prepared.' },
      SHIPPED:   { emoji: '🚚', color: '#8b5cf6', message: 'Your order is on its way! Expect delivery soon.' },
      DELIVERED: { emoji: '🎉', color: '#10b981', message: 'Your order has been delivered. Enjoy your purchase!' },
      CANCELLED: { emoji: '❌', color: '#ef4444', message: 'Your order has been cancelled. Contact us for support.' }
    }
    const info = statusInfo[newStatus] || { emoji: '📦', color: '#f97316', message: 'Your order status has been updated.' }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0f1923,#1e3a5f);padding:32px;text-align:center">
          <h1 style="color:#f97316;margin:0;font-size:28px">MobiMart</h1>
          <p style="color:#94a3b8;margin:8px 0 0">by JASPR Trading | Qatar's #1 Mobile Marketplace</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#1e3a5f">${info.emoji} Order Status Update</h2>
          <p style="color:#555">Hi <strong>${user.name}</strong>, your order status has been updated!</p>
          <div style="background:#f8f9fa;border-radius:12px;padding:24px;margin:20px 0;text-align:center">
            <p style="font-size:48px;margin:0">${info.emoji}</p>
            <p style="font-size:24px;font-weight:700;color:${info.color};margin:8px 0">${newStatus}</p>
            <p style="color:#555;margin:0">${info.message}</p>
          </div>
          <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:20px 0">
            <p style="margin:0 0 8px"><strong>Order ID:</strong> <span style="font-family:monospace;color:#666">${order.id?.slice(0,8).toUpperCase()}</span></p>
            <p style="margin:0 0 8px"><strong>Total:</strong> <span style="color:#f97316;font-weight:600">QAR ${order.totalAmount}</span></p>
            <p style="margin:0"><strong>Delivery to:</strong> ${order.shippingAddress?.street}, ${order.shippingAddress?.city}</p>
          </div>
          ${newStatus === 'DELIVERED' ? `
          <div style="margin-top:20px;padding:20px;background:#d1fae5;border-radius:12px;border-left:4px solid #10b981">
            <p style="margin:0;color:#065f46">⭐ Enjoying your purchase? Leave a review on MobiMart to help other buyers!</p>
          </div>` : ''}
          <div style="margin-top:24px;padding:16px;background:#f8f9fa;border-radius:10px;text-align:center">
            <p style="margin:0;color:#555;font-size:14px">Thank you for shopping with <strong style="color:#f97316">MobiMart</strong>! 🛍️</p>
          </div>
        </div>
        <div style="background:#0f1923;padding:20px;text-align:center">
          <p style="color:#f97316;font-size:16px;font-weight:700;margin:0 0 4px">MobiMart by JASPR Trading</p>
          <p style="color:#94a3b8;font-size:12px;margin:0">Qatar's #1 Mobile Marketplace</p>
          <p style="color:#555;font-size:11px;margin:8px 0 0">© 2026 MobiMart Qatar. All rights reserved.</p>
        </div>
      </div>`

    await transporter.sendMail({
      from: FROM_ORDERS,
      to: user.email,
      subject: `${info.emoji} Order ${newStatus} — #${order.id?.slice(0,8).toUpperCase()} | MobiMart`,
      html
    })
    console.log('Status update email sent to:', user.email)
  } catch (error) {
    console.error('Email error:', error.message)
  }
}

// ✅ Vendor — New Order Notification
const sendVendorOrderNotification = async (vendorEmail, vendorStoreName, order, vendorItems) => {
  try {
    const itemsList = vendorItems.map(item =>
      `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px">${item.product?.name || 'Product'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-size:14px">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-size:14px">QAR ${item.unitPrice.toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#f97316;font-size:14px">QAR ${(item.unitPrice * item.quantity).toFixed(2)}</td>
      </tr>`
    ).join('')

    const vendorTotal = vendorItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
    const vendorEarning = vendorItems.reduce((sum, item) => sum + item.vendorEarning, 0)
    const orderDate = new Date().toLocaleDateString('en-QA', { day: 'numeric', month: 'long', year: 'numeric' })
    const addr = order.shippingAddress

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0f1923,#1e3a5f);padding:32px;text-align:center">
          <h1 style="color:#f97316;margin:0;font-size:32px">MobiMart</h1>
          <p style="color:#94a3b8;margin:8px 0 0;font-size:14px">Vendor Order Notification</p>
        </div>

        <div style="background:#fff7ed;padding:16px 32px;border-bottom:2px solid #f97316">
          <table style="width:100%"><tr>
            <td>
              <p style="margin:0;font-size:20px;font-weight:700;color:#1e3a5f">🛒 New Order Received!</p>
              <p style="margin:4px 0 0;color:#666;font-size:13px">Store: ${vendorStoreName}</p>
            </td>
            <td style="text-align:right">
              <p style="margin:0;font-size:13px;color:#666">Date: ${orderDate}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#666">Order #: <strong style="color:#1e3a5f;font-family:monospace">${order.id?.slice(0,8).toUpperCase()}</strong></p>
            </td>
          </tr></table>
        </div>

        <div style="padding:32px">
          <p style="color:#555;font-size:15px">Hi <strong>${vendorStoreName}</strong>, you have a new order to prepare for dispatch!</p>

          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:24px">
            <p style="margin:0;font-weight:700;color:#065f46;font-size:13px;letter-spacing:1px">💰 YOUR EARNINGS FOR THIS ORDER</p>
            <p style="margin:8px 0 0;font-size:28px;font-weight:700;color:#10b981">QAR ${vendorEarning.toFixed(2)}</p>
            <p style="margin:4px 0 0;color:#666;font-size:13px">Order Value: QAR ${vendorTotal.toFixed(2)} | Payment: Cash on Delivery</p>
            <p style="margin:4px 0 0;color:#10b981;font-size:13px;font-weight:600">✅ You keep 100% — No commission deducted</p>
          </div>

          <h3 style="color:#1e3a5f;margin:0 0 12px">📦 Items to Dispatch</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead>
              <tr style="background:#1e3a5f">
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:13px">Product</th>
                <th style="padding:10px 12px;text-align:center;color:#fff;font-size:13px">Qty</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:13px">Unit Price</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:13px">Total</th>
              </tr>
            </thead>
            <tbody>${itemsList}</tbody>
          </table>

          <h3 style="color:#1e3a5f;margin:0 0 12px">🚚 Ship To (Customer Delivery Address)</h3>
          <div style="background:#f8f9fa;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #1e3a5f">
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1e3a5f">${addr?.name || 'Customer'}</p>
            <p style="margin:0 0 4px;color:#555;font-size:14px">📍 ${addr?.street}</p>
            <p style="margin:0 0 4px;color:#555;font-size:14px">🏙️ ${addr?.city}, ${addr?.country}</p>
            ${addr?.phone ? `<p style="margin:0;color:#555;font-size:14px">📞 ${addr.phone}</p>` : ''}
          </div>

          <div style="background:#fff7ed;border-radius:10px;padding:16px;border-left:4px solid #f97316;margin-bottom:24px">
            <p style="margin:0;color:#92400e;font-size:14px">💳 <strong>Payment Method:</strong> Cash on Delivery</p>
            <p style="margin:6px 0 0;color:#92400e;font-size:14px">Please ensure the item is securely packed before dispatch. The customer will pay <strong>QAR ${vendorTotal.toFixed(2)}</strong> on delivery.</p>
          </div>

          <div style="background:#f8f9fa;border-radius:10px;padding:16px;text-align:center">
            <p style="margin:0;color:#555;font-size:14px">Log in to your <strong style="color:#f97316">MobiMart Vendor Dashboard</strong> to update the order status once dispatched.</p>
          </div>
        </div>

        <div style="background:#0f1923;padding:20px;text-align:center">
          <p style="color:#f97316;font-size:16px;font-weight:700;margin:0 0 4px">MobiMart by JASPR Trading</p>
          <p style="color:#94a3b8;font-size:12px;margin:0">Qatar's #1 Mobile Marketplace</p>
          <p style="color:#555;font-size:11px;margin:8px 0 0">© 2026 MobiMart Qatar. All rights reserved.</p>
        </div>
      </div>`

    await transporter.sendMail({
      from: FROM_ORDERS,
      to: vendorEmail,
      subject: `🛒 New Order #${order.id?.slice(0,8).toUpperCase()} — Prepare for Dispatch | MobiMart`,
      html
    })
    console.log('Vendor order notification sent to:', vendorEmail)
  } catch (error) {
    console.error('Vendor email error:', error.message)
  }
}

// ✅ Vendor — Approval Status Email
const sendVendorStatusEmail = async (email, name, storeName, status, note) => {
  try {
    const isApproved = status === 'APPROVED'
    const subject = isApproved
      ? `✅ Your MobiMart Store "${storeName}" is Approved!`
      : `❌ MobiMart Store Registration Update`

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#0f1923,#1e3a5f);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;">Mobi<span style="color:#f97316;">Mart</span></h1>
          <p style="color:#94a3b8;margin:8px 0 0;">by JASPR Trading</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #eee;border-radius:0 0 12px 12px;">
          <h2 style="color:#0f1923;">Hello ${name},</h2>
          ${isApproved ? `
            <p>Your store <strong>${storeName}</strong> has been <span style="color:#10b981;font-weight:bold;">approved</span> on MobiMart!</p>
            <p>You can now log in and start listing your products.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
              <p style="margin:0;color:#065f46;font-weight:600;">📋 Subscription Reminder</p>
              <p style="margin:8px 0 0;color:#065f46;font-size:14px;">
                • Setup Fee: QAR 1,000 (one-time)<br>
                • Monthly: QAR 250/month<br>
                • Annual Renewal: QAR 500/year
              </p>
            </div>
            <a href="https://www.jasprmarket.com/vendor" style="display:inline-block;background:#f97316;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">Go to My Store →</a>
          ` : `
            <p>Your store <strong>${storeName}</strong> registration has been <span style="color:#ef4444;font-weight:bold;">not approved</span> at this time.</p>
            ${note ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;color:#991b1b;"><p style="margin:0;font-weight:600;">Reason:</p><p style="margin:8px 0 0;">${note}</p></div>` : ''}
            <p>For queries contact: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
          `}
        </div>
      </div>`

    await transporter.sendMail({
      from: FROM_SUPPORT,
      to: email,
      subject,
      html
    })
    console.log('Vendor status email sent to:', email)
  } catch (error) {
    console.error('Vendor status email error:', error.message)
  }
}

module.exports = { sendOrderConfirmation, sendStatusUpdate, sendVendorOrderNotification, sendVendorStatusEmail }
