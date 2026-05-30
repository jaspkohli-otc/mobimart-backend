const axios = require('axios')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Shared MyFatoorah axios helper ──────────────────────────────
const mf = () => axios.create({
  baseURL: process.env.MYFATOORAH_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.MYFATOORAH_TOKEN}`,
    'Content-Type': 'application/json'
  }
})

// Where MyFatoorah sends the user back after payment. These point to the
// FRONTEND callback pages (port 3001), which then call /payment/verify.
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3001'

// ============================================================
// 1. CREATE VENDOR SUBSCRIPTION PAYMENT
//    Initiates + executes a MyFatoorah payment, stores a Payment
//    row (so we can verify later), returns the hosted invoice URL.
// ============================================================
const createVendorSubscriptionPayment = async (req, res) => {
  try {
    const { amount, vendorId, subscriptionType } = req.body
    if (!amount || !vendorId) {
      return res.status(400).json({ error: 'amount and vendorId are required' })
    }

    const client = mf()

    // Step 1: InitiatePayment — get available payment methods
    const initiate = await client.post('/v2/InitiatePayment', {
      InvoiceAmount: amount,
      CurrencyIso: 'KWD'
    })
    const methods = initiate.data?.Data?.PaymentMethods || []
    if (methods.length === 0) {
      return res.status(502).json({ error: 'No payment methods returned by gateway' })
    }
    // Pick a method that generates a usable redirect URL.
    // The first method is often Apple Pay (PaymentMethodCode 'ap'), which does
    // NOT return a redirect InvoiceURL — it needs embedded/native handling.
    // Prefer VISA/MASTER ('vm'), then KNET ('kn'), then any non-Apple-Pay method.
    const pick =
      methods.find(m => m.PaymentMethodCode === 'vm') ||
      methods.find(m => m.PaymentMethodCode === 'kn') ||
      methods.find(m => m.PaymentMethodCode !== 'ap') ||
      methods[0]
    const paymentMethodId = pick.PaymentMethodId

    // Step 2: pre-create a Payment row so we have an id to reference
    const payment = await prisma.payment.create({
      data: {
        purpose: 'VENDOR_SUBSCRIPTION',
        vendorId,
        subscriptionType: subscriptionType || null,
        amount: Number(amount),
        currency: 'KWD',
        status: 'PENDING'
      }
    })

    // Step 3: ExecutePayment — pass our payment.id as CustomerReference so the
    // callback can find this row. CallBack/Error point to frontend pages.
    const execute = await client.post('/v2/ExecutePayment', {
      PaymentMethodId: paymentMethodId,
      CustomerName: 'JASPR Vendor',
      CustomerEmail: 'vendor@jasprmarket.com',
      CustomerMobile: '30568968',
      MobileCountryCode: '+965',
      InvoiceValue: amount,
      DisplayCurrencyIso: 'KWD',
      CallBackUrl: `${FRONTEND}/payment-success`,
      ErrorUrl: `${FRONTEND}/payment-failed`,
      Language: 'en',
      CustomerReference: payment.id   // our own Payment row id
    })

    const data = execute.data?.Data
    const invoiceId = data?.InvoiceId ? String(data.InvoiceId) : null
    // MyFatoorah returns the redirect link as PaymentURL (and sometimes InvoiceURL).
    const invoiceUrl = data?.PaymentURL || data?.InvoiceURL

    // Step 4: save the InvoiceId + URL on the Payment row
    await prisma.payment.update({
      where: { id: payment.id },
      data: { invoiceId, invoiceUrl }
    })

    res.json({ paymentUrl: invoiceUrl, paymentRecordId: payment.id })
  } catch (error) {
    console.error('MYFATOORAH INITIATE ERROR:', error.response?.data || error.message)
    res.status(500).json({ error: 'Payment initialization failed' })
  }
}

// ============================================================
// 2. VERIFY PAYMENT (called from the frontend callback page)
//    MyFatoorah redirects to /payment-success?paymentId=XXXX.
//    The frontend posts that paymentId here. We call GetPaymentStatus
//    to CONFIRM the real result (never trust the redirect alone),
//    update our Payment row, and apply the result (activate sub).
// ============================================================
const verifyPayment = async (req, res) => {
  try {
    const { paymentId } = req.body
    if (!paymentId) return res.status(400).json({ error: 'paymentId is required' })

    const client = mf()
    // Ask MyFatoorah for the authoritative status of this payment.
    const statusResp = await client.post('/v2/GetPaymentStatus', {
      Key: paymentId,
      KeyType: 'PaymentId'
    })
    const d = statusResp.data?.Data
    if (!d) return res.status(502).json({ error: 'No status returned by gateway' })

    const invoiceStatus = d.InvoiceStatus          // "Paid" | "Failed" | "Pending" | ...
    const customerReference = d.CustomerReference   // our Payment row id
    const invoiceId = d.InvoiceId ? String(d.InvoiceId) : null

    // Find our Payment row (prefer CustomerReference, fall back to invoiceId)
    let payment = null
    if (customerReference) {
      payment = await prisma.payment.findUnique({ where: { id: customerReference } }).catch(() => null)
    }
    if (!payment && invoiceId) {
      payment = await prisma.payment.findFirst({ where: { invoiceId } })
    }
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found', invoiceStatus })
    }

    const isPaid = invoiceStatus === 'Paid'
    const newStatus = isPaid ? 'PAID' : (invoiceStatus === 'Pending' ? 'PENDING' : 'FAILED')

    // Update our Payment row
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paymentId: String(paymentId),
        invoiceId: invoiceId || payment.invoiceId,
        rawStatus: invoiceStatus
      }
    })

    // Apply the result: if paid and it's a vendor subscription, activate it.
    if (isPaid && payment.purpose === 'VENDOR_SUBSCRIPTION' && payment.vendorId) {
      const expiry = new Date()
      const type = payment.subscriptionType || 'MONTHLY'
      if (type === 'ANNUAL') {
        expiry.setFullYear(expiry.getFullYear() + 1)
      } else {
        expiry.setMonth(expiry.getMonth() + 1)
      }

      await prisma.vendor.update({
        where: { id: payment.vendorId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionExpiry: expiry,
          ...(type === 'ENROLLMENT' ? { enrollmentPaid: true } : {}),
          ...(type === 'MONTHLY' ? { monthlyFeePaid: true } : {}),
          ...(type === 'ANNUAL' ? { annualRenewalPaid: true } : {})
        }
      })

      // Record the subscription transaction
      await prisma.subscription.create({
        data: {
          vendorId: payment.vendorId,
          type,
          amount: payment.amount,
          note: `MyFatoorah payment ${paymentId}`
        }
      }).catch(() => {})
    }

    // If paid and it's a customer order, confirm the order + store the ref.
    if (isPaid && payment.purpose === 'ORDER' && payment.orderId) {
      await prisma.order.update({
        where: { id: payment.orderId },
        data: {
          status: 'CONFIRMED',
          paymentRef: String(paymentId)
        }
      }).catch(() => {})
    }

    res.json({
      success: isPaid,
      status: newStatus,
      invoiceStatus,
      purpose: payment.purpose,
      orderId: payment.orderId || null,
      amount: payment.amount
    })
  } catch (error) {
    console.error('MYFATOORAH VERIFY ERROR:', error.response?.data || error.message)
    res.status(500).json({ error: 'Payment verification failed' })
  }
}

// ============================================================
// 1b. CREATE ORDER PAYMENT (customer checkout, pay by card)
//     Same MyFatoorah pattern as vendor subscription, but for an
//     existing order. Stores a Payment row with purpose 'ORDER'.
// ============================================================
const createOrderPayment = async (req, res) => {
  try {
    const { orderId } = req.body
    if (!orderId) return res.status(400).json({ error: 'orderId is required' })

    // Look up the order to get its amount and confirm it belongs to the user.
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.userId !== req.userId) {
      return res.status(403).json({ error: 'Not your order' })
    }

    // NOTE: sandbox is Kuwait/KWD. For QAR go-live, send order.totalAmount and
    // switch currency to QAR with a Qatar MyFatoorah account.
    const amount = 5 // KWD test amount in sandbox

    const client = mf()
    const initiate = await client.post('/v2/InitiatePayment', {
      InvoiceAmount: amount,
      CurrencyIso: 'KWD'
    })
    const methods = initiate.data?.Data?.PaymentMethods || []
    if (methods.length === 0) {
      return res.status(502).json({ error: 'No payment methods returned by gateway' })
    }
    const pick =
      methods.find(m => m.PaymentMethodCode === 'vm') ||
      methods.find(m => m.PaymentMethodCode === 'kn') ||
      methods.find(m => m.PaymentMethodCode !== 'ap') ||
      methods[0]

    const payment = await prisma.payment.create({
      data: {
        purpose: 'ORDER',
        orderId,
        amount: Number(amount),
        currency: 'KWD',
        status: 'PENDING'
      }
    })

    const execute = await client.post('/v2/ExecutePayment', {
      PaymentMethodId: pick.PaymentMethodId,
      CustomerName: 'JASPR Customer',
      CustomerEmail: 'customer@jasprmarket.com',
      CustomerMobile: '30568968',
      MobileCountryCode: '+965',
      InvoiceValue: amount,
      DisplayCurrencyIso: 'KWD',
      CallBackUrl: `${FRONTEND}/payment-success`,
      ErrorUrl: `${FRONTEND}/payment-failed`,
      Language: 'en',
      CustomerReference: payment.id
    })

    const data = execute.data?.Data
    const invoiceId = data?.InvoiceId ? String(data.InvoiceId) : null
    const invoiceUrl = data?.PaymentURL || data?.InvoiceURL

    await prisma.payment.update({
      where: { id: payment.id },
      data: { invoiceId, invoiceUrl }
    })

    res.json({ paymentUrl: invoiceUrl, paymentRecordId: payment.id })
  } catch (error) {
    console.error('ORDER PAYMENT INITIATE ERROR:', error.response?.data || error.message)
    res.status(500).json({ error: 'Order payment initialization failed' })
  }
}

module.exports = { createVendorSubscriptionPayment, createOrderPayment, verifyPayment }
