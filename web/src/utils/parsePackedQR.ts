// Parser for Bajaj-style item / case-label QR codes:
//
//   {item}-{qty}_{pack total}
//
// The trailing number is the MRP printed on that QR (pack total), not unit price.
//
// Examples:
//   36DH4013-10_13540 → item 36DH4013, qty 10, rate 1354 (13540 / 10)
//   36DH4013-1_1354   → item 36DH4013, qty 1,  rate 1354
//   DK151094-1_210    → item DK151094, qty 1,  rate 210
//
// Item codes may contain hyphens (KIT-CHAIN-5_6770), so qty and amount are read
// from the right. Returns null for a plain item code, a location code
// (A-01-01-03 — no underscore), or anything else that doesn't match — so it is
// safe to run on every scan and only acts on real packed item labels.
export function parsePackedItemQR(raw: string): { itemCode: string; qty: number; rate: number; amount: number } | null {
  const value = (raw || '').trim().replace(/[\s\n\r\t]/g, '')
  const separator = value.lastIndexOf('_')
  if (separator <= 0 || separator >= value.length - 1) return null

  const left = value.slice(0, separator)
  const itemSeparator = left.lastIndexOf('-')
  if (itemSeparator <= 0 || itemSeparator >= left.length - 1) return null

  const itemCode = left.slice(0, itemSeparator)
  const qty = Number(left.slice(itemSeparator + 1))
  const amount = Number(value.slice(separator + 1).replace(/,/g, ''))
  if (!itemCode || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(amount) || amount < 0) return null

  const rate = Math.round((amount / qty) * 100) / 100
  return { itemCode, qty, rate, amount: Math.round(amount * 100) / 100 }
}
