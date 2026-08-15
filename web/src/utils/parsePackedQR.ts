// Parser for Bajaj-style item / case-label QR codes:
//
//   {item}-{qty}_{unit price}
//
// Examples:
//   DK151094-1_210     → item DK151094, qty 1, rate 210
//   36DH4013-10_1354.00 → item 36DH4013, qty 10, rate 1354
//
// Item codes may contain hyphens (KIT-CHAIN-5_6770), so qty and rate are read
// from the right. Returns null for a plain item code, a location code
// (A-01-01-03 — no underscore), or anything else that doesn't match — so it is
// safe to run on every scan and only acts on real packed item labels.
export function parsePackedItemQR(raw: string): { itemCode: string; qty: number; rate: number } | null {
  const value = (raw || '').trim().replace(/[\s\n\r\t]/g, '')
  const separator = value.lastIndexOf('_')
  if (separator <= 0 || separator >= value.length - 1) return null

  const left = value.slice(0, separator)
  const itemSeparator = left.lastIndexOf('-')
  if (itemSeparator <= 0 || itemSeparator >= left.length - 1) return null

  const itemCode = left.slice(0, itemSeparator)
  const qty = Number(left.slice(itemSeparator + 1))
  const rate = Number(value.slice(separator + 1).replace(/,/g, ''))
  if (!itemCode || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) return null

  return { itemCode, qty, rate }
}
