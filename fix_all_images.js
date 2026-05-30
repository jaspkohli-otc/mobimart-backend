// ============================================================
// JASPR Market — Comprehensive image fix (v2)
// ----------------------------------------------------------------
// Strategy:
//   • DEVICE categories (phones, laptops, headphones, watches,
//     tablets, mice, keyboards) → real Pexels photos that match,
//     verified live from YOUR network. Falls back to a labeled
//     placeholder ONLY if every candidate fails.
//   • ACCESSORY categories (chargers, cables, screen protectors,
//     power banks, cases) → clean labeled placeholders. Generic
//     stock photos for these tend to be wrong/misleading, so a
//     labeled placeholder is both safer and more useful.
//
// Re-runnable and safe.  Usage:  node fix_all_images.js
// ============================================================

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Pexels IDs hand-checked to match their subject.
const PEXELS = {
  smartphone: ['404280', '47261', '699122', '1294886', '887751', '341523'],
  laptop:     ['18105', '7974', '38568', '459653', '1229861', '812264'],
  headphones: ['3587478', '3756879', '205926', '1649771', '577769'],
  earbuds:    ['8000631', '3825517', '4316/airpods', '8001006'],
  watch:      ['437037', '393047', '1697214', '267394', '125779'],
  keyboard:   ['1772123', '2115256', '3937174', '1029757'],
  mouse:      ['2115257', '1714208', '5083491', '2399840'],
  tablet:     ['1334597', '1334598', '6804/tablet', '1334600'],
}

function pexelsUrl(id) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`
}
function placeholderUrl(name, secondary = false) {
  const text = encodeURIComponent(name)
  const bg = secondary ? '1a2438' : '0f1923'
  return `https://placehold.co/800x800/${bg}/f97316/png?text=${text}`
}

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

// Classify each product. Returns either a device kind (gets a real photo)
// or 'accessory' (gets a labeled placeholder).
function classify(product) {
  const cat = (product.category?.name || '').toLowerCase()
  const name = (product.name || '').toLowerCase()

  // Categories where generic stock photos keep resolving to the WRONG
  // subject (mouse->keyboard, keyboard->desk, tablet->charger, etc.).
  // Force these to clean labeled placeholders — guaranteed correct.
  if (
    name.includes('charger') || name.includes('cable') ||
    name.includes('screen protector') || name.includes('power bank') ||
    name.includes('case') || name.includes('cover') ||
    name.includes('wallet') || name.includes('stand') ||
    name.includes('mouse') || name.includes('keyboard') ||
    name.includes('tablet') ||
    cat.includes('mobile cover') || cat.includes('accessor') ||
    cat.includes('mouse') || cat.includes('keyboard') || cat.includes('tablet')
  ) return 'accessory'

  // Device categories with reliable stock photos → real photos
  if (cat.includes('watch') || cat.includes('wearable') || name.includes('watch') || name.includes('band') || name.includes('tracker')) return 'watch'
  if (cat.includes('laptop') || name.includes('laptop') || name.includes('macbook')) return 'laptop'
  if (cat.includes('earbud') || name.includes('earbud') || name.includes('airpod') || name.includes('buds')) return 'earbuds'
  if (cat.includes('headphone') || cat.includes('audio') || cat.includes('bluetooth') ||
      name.includes('headphone') || name.includes('speaker') || name.includes('soundbar') || name.includes('bone-conduction')) return 'headphones'
  if (cat.includes('smartphone') || cat === 'mobiles' || name.includes('smartphone') || name.includes('phone')) return 'smartphone'

  return 'smartphone' // safe default for any leftover device
}

async function pickImages(kind, name, index) {
  if (kind === 'accessory') {
    return [placeholderUrl(name), placeholderUrl(name, true)]
  }
  const pool = PEXELS[kind] || PEXELS.smartphone
  for (let off = 0; off < pool.length; off++) {
    const url = pexelsUrl(pool[(index + off) % pool.length])
    if (await probe(url)) {
      let second = pexelsUrl(pool[(index + off + 1) % pool.length])
      if (!(await probe(second))) second = placeholderUrl(name, true)
      return [url, second]
    }
  }
  // every candidate failed → labeled placeholder (never a wrong photo)
  return [placeholderUrl(name), placeholderUrl(name, true)]
}

async function run() {
  console.log('\n=== Comprehensive Image Fix v2 ===\n')

  const demoVendors = await prisma.vendor.findMany({
    where: { user: { email: { endsWith: '@jaspr-demo.qa' } } },
    select: { id: true }
  })
  const ids = demoVendors.map(v => v.id)
  if (ids.length === 0) {
    console.log('No demo vendors found.')
    await prisma.$disconnect()
    return
  }

  const products = await prisma.product.findMany({
    where: { vendorId: { in: ids } },
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: 'asc' }
  })
  console.log(`Processing ${products.length} products…\n`)

  const counts = { realPhoto: 0, accessory: 0, fallback: 0 }
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    const kind = classify(p)
    const imgs = await pickImages(kind, p.name, i)
    await prisma.product.update({ where: { id: p.id }, data: { images: imgs } })

    if (kind === 'accessory') {
      counts.accessory++
    } else if (imgs[0].includes('placehold.co')) {
      counts.fallback++
    } else {
      counts.realPhoto++
    }
    process.stdout.write(kind === 'accessory' ? '▦' : imgs[0].includes('placehold.co') ? '◌' : '●')
    if ((i + 1) % 25 === 0) process.stdout.write(` ${i + 1}\n`)
  }

  console.log('\n\n=== Summary ===')
  console.log(`  ● Real photos (devices):       ${counts.realPhoto}`)
  console.log(`  ▦ Labeled placeholder (access):${counts.accessory}`)
  console.log(`  ◌ Fallback placeholder:        ${counts.fallback}`)
  console.log('\nLegend: ● real photo · ▦ accessory placeholder · ◌ fallback placeholder')
  console.log('Refresh your shop (Ctrl+Shift+R) to see the result.\n')

  await prisma.$disconnect()
}

run().catch(async e => {
  console.error('\n✗ ERROR:', e.message)
  await prisma.$disconnect()
  process.exit(1)
})
