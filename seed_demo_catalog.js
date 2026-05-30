// ============================================================
// JASPR Market — Demo catalog seeder
// ----------------------------------------------------------------
// Creates 4 demo vendors and ~65 products spread across the 4 active
// parent categories (Mobiles, Computers, Audio, Wearables).
//
// Designed for soft-launch demos: realistic product names, plausible
// QAR pricing, varied conditions, and image URLs you can swap with
// one config flag if a particular host doesn't load in your browser.
//
// SAFE TO RE-RUN: vendors are upserted by email; products are
// skipped if the same (vendorSKU, vendorId) already exists.
//
// Usage:  node seed_demo_catalog.js
// ============================================================

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

// ──────────────────────────────────────────────────────────────
// 1. CONFIG — change these without touching the rest of the file
// ──────────────────────────────────────────────────────────────

// 'unsplash'    -> use the curated Unsplash URLs in IMAGE_POOL below
// 'placeholder' -> use placehold.co labeled placeholders (always works)
// 'none'        -> insert products with no images (your 📱 fallback shows)
const IMAGE_STYLE = 'unsplash'

// Default password for all demo vendors — change once you take this live
const DEMO_PASSWORD = 'DemoVendor2026!'

// ──────────────────────────────────────────────────────────────
// 2. DEMO VENDORS — 4 fictional Doha-area stores
// ──────────────────────────────────────────────────────────────
const VENDORS = [
  {
    email: 'doha.tech.hub@jaspr-demo.qa',
    name: 'Ahmed Al-Mansoori',
    storeName: 'Doha Tech Hub',
    description: 'Authorized reseller of major phone brands. Family-run since 2018.',
    isVerified: true
  },
  {
    email: 'pearl.electronics@jaspr-demo.qa',
    name: 'Rashid Hassan',
    storeName: 'Pearl Electronics',
    description: 'Computing specialists — laptops, accessories, and professional workstations.',
    isVerified: true
  },
  {
    email: 'oryx.audio@jaspr-demo.qa',
    name: 'Mariam Al-Kuwari',
    storeName: 'Oryx Audio',
    description: 'Premium audio and lifestyle wearables for Qatar professionals.',
    isVerified: true
  },
  {
    email: 'westbay.mobiles@jaspr-demo.qa',
    name: 'Fahad Al-Thani',
    storeName: 'West Bay Mobiles',
    description: 'New and certified-refurbished smartphones with 7-day return policy.',
    isVerified: false  // one vendor unverified to show badge variety
  }
]

// ──────────────────────────────────────────────────────────────
// 3. IMAGE POOL — curated Unsplash photo IDs by category
//    These IDs come from photos that have been embedded in design
//    tutorials for years. Most should be stable. If one fails to
//    load in your browser, remove that ID from the array and re-run.
// ──────────────────────────────────────────────────────────────
const UNSPLASH_BY_KIND = {
  smartphone: [
    '1511707171634-5f897ff02aa9',
    '1592750475338-74b7b21085ab',
    '1565849904461-04a58ad377e0',
    '1574944985070-8f3ebc6b79d2',
    '1610945265064-0e34e5519bae',
    '1601784551446-20c9e07cdbdb',
    '1604671801908-6f0c6a092c05',
    '1605236453806-6ff36851218e',
    '1556656793-08538906a9f8',
    '1567581935884-3349723552ca'
  ],
  laptop: [
    '1496181133206-80ce9b88a853',
    '1517336714731-489689fd1ca8',
    '1611186871348-b1ce696e52c9',
    '1525547719571-a2d4ac8945e2',
    '1593642632559-0c6d3fc62b89',
    '1531297484001-80022131f5a1',
    '1484788984921-03950022c9ef'
  ],
  headphones: [
    '1505740420928-5e560c06d30e',
    '1583394838336-acd977736f90',
    '1546435770-a3e426bf472b',
    '1487215078519-e21cc028cb29',
    '1572569511254-d8f925fe2cbb',
    '1606220588913-b3aacb4d2f46'
  ],
  earbuds: [
    '1590658268037-6bf12165a8df',
    '1572569511254-d8f925fe2cbb',
    '1606220588913-b3aacb4d2f46'
  ],
  watch: [
    '1523275335684-37898b6baf30',
    '1579586337278-3befd40fd17a',
    '1546868871-7041f2a55e12',
    '1508685096489-7aacd43bd3b1',
    '1542496658-e33a6d0d50f6',
    '1551816230-ef5deaed4a26'
  ],
  keyboard: [
    '1587829741301-dc798b83add3',
    '1541140532154-b024d705b90a',
    '1618384887929-16ec33fab9ef',
    '1595044426077-d36d9236d54a'
  ],
  mouse: [
    '1527814050087-3793815479db',
    '1615663245857-ac93bb7c39e7',
    '1583851665661-bdf7d5d56e85'
  ],
  tablet: [
    '1561154464-82e9adf32764',
    '1542751110-97427bbecf20',
    '1561070791-2526d30994b8'
  ],
  case: [
    '1601593346740-925612772716',
    '1591337676887-a217a6970a8a'
  ]
}

function imageFor(kind, productName, index = 0) {
  if (IMAGE_STYLE === 'none') return []

  if (IMAGE_STYLE === 'placeholder') {
    const text = encodeURIComponent(productName.replace(/\s+/g, '+'))
    return [
      `https://placehold.co/800x800/0f1923/f97316/png?text=${text}`,
      `https://placehold.co/800x800/1a2438/f97316/png?text=${text}+%E2%80%A2+2`
    ]
  }

  // unsplash
  const pool = UNSPLASH_BY_KIND[kind] || UNSPLASH_BY_KIND.smartphone
  const id1 = pool[index % pool.length]
  const id2 = pool[(index + 3) % pool.length]
  return [
    `https://images.unsplash.com/photo-${id1}?w=800&q=80&fit=crop&auto=format`,
    `https://images.unsplash.com/photo-${id2}?w=800&q=80&fit=crop&auto=format`
  ]
}

// ──────────────────────────────────────────────────────────────
// 4. PRODUCTS — 65 items distributed across the 4 active parents
//    `category` MUST match a category name in your DB (case-insensitive).
//    `vendorIdx` is 0..3, indexing into the VENDORS array above.
// ──────────────────────────────────────────────────────────────
const PRODUCTS = [
  // ─── MOBILES (24 products) ─────────────────────────────────
  // — Smartphones
  { vendorIdx: 0, category: 'Smartphones', name: 'Premium 6.7" Smartphone — 256GB Titanium', brand: 'AuroraTech', price: 4999, compareAt: 5499, kind: 'smartphone', condition: 'NEW', stock: 12, codEligible: true, freeDelivery: true,
    desc: 'Flagship 6.7-inch device with triple-lens 48MP camera, A17-equivalent chip, all-day battery, and a titanium frame. Ideal for power users and content creators.' },
  { vendorIdx: 3, category: 'Smartphones', name: 'Pro Max 6.7" Smartphone — 512GB Graphite', brand: 'AuroraTech', price: 5799, compareAt: 6299, kind: 'smartphone', condition: 'NEW', stock: 8, codEligible: true, freeDelivery: true,
    desc: 'Top-tier 6.7" smartphone with 512GB storage, periscope zoom, ProMotion display, and ceramic shield front. The professional choice.' },
  { vendorIdx: 0, category: 'Smartphones', name: 'Compact 6.1" Smartphone — 128GB Blue', brand: 'AuroraTech', price: 3299, compareAt: null, kind: 'smartphone', condition: 'NEW', stock: 15, codEligible: true, freeDelivery: true,
    desc: '6.1-inch OLED, dual-camera 12MP system, IP68 water resistance. Perfect everyday phone in pocket-friendly size.' },
  { vendorIdx: 3, category: 'Smartphones', name: 'Flagship Android Smartphone — 256GB Black', brand: 'NebulaMobile', price: 4499, compareAt: 4999, kind: 'smartphone', condition: 'NEW', stock: 10, codEligible: true, freeDelivery: true,
    desc: '6.8" Dynamic AMOLED 2X, 200MP main sensor, S-Pen included. Built for productivity and creativity.' },
  { vendorIdx: 0, category: 'Smartphones', name: 'Mid-range Android Phone — 128GB Lavender', brand: 'NebulaMobile', price: 2199, compareAt: 2499, kind: 'smartphone', condition: 'NEW', stock: 22, codEligible: true, freeDelivery: false,
    desc: '6.6" 120Hz display, 50MP triple-camera, 25W fast charging. Excellent value at the mid-tier.' },
  { vendorIdx: 3, category: 'Smartphones', name: 'Refurbished 6.1" Smartphone — 128GB White', brand: 'AuroraTech', price: 2199, compareAt: 3299, kind: 'smartphone', condition: 'LIKE_NEW', stock: 5, codEligible: true, freeDelivery: false,
    desc: 'Certified refurbished previous-gen flagship. Cosmetic Grade A, new battery, 90-day warranty.' },
  { vendorIdx: 0, category: 'Smartphones', name: 'Budget Android — 64GB Black', brand: 'SwiftCell', price: 799, compareAt: 999, kind: 'smartphone', condition: 'NEW', stock: 30, codEligible: true, freeDelivery: false,
    desc: '6.5" HD+, 13MP camera, 5000mAh battery. Reliable entry-level smartphone with 1-year warranty.' },
  { vendorIdx: 3, category: 'Smartphones', name: 'Gaming Smartphone — 12GB RAM, 256GB', brand: 'PhoenixMobile', price: 3799, compareAt: 4199, kind: 'smartphone', condition: 'NEW', stock: 7, codEligible: true, freeDelivery: true,
    desc: 'Snapdragon 8 Gen 3, 144Hz AMOLED, dual cooling fans, RGB back panel. Built for mobile gamers.' },
  { vendorIdx: 0, category: 'Smartphones', name: 'Foldable Smartphone — 256GB Hinge Edition', brand: 'NebulaMobile', price: 6999, compareAt: 7799, kind: 'smartphone', condition: 'NEW', stock: 4, codEligible: true, freeDelivery: true,
    desc: 'Inner 7.6" foldable AMOLED, multitasking support, S-Pen compatible. Cutting-edge form factor.' },
  { vendorIdx: 3, category: 'Smartphones', name: 'Pre-owned 6.1" Smartphone — 64GB Gold', brand: 'AuroraTech', price: 1499, compareAt: 2299, kind: 'smartphone', condition: 'GOOD', stock: 3, codEligible: true, freeDelivery: false,
    desc: 'Used in good cosmetic condition. Fully functional, 7-day return guarantee.' },
  // — Mobile Covers
  { vendorIdx: 0, category: 'Mobile Covers', name: 'Premium Leather Phone Case — Universal 6.7"', brand: 'CaseMate Pro', price: 149, compareAt: 199, kind: 'case', condition: 'NEW', stock: 50, codEligible: true, freeDelivery: false,
    desc: 'Genuine leather, MagSafe-compatible, card slot. Fits all major 6.7" flagship phones.' },
  { vendorIdx: 0, category: 'Mobile Covers', name: 'Rugged Armor Case — 6.1" Smartphone', brand: 'CaseMate Pro', price: 89, compareAt: 120, kind: 'case', condition: 'NEW', stock: 75, codEligible: true, freeDelivery: false,
    desc: 'Military-grade drop protection. Raised bezels protect screen and camera. Black.' },
  { vendorIdx: 3, category: 'Mobile Covers', name: 'Clear TPU Case Pack (3-pack) — Mixed Sizes', brand: 'ClearShield', price: 59, compareAt: 89, kind: 'case', condition: 'NEW', stock: 100, codEligible: true, freeDelivery: false,
    desc: 'Anti-yellowing clear TPU. Shows off your phone color. Three popular sizes included.' },
  { vendorIdx: 0, category: 'Mobile Covers', name: 'Magnetic Wallet Case — 6.7" Black', brand: 'CaseMate Pro', price: 199, compareAt: null, kind: 'case', condition: 'NEW', stock: 25, codEligible: true, freeDelivery: false,
    desc: 'Detachable magnetic wallet holds 3 cards. Premium leather finish, kickstand built in.' },
  // — Accessories (chargers, cables, screen protectors)
  { vendorIdx: 0, category: 'Accessories', name: '65W GaN USB-C Charger — Multi-Device', brand: 'PowerCore', price: 179, compareAt: 229, kind: 'smartphone', condition: 'NEW', stock: 40, codEligible: true, freeDelivery: false,
    desc: 'Compact GaN charger, 65W output, charges laptop + phone + earbuds simultaneously.' },
  { vendorIdx: 3, category: 'Accessories', name: 'Braided USB-C to USB-C Cable — 2m', brand: 'PowerCore', price: 49, compareAt: 79, kind: 'smartphone', condition: 'NEW', stock: 120, codEligible: true, freeDelivery: false,
    desc: 'Durable braided nylon, 100W power delivery, 2-meter length. Lifetime tangle-free.' },
  { vendorIdx: 0, category: 'Accessories', name: '20W MagSafe Wireless Charger Stand', brand: 'PowerCore', price: 219, compareAt: 269, kind: 'smartphone', condition: 'NEW', stock: 30, codEligible: true, freeDelivery: false,
    desc: 'MagSafe-compatible 20W wireless charging stand. Adjustable angle, perfect for nightstand.' },
  { vendorIdx: 3, category: 'Accessories', name: 'Tempered Glass Screen Protector (2-pack) — 6.7"', brand: 'ClearShield', price: 79, compareAt: 119, kind: 'smartphone', condition: 'NEW', stock: 80, codEligible: true, freeDelivery: false,
    desc: '9H hardness tempered glass, oleophobic coating, easy installation kit included.' },
  { vendorIdx: 0, category: 'Accessories', name: 'Power Bank — 20,000mAh USB-C PD', brand: 'PowerCore', price: 259, compareAt: 319, kind: 'smartphone', condition: 'NEW', stock: 35, codEligible: true, freeDelivery: false,
    desc: '20,000mAh capacity, 65W USB-C PD, charges laptops. 4-day phone-charging capacity.' },
  { vendorIdx: 3, category: 'Accessories', name: 'Lightning to USB-C Cable — 1m Original Spec', brand: 'PowerCore', price: 59, compareAt: null, kind: 'smartphone', condition: 'NEW', stock: 150, codEligible: true, freeDelivery: false,
    desc: 'MFi-certified Lightning cable, 1-meter, supports fast charging and data sync.' },
  // — Tablets
  { vendorIdx: 1, category: 'Tablets', name: 'Premium 11" Tablet — 128GB Wi-Fi', brand: 'AuroraTech', price: 2499, compareAt: 2799, kind: 'tablet', condition: 'NEW', stock: 12, codEligible: true, freeDelivery: true,
    desc: '11-inch Liquid Retina display, M-series chip, all-day battery. Productivity-ready.' },
  { vendorIdx: 3, category: 'Tablets', name: 'Standard 10.9" Tablet — 64GB Space Gray', brand: 'AuroraTech', price: 1599, compareAt: 1899, kind: 'tablet', condition: 'NEW', stock: 18, codEligible: true, freeDelivery: true,
    desc: '10.9" display, A-series chip, supports stylus and keyboard accessories.' },
  { vendorIdx: 1, category: 'Tablets', name: '12.4" Android Tablet — 256GB with S-Pen', brand: 'NebulaMobile', price: 2899, compareAt: 3199, kind: 'tablet', condition: 'NEW', stock: 6, codEligible: true, freeDelivery: true,
    desc: '12.4" AMOLED display, included S-Pen, DeX mode for desktop-like productivity.' },
  { vendorIdx: 1, category: 'Tablets', name: 'Budget 10" Tablet — 32GB Black', brand: 'SwiftCell', price: 599, compareAt: 799, kind: 'tablet', condition: 'NEW', stock: 25, codEligible: true, freeDelivery: false,
    desc: '10" HD display, quad-core processor, ideal for media consumption and kids.' },

  // ─── COMPUTERS (15 products) ───────────────────────────────
  // — Laptops
  { vendorIdx: 1, category: 'Laptops', name: 'Ultraportable 13" Laptop — M-series, 16GB, 512GB', brand: 'AuroraTech', price: 5299, compareAt: 5799, kind: 'laptop', condition: 'NEW', stock: 8, codEligible: true, freeDelivery: true,
    desc: '13-inch ultraportable with M-series chip, 16GB unified memory, 512GB SSD. Silent fanless design.' },
  { vendorIdx: 1, category: 'Laptops', name: 'Pro 14" Laptop — M-Pro, 18GB, 1TB SSD', brand: 'AuroraTech', price: 7999, compareAt: 8499, kind: 'laptop', condition: 'NEW', stock: 5, codEligible: true, freeDelivery: true,
    desc: 'Pro-grade 14" Liquid Retina XDR, M-Pro chip, 18GB unified memory, 1TB SSD. For creators.' },
  { vendorIdx: 1, category: 'Laptops', name: 'Gaming Laptop — RTX 4060, 16GB, 1TB', brand: 'PhoenixGaming', price: 6499, compareAt: 7299, kind: 'laptop', condition: 'NEW', stock: 6, codEligible: true, freeDelivery: true,
    desc: '15.6" 165Hz display, RTX 4060 GPU, Intel i7 13th gen, 1TB NVMe. RGB keyboard.' },
  { vendorIdx: 1, category: 'Laptops', name: 'Business Laptop 14" — i5, 16GB, 512GB', brand: 'NexusComputing', price: 3299, compareAt: 3899, kind: 'laptop', condition: 'NEW', stock: 12, codEligible: true, freeDelivery: true,
    desc: 'Lightweight 14", Intel i5 12th gen, 16GB DDR5, 512GB SSD. Office-ready with TPM 2.0.' },
  { vendorIdx: 1, category: 'Laptops', name: 'Convertible 2-in-1 Touchscreen — 13" i7, 16GB', brand: 'NexusComputing', price: 4299, compareAt: 4799, kind: 'laptop', condition: 'NEW', stock: 7, codEligible: true, freeDelivery: true,
    desc: '360° hinge, 13" touchscreen, included stylus, Intel i7 13th gen. Tablet + laptop.' },
  { vendorIdx: 1, category: 'Laptops', name: 'Refurbished 13" Ultrabook — i5, 8GB, 256GB', brand: 'NexusComputing', price: 1899, compareAt: 2899, kind: 'laptop', condition: 'LIKE_NEW', stock: 4, codEligible: true, freeDelivery: false,
    desc: 'Certified refurbished, Grade A cosmetic, new battery installed, 6-month warranty.' },
  { vendorIdx: 1, category: 'Laptops', name: 'Budget 15.6" Laptop — Celeron, 8GB, 256GB SSD', brand: 'SwiftCompute', price: 1299, compareAt: 1599, kind: 'laptop', condition: 'NEW', stock: 15, codEligible: true, freeDelivery: false,
    desc: '15.6" Full HD, Intel Celeron, 8GB RAM, 256GB SSD. Entry-level home/student laptop.' },
  // — Keyboards
  { vendorIdx: 1, category: 'Keyboard', name: 'Wireless Mechanical Keyboard — Hot-swappable RGB', brand: 'KeyForge', price: 549, compareAt: 699, kind: 'keyboard', condition: 'NEW', stock: 18, codEligible: true, freeDelivery: false,
    desc: '75% layout, hot-swappable Cherry MX, dual-mode Bluetooth + 2.4GHz, RGB per-key.' },
  { vendorIdx: 1, category: 'Keyboard', name: 'Slim Wireless Keyboard — Multi-device', brand: 'KeyForge', price: 219, compareAt: 269, kind: 'keyboard', condition: 'NEW', stock: 30, codEligible: true, freeDelivery: false,
    desc: 'Low-profile keys, switch between 3 devices, USB-C rechargeable, 6-month battery.' },
  { vendorIdx: 1, category: 'Keyboard', name: 'Gaming Mechanical Keyboard — Full-size RGB', brand: 'PhoenixGaming', price: 379, compareAt: 449, kind: 'keyboard', condition: 'NEW', stock: 20, codEligible: true, freeDelivery: false,
    desc: 'Full-size, red switches, dedicated media keys, USB passthrough, programmable macros.' },
  { vendorIdx: 1, category: 'Keyboard', name: 'Compact 60% Wired Mechanical Keyboard', brand: 'KeyForge', price: 269, compareAt: null, kind: 'keyboard', condition: 'NEW', stock: 22, codEligible: true, freeDelivery: false,
    desc: '60% layout for minimalist desks, PBT keycaps, blue switches, detachable USB-C cable.' },
  // — Mice
  { vendorIdx: 1, category: 'Mouse', name: 'Wireless Ergonomic Mouse — Silent Click', brand: 'KeyForge', price: 159, compareAt: 199, kind: 'mouse', condition: 'NEW', stock: 35, codEligible: true, freeDelivery: false,
    desc: 'Ergonomic vertical design, silent clicks, multi-device pairing, USB-C recharge.' },
  { vendorIdx: 1, category: 'Mouse', name: 'Gaming Mouse — 26K DPI, Lightweight', brand: 'PhoenixGaming', price: 289, compareAt: 349, kind: 'mouse', condition: 'NEW', stock: 25, codEligible: true, freeDelivery: false,
    desc: '26K DPI sensor, 63g lightweight shell, 8 programmable buttons, RGB.' },
  { vendorIdx: 1, category: 'Mouse', name: 'MX-style Productivity Mouse — Multi-Surface', brand: 'KeyForge', price: 329, compareAt: 399, kind: 'mouse', condition: 'NEW', stock: 18, codEligible: true, freeDelivery: false,
    desc: 'Tracks on glass, USB-C fast charging, Flow cross-computer control, premium materials.' },
  { vendorIdx: 1, category: 'Mouse', name: 'Budget Wireless Mouse — 2.4GHz USB', brand: 'SwiftCompute', price: 49, compareAt: 79, kind: 'mouse', condition: 'NEW', stock: 80, codEligible: true, freeDelivery: false,
    desc: 'Reliable 2.4GHz wireless, AA-battery powered, 18-month battery life. Office staple.' },

  // ─── AUDIO (13 products) ───────────────────────────────────
  // — Headphones
  { vendorIdx: 2, category: 'Headphones', name: 'Premium Wireless ANC Headphones — Over-Ear', brand: 'SonicWave', price: 1899, compareAt: 2199, kind: 'headphones', condition: 'NEW', stock: 12, codEligible: true, freeDelivery: true,
    desc: 'Industry-leading active noise cancellation, 30-hour battery, multi-point Bluetooth 5.3.' },
  { vendorIdx: 2, category: 'Headphones', name: 'Studio Reference Headphones — Wired Open-Back', brand: 'AudioCraft', price: 1299, compareAt: 1599, kind: 'headphones', condition: 'NEW', stock: 8, codEligible: true, freeDelivery: true,
    desc: 'Open-back studio reference, neutral tuning, ideal for mixing and audiophile listening.' },
  { vendorIdx: 2, category: 'Headphones', name: 'Mid-range Wireless Headphones — Bass Boost', brand: 'BassPro', price: 549, compareAt: 699, kind: 'headphones', condition: 'NEW', stock: 22, codEligible: true, freeDelivery: false,
    desc: '40-hour battery, deep-bass tuning, foldable design, USB-C fast charge.' },
  { vendorIdx: 2, category: 'Headphones', name: 'Workout Wireless Headphones — Sweatproof', brand: 'SonicWave', price: 399, compareAt: 499, kind: 'headphones', condition: 'NEW', stock: 30, codEligible: true, freeDelivery: false,
    desc: 'IPX5 sweatproof, secure fit, 22-hour battery, voice assistant button.' },
  { vendorIdx: 2, category: 'Headphones', name: 'Budget Wireless Headphones — 50hr Battery', brand: 'EchoBuds', price: 199, compareAt: 249, kind: 'headphones', condition: 'NEW', stock: 45, codEligible: true, freeDelivery: false,
    desc: '50-hour battery, comfortable padding, Bluetooth 5.0, foldable for travel.' },
  // — Bluetooth Headphones / Earbuds
  { vendorIdx: 2, category: 'Bluetooth Headphones', name: 'Premium True Wireless Earbuds — ANC', brand: 'SonicWave', price: 899, compareAt: 1099, kind: 'earbuds', condition: 'NEW', stock: 25, codEligible: true, freeDelivery: false,
    desc: 'Active noise cancellation, transparency mode, wireless charging case, 30hr total.' },
  { vendorIdx: 2, category: 'Bluetooth Headphones', name: 'Sport Wireless Earbuds — Earhook Design', brand: 'BassPro', price: 449, compareAt: 599, kind: 'earbuds', condition: 'NEW', stock: 28, codEligible: true, freeDelivery: false,
    desc: 'Secure earhook fit for running, IPX7 waterproof, 9-hour single charge.' },
  { vendorIdx: 2, category: 'Bluetooth Headphones', name: 'Budget True Wireless Earbuds — Compact Case', brand: 'EchoBuds', price: 179, compareAt: 249, kind: 'earbuds', condition: 'NEW', stock: 50, codEligible: true, freeDelivery: false,
    desc: 'Compact pocket case, touch controls, 24-hour total battery, USB-C.' },
  { vendorIdx: 2, category: 'Bluetooth Headphones', name: 'Open-Ear Bone-Conduction Headphones', brand: 'SonicWave', price: 649, compareAt: 799, kind: 'earbuds', condition: 'NEW', stock: 14, codEligible: true, freeDelivery: false,
    desc: 'Bone-conduction technology, ear-free design, 8-hour battery, ideal for runners.' },
  { vendorIdx: 2, category: 'Bluetooth Headphones', name: 'Gaming Wireless Earbuds — Low Latency', brand: 'PhoenixGaming', price: 379, compareAt: 449, kind: 'earbuds', condition: 'NEW', stock: 18, codEligible: true, freeDelivery: false,
    desc: '50ms gaming-mode latency, dual-device pairing, RGB charging case.' },
  // — General Audio (speakers, etc., filed under "Audio")
  { vendorIdx: 2, category: 'Audio', name: 'Portable Bluetooth Speaker — 360° Sound', brand: 'BassPro', price: 449, compareAt: 549, kind: 'headphones', condition: 'NEW', stock: 20, codEligible: true, freeDelivery: false,
    desc: '360° sound projection, IPX7 waterproof, 16-hour battery, pair two for stereo.' },
  { vendorIdx: 2, category: 'Audio', name: 'Smart Home Speaker — Voice Assistant', brand: 'SonicWave', price: 599, compareAt: 749, kind: 'headphones', condition: 'NEW', stock: 16, codEligible: true, freeDelivery: false,
    desc: 'Multi-room compatible, built-in voice assistant, Wi-Fi + Bluetooth, premium tweeters.' },
  { vendorIdx: 2, category: 'Audio', name: 'Soundbar 2.1ch — Wireless Subwoofer Included', brand: 'AudioCraft', price: 1299, compareAt: 1599, kind: 'headphones', condition: 'NEW', stock: 9, codEligible: true, freeDelivery: true,
    desc: '2.1-channel soundbar with wireless subwoofer, HDMI eARC, Dolby Atmos support.' },

  // ─── WEARABLES (12 products) ───────────────────────────────
  // — Smart Watches
  { vendorIdx: 2, category: 'Smart Watches', name: 'Premium Smartwatch — 45mm Always-On Display', brand: 'AuroraTech', price: 1799, compareAt: 1999, kind: 'watch', condition: 'NEW', stock: 14, codEligible: true, freeDelivery: true,
    desc: '45mm always-on Retina display, ECG, blood oxygen, 18-hour battery, GPS.' },
  { vendorIdx: 2, category: 'Smart Watches', name: 'Sport Smartwatch — GPS, Heart Rate', brand: 'AuroraTech', price: 1399, compareAt: 1599, kind: 'watch', condition: 'NEW', stock: 16, codEligible: true, freeDelivery: true,
    desc: '40mm aluminum, GPS, heart rate, sleep tracking, swim-proof to 50m.' },
  { vendorIdx: 2, category: 'Smart Watches', name: 'Android Smartwatch — Round AMOLED', brand: 'NebulaMobile', price: 1299, compareAt: 1499, kind: 'watch', condition: 'NEW', stock: 10, codEligible: true, freeDelivery: true,
    desc: '46mm round AMOLED, Wear OS, multi-day battery, ECG, stainless steel case.' },
  { vendorIdx: 2, category: 'Smart Watches', name: 'Budget Fitness Smartwatch — 14-day Battery', brand: 'EchoBuds', price: 299, compareAt: 399, kind: 'watch', condition: 'NEW', stock: 35, codEligible: true, freeDelivery: false,
    desc: '14-day battery life, 1.4" AMOLED, 100+ workout modes, SpO2 monitoring.' },
  { vendorIdx: 2, category: 'Smart Watches', name: 'Premium Hybrid Smartwatch — Stainless 42mm', brand: 'AudioCraft', price: 1199, compareAt: 1399, kind: 'watch', condition: 'NEW', stock: 8, codEligible: true, freeDelivery: false,
    desc: 'Classic hybrid styling with discrete smart features. 6-month battery life.' },
  { vendorIdx: 2, category: 'Smart Watches', name: 'Children\'s GPS Smartwatch — Pink', brand: 'SwiftCell', price: 449, compareAt: 599, kind: 'watch', condition: 'NEW', stock: 20, codEligible: true, freeDelivery: false,
    desc: 'GPS tracking, two-way calling, SOS button, parent-app pairing. Ages 4-12.' },
  { vendorIdx: 2, category: 'Smart Watches', name: 'Refurbished 44mm Smartwatch — Like New', brand: 'AuroraTech', price: 899, compareAt: 1399, kind: 'watch', condition: 'LIKE_NEW', stock: 5, codEligible: true, freeDelivery: false,
    desc: 'Certified refurbished previous-gen smartwatch. Grade A, new battery, 6-month warranty.' },
  // — Smart Watch (legacy singular cat — some DBs have both)
  { vendorIdx: 2, category: 'Smart Watch', name: 'Premium Smartwatch — 41mm Sport Loop', brand: 'AuroraTech', price: 1599, compareAt: null, kind: 'watch', condition: 'NEW', stock: 12, codEligible: true, freeDelivery: true,
    desc: '41mm aluminum, sport loop band included, ECG, all-day battery, GPS.' },
  { vendorIdx: 2, category: 'Smart Watch', name: 'Fitness Band — Slim Display', brand: 'EchoBuds', price: 199, compareAt: 269, kind: 'watch', condition: 'NEW', stock: 40, codEligible: true, freeDelivery: false,
    desc: 'Slim band design, 1.1" AMOLED, 14-day battery, 24-hour heart rate.' },
  { vendorIdx: 2, category: 'Smart Watch', name: 'Diving Smartwatch — Titanium 49mm', brand: 'AudioCraft', price: 3499, compareAt: 3999, kind: 'watch', condition: 'NEW', stock: 4, codEligible: true, freeDelivery: true,
    desc: 'Titanium case, recreational scuba dive computer, dual-frequency GPS, 36-hr battery.' },
  { vendorIdx: 2, category: 'Smart Watch', name: 'Kids Activity Tracker — Color Touchscreen', brand: 'SwiftCell', price: 249, compareAt: 329, kind: 'watch', condition: 'NEW', stock: 28, codEligible: true, freeDelivery: false,
    desc: 'Color touchscreen, games, step counter, alarm. Designed for kids 6+.' },
  { vendorIdx: 2, category: 'Smart Watch', name: 'Pro Trail Running Watch — 100hr GPS', brand: 'PhoenixGaming', price: 2299, compareAt: 2599, kind: 'watch', condition: 'NEW', stock: 6, codEligible: true, freeDelivery: true,
    desc: 'Multi-band GPS, 100-hour GPS battery, topo maps, training metrics for ultras.' }
]

// ──────────────────────────────────────────────────────────────
// 5. SCRIPT
// ──────────────────────────────────────────────────────────────
async function run() {
  console.log('\n=== JASPR Demo Catalog Seeder ===\n')
  console.log(`Image mode: ${IMAGE_STYLE}`)
  console.log(`Products in script: ${PRODUCTS.length}`)
  console.log(`Demo vendors: ${VENDORS.length}\n`)

  // ── Step 1: ensure demo vendors exist (with their user accounts) ──
  console.log('Step 1: Creating demo vendors…')
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const vendorRecords = []
  for (const v of VENDORS) {
    let user = await prisma.user.findUnique({ where: { email: v.email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: v.email,
          name: v.name,
          passwordHash,
          role: 'VENDOR',
          approvalStatus: 'ACTIVE'
        }
      })
      console.log(`  +  User: ${v.email}`)
    } else {
      console.log(`  =  User exists: ${v.email}`)
    }
    let vendor = await prisma.vendor.findUnique({ where: { userId: user.id } })
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          userId: user.id,
          storeName: v.storeName,
          description: v.description,
          status: 'APPROVED',
          isVerified: v.isVerified,
          subscriptionStatus: 'ACTIVE'
        }
      })
      console.log(`  +  Vendor: ${v.storeName}${v.isVerified ? ' (verified ✓)' : ''}`)
    } else {
      // Make sure status/verification are correct in case of re-run
      vendor = await prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          status: 'APPROVED',
          isVerified: v.isVerified,
          subscriptionStatus: 'ACTIVE',
          storeName: v.storeName,
          description: v.description
        }
      })
      console.log(`  =  Vendor exists: ${v.storeName}`)
    }
    vendorRecords.push(vendor)
  }

  // ── Step 2: build category-name → id map (case-insensitive) ──
  console.log('\nStep 2: Resolving categories…')
  const cats = await prisma.category.findMany()
  const catByName = {}
  for (const c of cats) catByName[c.name.toLowerCase()] = c
  // verify every product's category exists
  const missingCats = new Set()
  for (const p of PRODUCTS) {
    if (!catByName[p.category.toLowerCase()]) missingCats.add(p.category)
  }
  if (missingCats.size > 0) {
    console.log(`  ⚠  Missing categories (will be created):`)
    for (const m of missingCats) {
      const slug = m.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const created = await prisma.category.create({ data: { name: m, slug } })
      catByName[m.toLowerCase()] = created
      console.log(`     +  ${m} (created, slug: ${slug})`)
    }
  } else {
    console.log('  ✓  All product categories exist')
  }

  // ── Step 3: insert products (skip if (vendorId, vendorSKU) collision) ──
  console.log('\nStep 3: Inserting products…')
  let inserted = 0
  let skipped = 0
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i]
    const vendor = vendorRecords[p.vendorIdx]
    const category = catByName[p.category.toLowerCase()]
    if (!category) {
      console.log(`  ✗  ${p.name} — category "${p.category}" missing, skipped`)
      skipped++
      continue
    }
    // Generate a stable SKU so re-runs are idempotent
    const sku = `DEMO-${vendor.id.slice(0, 6).toUpperCase()}-${i + 1}`
    const existing = await prisma.product.findFirst({
      where: { vendorId: vendor.id, vendorSKU: sku }
    })
    if (existing) {
      skipped++
      continue
    }
    const images = imageFor(p.kind, p.name, i)
    await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: p.name,
        description: p.desc,
        price: p.price,
        compareAtPrice: p.compareAt || null,
        stockQty: p.stock || 10,
        images: images,
        condition: p.condition || 'NEW',
        brand: p.brand || null,
        vendorSKU: sku,
        codEligible: p.codEligible !== false,
        freeDeliveryEligible: !!p.freeDelivery,
        isActive: true
      }
    })
    inserted++
    if (inserted % 10 === 0) console.log(`  …  ${inserted} products inserted`)
  }

  console.log(`\n✓ Done. Inserted: ${inserted}, Skipped (already existed): ${skipped}`)

  // ── Step 4: summary by parent category ──
  console.log('\nStep 4: Final catalog summary by parent category:')
  const parents = await prisma.category.findMany({
    where: { parentId: null },
    include: {
      _count: { select: { products: true } },
      children: { include: { _count: { select: { products: true } } } }
    },
    orderBy: { name: 'asc' }
  })
  for (const par of parents) {
    const childTotal = par.children.reduce((s, c) => s + c._count.products, 0)
    const total = par._count.products + childTotal
    console.log(`  📁 ${par.name}: ${total} product(s)`)
    for (const c of par.children) {
      if (c._count.products > 0) console.log(`     └─ ${c.name}: ${c._count.products}`)
    }
  }

  console.log('\nNext steps:')
  console.log('  • Visit http://localhost:3001/products to see the catalog')
  console.log('  • If Unsplash images don\'t load, change IMAGE_STYLE to "placeholder" and re-run')
  console.log('  • Demo vendor passwords are all: ' + DEMO_PASSWORD)
  console.log()
  await prisma.$disconnect()
}

run().catch(async e => {
  console.error('\n✗ ERROR:', e.message)
  console.error(e.stack)
  await prisma.$disconnect()
  process.exit(1)
})
