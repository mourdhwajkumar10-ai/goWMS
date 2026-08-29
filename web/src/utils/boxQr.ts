export function canonicalBoxNo(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Box QR format: BOXNO~part~mrp e.g. S209085-8072331-2004~52JF1941~1213 or 0044832599-E0008~1
  const beforeTilde = s.split("~")[0] ?? s;
  const beforePipe = beforeTilde.split("|")[0] ?? beforeTilde;
  return beforePipe.trim().replace(/\s+/g, "").toUpperCase();
}

export function extractBoxCandidates(raw: string): string[] {
  const canonical = canonicalBoxNo(raw);
  const upper = String(raw || "").toUpperCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (v: string) => {
    const c = String(v || "").trim().toUpperCase();
    if (!c || seen.has(c)) return;
    seen.add(c);
    out.push(c);
  };
  if (canonical) add(canonical);
  // Regex fallbacks: S-prefixed and E-suffix boxes
  const reS = /\bS\d{5,}-\d{4,}-\d{3,}\b/g;
  const reE = /\b\d{7,10}-[A-Z]\d{3,4}\b/g;
  for (const re of [reS, reE]) {
    const ms = upper.match(re);
    if (ms) for (const m of ms) add(m);
  }
  if (canonical.startsWith("S") && canonical.length > 1) add(canonical.slice(1));
  return out;
}
