// ============================================================
// JASPR Market — Self-healing image fix
// ----------------------------------------------------------------
// Goes through every demo product (those owned by a @jaspr-demo.qa
// vendor) and tries each candidate image URL one-by-one. The first
// URL that returns 200 OK from YOUR network is what gets saved.
//
// Hard fallback: placehold.co with the product's name labeled in the
// JASPR brand colors. That URL is virtually guaranteed to work.
//
// Re-runnable: re-run any time without harm. It only updates products
// whose first image fails a current HEAD check.
//
// Usage:  node fix_demo_images.js
// ============================================================

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ──────────────────────────────────────────────────────────────
// 1. URL CANDIDATE POOLS — Pexels first (more reliable hot-link),
//    Unsplash second, placehold.co as universal fallback.
//
//    Pexels URL pattern: https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=800
//    Unsplash URL pattern: https://images.unsplash.com/photo-{ID}?w=800&q=80&fit=crop&auto=format
// ──────────────────────────────────────────────────────────────

const PEXELS = {
  smartphone: [
    '230544',     // person using smartphone + card
    '6969811',    // person holding black smartphone
    '5076511',    // person holding iPhone
    '8938722',    // hands holding smartphone
    '5717947',    // close-up smartphone
    '6237886',    // smartphone shopping
    '6969933',    // smartphone payment
    '8938731',    // smartphone shopping
    '699122',     // black smartphone
    '1092644',    // smartphone on table
  ],
  laptop: [
    '34577',      // laptop keyboard
    '234352',     // laptop hand
    '8938663',    // laptop + smartphone
    '6207736',    // laptop shopping
    '7974',       // macbook style
    '18105',      // open laptop
    '5474028',    // laptop dark bg
  ],
  headphones: [
    '7054538',    // over-ear headphones
    '3587478',    // black headphones
    '3756879',    // headphones desk
    '1591/music', // music headphones
    '3394650',    // headphones product
  ],
  earbuds: [
    '7054538',    // shared with headphones for now
    '3394650',
  ],
  watch: [
    '267394',     // smartwatch on wrist
    '393047',     // smartwatch close-up
    '3850907',    // smart watch product
    '1334602',    // watch product shot
  ],
  keyboard: [
    '3937174',    // mechanical keyboard
    '3563569',    // keyboard top down
    '5474028',    // laptop with keyboard
  ],
  mouse: [
    '5474028',    // laptop with mouse area
    '7974',       // computer mouse near
  ],
  tablet: [
    '1334601',    // tablet on desk
    '6794838',    // tablet with stylus
    '11952305',   // woman on tablet
  ],
  case: [
    '4068314',    // phone case
    '699122',     // shared with smartphone
  ]
}

const UNSPLASH = {
  smartphone: [
    '1592750475338-74b7b21085ab',
    '1565849904461-04a58ad377e0',
    '1610945265064-0e34e5519bae',
    '1601784551446-20c9e07cdbdb',
  ],
  laptop: [
    '1496181133206-80ce9b88a853',
    '1517336714731-489689fd1ca8',
    '1593642632559-0c6d3fc62b89',
  ],
  headphones: [
    '1505740420928-5e560c06d30e',
    '1583394838336-acd977736f90',
    '1487215078519-e21cc028cb29',
  ],
  earbuds: [
    '1590658268037-6bf12165a8df',
    '1572569511254-d8f925fe2cbb',
  ],
  watch: [
    '1523275335684-37898b6baf30',
    '1546868871-7041f2a55e12',
    '1508685096489-7aacd43bd3b1',
  ],
  keyboard: [
    '1587829741301-dc798b83add3',
    '1541140532154-b024d705b90a',
  ],
  mouse: [
    '1527814050087-3793815479db',
    '1615663245857-ac93bb7c39e7',
  ],
  tablet: [
    'ME7AkkDUBcA',  // verified-published tablet photo Feb 2024
    '1561070791-2526d30994b8',
  ],
  case: [
    '1601593346740-925612772716',
  ]
}

function pexelsUrl(id) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`
}
function unsplashUrl(id) {
  return `https://images.unsplash.com/photo-${id}?w=800&q=80&fit=crop&auto=format`
}
function placeholderUrl(name, secondary = false) {
  // Brand-colored labeled placeholder, virtually guaranteed to load.
  const text = encodeURIComponent(name)
  const bg = secondary ? '1a2438' : '0f1923'
  return `https://placehold.co/800x800/${bg}/f97316/png?text=${text}`
}

function candidatesFor(kind, name, index) {
  const out = []
  const pex = PEXELS[kind] || PEXELS.smartphone
  const un = UNSPLASH[kind] || UNSPLASH.smartphone
  // Interleave Pexels then Unsplash so we get variety even if one platform
  // is blocked. 4 candidates per slot is enough to find a working URL.
  out.push(pexelsUrl(pex[index % pex.length]))
  out.push(unsplashUrl(un[index % un.length]))
  out.push(pexelsUrl(pex[(index + 2) % pex.length]))
  out.push(unsplashUrl(un[(index + 1) % un.length]))
  // Hard fallback: this always works
  out.push(placeholderUrl(name))
  return out
}

// Identify what kind of image a product needs based on its category/name.
function kindOf(product) {
  const cat = (product.category?.name || '').toLowerCase()
  const name = (product.name || '').toLowerCase()
  if (cat.includes('tablet') || name.includes('tablet')) return 'tablet'
  if (cat.includes('mobile cover') || cat.includes('case') || name.includes(' case')) return 'case'
  if (cat.includes('smartphone') || cat === 'mobiles' || name.includes('smartphone') || name.includes('phone')) return 'smartphone'
  if (cat.includes('laptop') || name.includes('laptop') || name.includes('macbook')) return 'laptop'
  if (cat.includes('keyboard') || name.includes('keyboard')) return 'keyboard'
  if (cat.includes('mouse') || name.includes('mouse')) return 'mouse'
  if (cat.includes('watch') || cat.includes('wearable') || name.includes('watch') || name.includes('band')) return 'watch'
  if (cat.includes('earbud') || name.includes('earbud') || name.includes('airpod')) return 'earbuds'
  if (cat.includes('headphone') || cat.includes('audio') || cat.includes('bluetooth') || name.includes('headphone') || name.includes('speaker') || name.includes('soundbar')) return 'headphones'
  if (cat.includes('accessor') || name.includes('charger') || name.includes('cable') || name.includes('power bank') || name.includes('protector')) return 'smartphone'
  return 'smartphone' // safe default
}

// HEAD-check a URL with a short timeout. Returns true if it returned 200-299.
async function probe(url, timeoutMs = 8000) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctl.signal, redirect: 'follow' })
    clearTimeout(timer)
    return res.ok
  } catch (e) {
    clearTimeout(timer)
    return false
  }
}

// Try candidates in order, return the first URL that returns 200.
async function firstWorking(urls) {
  for (const u of urls) {
    const ok = await probe(u)
    if (ok) return { url: u, ok: true }
  }
  // Should not be reachable since placehold.co is the last candidate
  return { url: urls[urls.length - 1], ok: false }
}

// ──────────────────────────────────────────────────────────────
// 2. SCRIPT
// ──────────────────────────────────────────────────────────────
async function run() {
  console.log('\n=== JASPR Self-Healing Image Fix ===\n')

  // Find all demo vendors (email ends with @jaspr-demo.qa)
  const demoVendors = await prisma.vendor.findMany({
    where: { user: { email: { endsWith: '@jaspr-demo.qa' } } },
    select: { id: true, storeName: true }
  })
  if (demoVendors.length === 0) {
    console.log('No demo vendors found. Run seed_demo_catalog.js first.')
    await prisma.$disconnect()
    return
  }
  const demoVendorIds = demoVendors.map(v => v.id)
  console.log(`Found ${demoVendors.length} demo vendor(s):`)
  for (const v of demoVendors) console.log(`  • ${v.storeName}`)

  // Pull all their products + category
  const products = await prisma.product.findMany({
    where: { vendorId: { in: demoVendorIds } },
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: 'asc' }
  })
  console.log(`\nChecking ${products.length} product image(s)…\n`)

  let kept = 0, healed = 0, fellback = 0, errors = 0

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    const currentImages = Array.isArray(p.images) ? p.images : []
    const firstUrl = currentImages[0]

    // Step 1: probe the current image
    let currentOk = false
    if (firstUrl) currentOk = await probe(firstUrl)

    if (currentOk) {
      // Already loading fine — leave it alone
      kept++
      process.stdout.write(`✓`)
      if ((i + 1) % 20 === 0) process.stdout.write(` ${i + 1}/${products.length}\n`)
      continue
    }

    // Step 2: find a working replacement
    const kind = kindOf(p)
    const candidates = candidatesFor(kind, p.name, i)
    const result = await firstWorking(candidates)
    // We also want a second image (gallery). Use the next candidate, falling
    // back to a placeholder variant.
    let secondUrl = candidates.find(u => u !== result.url) || placeholderUrl(p.name, true)
    const secondOk = await probe(secondUrl)
    if (!secondOk) secondUrl = placeholderUrl(p.name, true)

    try {
      await prisma.product.update({
        where: { id: p.id },
        data: { images: [result.url, secondUrl] }
      })
      if (result.url.includes('placehold.co')) {
        fellback++
        process.stdout.write(`◌`)
      } else {
        healed++
        process.stdout.write(`↻`)
      }
    } catch (e) {
      errors++
      process.stdout.write(`✗`)
    }
    if ((i + 1) % 20 === 0) process.stdout.write(` ${i + 1}/${products.length}\n`)
  }

  console.log('\n\n=== Summary ===')
  console.log(`  ✓ Kept (working):        ${kept}`)
  console.log(`  ↻ Healed (real photo):   ${healed}`)
  console.log(`  ◌ Fallback (placeholder):${fellback}`)
  if (errors > 0) console.log(`  ✗ Errors:                ${errors}`)
  console.log()
  console.log(`Refresh your shop page (Ctrl+Shift+R) to see the result.`)

  await prisma.$disconnect()
}

run().catch(async e => {
  console.error('\n✗ ERROR:', e.message)
  console.error(e.stack)
  await prisma.$disconnect()
  process.exit(1)
})
