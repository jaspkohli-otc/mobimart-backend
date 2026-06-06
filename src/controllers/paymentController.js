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

// ── Callback URLs ────────────────────────────────────────────────
// MyFatoorah only accepts http:// or https:// URLs for callbacks.
// We use the live HTTPS pages on jasprmarket.com.
// After payment the website verifies the payment, then the customer
// taps "Check Payment Status" or the app auto-detects via polling.
const CALLBACK_SUCCESS = process.env.FRONTEND_URL
  ? `${process.env.FRONTEND_URL}/payment-success`
  : 'https://www.jasprmarket.com/payment-success'
const CALLBACK_FAILED = process.env.FRONTEND_URL
  ? `${process.env.FRONTEND_URL}/payment-failed`
  : 'https://www.jasprmarket.com/payment-failed'

// ============================================================
// 1. CREATE VENDOR SUBSCRIPTION PAYMENT
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
    // Prefer VISA/MASTER over Apple Pay (Apple Pay returns no redirect URL)
    const pick =
      methods.find(m => m.PaymentMethodCode === 'vm') ||
      methods.find(m => m.PaymentMethodCode === 'kn') ||
      methods.find(m => m.PaymentMethodCode !== 'ap') ||
      methods[0]
    const paymentMethodId = pick.PaymentMethodId

    // Step 2: pre-create a Payment row
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

    // Step 3: ExecutePayment — deep link callbacks so Android closes browser and returns to app
    const execute = await client.post('/v2/ExecutePayment', {
      PaymentMethodId: paymentMethodId,
      CustomerName: 'JASPR Vendor',
      CustomerEmail: 'vendor@jasprmarket.com',
      CustomerMobile: '30568968',
      MobileCountryCode: '+965',
      InvoiceValue: amount,
      DisplayCurrencyIso: 'KWD',
      CallBackUrl: `${CALLBACK_SUCCESS}?paymentId={PaymentId}&ref=${payment.id}`,
      ErrorUrl: `${CALLBACK_FAILED}?ref=${payment.id}`,
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
    console.error('MYFATOORAH INITIATE ERROR:', error.response?.data || error.message)
    res.status(500).json({ error: 'Payment initialization failed' })
  }
}

// ============================================================
// 2. VERIFY PAYMENT (called from the app after deep link callback)
// ============================================================
const verifyPayment = async (req, res) => {
  try {
    const { paymentId } = req.body
    if (!paymentId) return res.status(400).json({ error: 'paymentId is required' })

    const client = mf()
    const statusResp = await client.post('/v2/GetPaymentStatus', {
      Key: paymentId,
      KeyType: 'PaymentId'
    })
    const d = statusResp.data?.Data
    if (!d) return res.status(502).json({ error: 'No status returned by gateway' })

    const invoiceStatus = d.InvoiceStatus
    const customerReference = d.CustomerReference
    const invoiceId = d.InvoiceId ? String(d.InvoiceId) : null

    // Find our Payment row
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

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paymentId: String(paymentId),
        invoiceId: invoiceId || payment.invoiceId,
        rawStatus: invoiceStatus
      }
    })

    // Activate vendor subscription if paid
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

      await prisma.subscription.create({
        data: {
          vendorId: payment.vendorId,
          type,
          amount: payment.amount,
          note: `MyFatoorah payment ${paymentId}`
        }
      }).catch(() => {})
    }

    // Confirm customer order if paid
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
// 3. CREATE ORDER PAYMENT (customer checkout)
// ============================================================
const createOrderPayment = async (req, res) => {
  try {
    const { orderId } = req.body
    if (!orderId) return res.status(400).json({ error: 'orderId is required' })

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.userId !== req.userId) {
      return res.status(403).json({ error: 'Not your order' })
    }

    // NOTE: sandbox uses KWD test amount.
    // For QAR go-live: use order.totalAmount and switch CurrencyIso to 'QAR'
    const amount = 5

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
      // Deep link callbacks — Android closes browser and returns to app automatically
      CallBackUrl: `${CALLBACK_SUCCESS}?paymentId={PaymentId}&ref=${payment.id}&orderId=${orderId}`,
      ErrorUrl: `${CALLBACK_FAILED}?ref=${payment.id}&orderId=${orderId}`,
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
