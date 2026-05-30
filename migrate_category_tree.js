// ============================================================
// JASPR Market — Category tree migration
// ----------------------------------------------------------------
// Builds an 8-parent / N-child category hierarchy so the home page
// (which links to broad categories like /products?category=Mobiles)
// stays in sync with the database (which has granular categories
// like "Smartphones", "Mobile Covers", etc.).
//
// Safe to re-run: uses upserts and idempotent updates.
// Logs every action so you can verify what changed.
// ============================================================

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ──────────────────────────────────────────────────────────────
// 1. Parent categories (the 8 buckets shown on the home page)
//    `existsOnHome: true` means the home page renders this card.
//    `comingSoon: true` flags it for the "Coming Soon" overlay.
// ──────────────────────────────────────────────────────────────
const PARENTS = [
  { name: 'Mobiles',        slug: 'mobiles',        comingSoon: false },
  { name: 'Computers',      slug: 'computers',      comingSoon: false },
  { name: 'Audio',          slug: 'audio',          comingSoon: false },
  { name: 'Wearables',      slug: 'wearables',      comingSoon: false },
  { name: 'Fashion',        slug: 'fashion',        comingSoon: true  },
  { name: 'Beauty',         slug: 'beauty',         comingSoon: true  },
  { name: 'Home & Kitchen', slug: 'home-kitchen',   comingSoon: true  }
]

// ──────────────────────────────────────────────────────────────
// 2. Child -> Parent mapping (case-insensitive child match)
//    Maps EXISTING granular categories to one of the 8 parents.
//    Children not listed here are left untouched (no parent).
// ──────────────────────────────────────────────────────────────
const CHILD_TO_PARENT = {
  // → Mobiles
  'smartphones':       'Mobiles',
  'smartphone':        'Mobiles',
  'mobile':            'Mobiles',
  'mobiles':           'Mobiles',          // same name as parent — handled specially
  'mobile covers':     'Mobiles',
  'mobile cover':      'Mobiles',
  'phone cases':       'Mobiles',
  'phone case':        'Mobiles',
  'accessories':       'Mobiles',          // assumed mobile accessories
  'tablets':           'Mobiles',
  'tablet':            'Mobiles',

  // → Computers
  'laptops':           'Computers',
  'laptop':            'Computers',
  'keyboard':          'Computers',
  'keyboards':         'Computers',
  'mouse':             'Computers',
  'mice':              'Computers',
  'desktops':          'Computers',
  'monitors':          'Computers',

  // → Audio
  'audio':             'Audio',             // same name as parent — handled specially
  'headphones':        'Audio',
  'headphone':         'Audio',
  'bluetooth headphones': 'Audio',
  'earphones':         'Audio',
  'earbuds':           'Audio',
  'speakers':          'Audio',

  // → Wearables
  'smart watch':       'Wearables',
  'smart watches':     'Wearables',
  'smartwatch':        'Wearables',
  'smartwatches':      'Wearables',
  'wearable':          'Wearables',
  'wearables':         'Wearables',        // same name as parent — handled specially
  'fitness bands':     'Wearables'
}

async function run() {
  console.log('\n=== JASPR Category Tree Migration ===\n')

  // STEP 1: ensure all 8 parent categories exist (and are flagged)
  // We add the `comingSoon` info as a slug suffix? No — better keep slug clean.
  // Coming-soon state is computed on the frontend by checking product count.
  console.log('Step 1: Creating parent categories…')
  const parentIds = {}
  for (const p of PARENTS) {
    const existing = await prisma.category.findFirst({
      where: { name: { equals: p.name, mode: 'insensitive' } }
    })
    if (existing) {
      // Make sure it has no parent (parents are top-level)
      if (existing.parentId !== null) {
        await prisma.category.update({
          where: { id: existing.id },
          data: { parentId: null }
        })
        console.log(`  ↻  "${p.name}" promoted to top-level (was a child)`)
      } else {
        console.log(`  ✓  "${p.name}" already a top-level parent`)
      }
      parentIds[p.name] = existing.id
    } else {
      const created = await prisma.category.create({
        data: { name: p.name, slug: p.slug, parentId: null }
      })
      parentIds[p.name] = created.id
      console.log(`  +  Created parent "${p.name}"`)
    }
  }

  // STEP 2: assign children. We re-fetch all categories to see what exists.
  console.log('\nStep 2: Linking child categories to parents…')
  const allCategories = await prisma.category.findMany()

  // Build a set of parent IDs for quick lookup; parents themselves shouldn't
  // be reassigned as children even when their name appears in the map.
  const parentIdSet = new Set(Object.values(parentIds))

  let linked = 0
  let skipped = 0
  for (const cat of allCategories) {
    if (parentIdSet.has(cat.id)) continue // skip parents themselves
    const key = cat.name.trim().toLowerCase()
    const parentName = CHILD_TO_PARENT[key]
    if (!parentName) {
      console.log(`  -  "${cat.name}" has no mapping — leaving as-is`)
      skipped++
      continue
    }
    const parentId = parentIds[parentName]
    if (cat.parentId === parentId) {
      console.log(`  =  "${cat.name}" already linked to "${parentName}"`)
      continue
    }
    await prisma.category.update({
      where: { id: cat.id },
      data: { parentId }
    })
    console.log(`  →  "${cat.name}" linked to "${parentName}"`)
    linked++
  }

  // STEP 3: print the resulting tree for verification
  console.log('\nStep 3: Final tree (parents and their children):')
  const tree = await prisma.category.findMany({
    where: { parentId: null },
    include: { children: { include: { _count: { select: { products: true } } } }, _count: { select: { products: true } } },
    orderBy: { name: 'asc' }
  })
  for (const p of tree) {
    const ownCount = p._count.products
    const childCount = p.children.reduce((s, c) => s + c._count.products, 0)
    console.log(`  📁 ${p.name} (${ownCount} direct + ${childCount} via children)`)
    for (const c of p.children) {
      console.log(`     └─ ${c.name} (${c._count.products})`)
    }
  }

  // Orphans (children with no parent that aren't in our parent list)
  const orphans = allCategories.filter(c => !parentIdSet.has(c.id) && !c.parentId)
  if (orphans.length) {
    console.log('\n⚠️  Orphan categories (no parent, not on home page):')
    for (const o of orphans) console.log(`     • ${o.name}`)
    console.log('  Add their lowercase name to CHILD_TO_PARENT in this script and re-run.')
  }

  console.log(`\n✓ Migration complete. Linked: ${linked}, Skipped: ${skipped}, Orphans: ${orphans.length}\n`)
  await prisma.$disconnect()
}

run().catch(e => {
  console.error('\n✗ ERROR:', e.message)
  prisma.$disconnect()
  process.exit(1)
})
