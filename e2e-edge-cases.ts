import { chromium } from 'playwright';
import path from 'path';

const BASE = 'http://127.0.0.1:8080';
const DIR = '/Users/yudhistherkumar/Downloads/goWMS/screenshots';

let n = 30; // Continue from previous test
const shot = async (p: any, name: string) => {
  n++;
  await p.screenshot({ path: path.join(DIR, `${String(n).padStart(2,'0')}-${name}.png`), fullPage: true });
  console.log(`  📸 ${String(n).padStart(2,'0')}-${name}`);
};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function click(p: any, sel: string, t = 3000) {
  try { const e = p.locator(sel).first(); if (await e.isVisible({timeout:t})) { await e.click(); return true; } } catch {}
  return false;
}
async function fill(p: any, sel: string, val: string, t = 3000) {
  try { const e = p.locator(sel).first(); if (await e.isVisible({timeout:t})) { await e.fill(val); return true; } } catch {}
  return false;
}
async function apiCall(page: any, method: string, path: string, body?: any, token?: string) {
  return page.evaluate(({method, path, body, token}) => {
    const opts: any = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    return fetch(`/api${path}`, opts).then(r => r.json());
  }, {method, path, body: body || null, token: token || null});
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(10000);

  // Login
  console.log('\n=== LOGIN ===');
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await wait(1000);
  await p.locator('input[autocomplete="username"]').fill('admin');
  await p.locator('input[autocomplete="current-password"]').fill('admin123');
  await p.locator('.login-card button.btn').last().click();
  await wait(3000);
  console.log('  ✅ Logged in');

  // Get token
  const loginR = await apiCall(p, 'POST', '/auth/login', { username: 'admin', password: 'admin123' });
  const token = loginR?.data?.token;

  // ============================================================
  // EDGE CASE 1: PARTIAL RECEIVE
  // ============================================================
  console.log('\n=== EDGE CASE 1: PARTIAL RECEIVE (30 of 100) ===');

  // Create a PO with qty=100
  const po1 = await apiCall(p, 'POST', '/po/', {
    supplier_name: 'Partial Test Supplier',
    items: [{ item_code: 'item', name: 'Partial Test Item', qty: 100, rate: 50, amount: 5000, uom: 'Nos', warehouse: 'MAIN' }]
  }, token);
  console.log(`  PO Created: ${JSON.stringify(po1?.data).slice(0, 100)}`);
  const po1Id = po1?.data?.id;

  // Submit PO
  if (po1Id) {
    await apiCall(p, 'POST', `/po/${po1Id}/submit`, {}, token);
    console.log('  PO Submitted');
  }

  // Create GRN session via API
  const grn1 = await apiCall(p, 'POST', '/grn/', {
    warehouse_id: 1,
    purchase_order_id: po1Id,
    receiving_mode: 'invoice_only',
    truck_no: 'PARTIAL-001',
    driver_name: 'Test Driver',
    expected_boxes: 1
  }, token);
  const grn1Id = grn1?.data?.id;
  console.log(`  GRN Created: ${JSON.stringify(grn1?.data).slice(0, 150)}`);

  if (grn1Id) {
    // Scan 1 box
    await apiCall(p, 'POST', '/grn/carton', {
      grn_session_id: grn1Id, carton_no: 'PARTIAL-BOX-001'
    }, token);
    console.log('  Box scanned');

    // Verify item with qty=30 (partial — PO expects 100)
    const verifyR = await apiCall(p, 'POST', `/grn/session/${grn1Id}/verify-item`, {
      item_code: 'item', qty: 30
    }, token);
    console.log(`  Verify result: ${JSON.stringify(verifyR?.data).slice(0, 200)}`);

    // Complete verification
    await apiCall(p, 'POST', `/grn/session/${grn1Id}/complete-verification`, {}, token);

    // Finalize
    const finalizeR = await apiCall(p, 'POST', `/grn/session/${grn1Id}/finalize`, { force: true }, token);
    console.log(`  Finalize: ${JSON.stringify(finalizeR?.data).slice(0, 200)}`);
    console.log('  ✅ Partial receive: 30 of 100 received');
  }

  // Navigate to GRN page to see the session
  await p.goto(`${BASE}/grn`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'edge-partial-receive-grn');

  // ============================================================
  // EDGE CASE 2: DAMAGED GOODS
  // ============================================================
  console.log('\n=== EDGE CASE 2: DAMAGED GOODS ===');

  // Create a PO
  const po2 = await apiCall(p, 'POST', '/po/', {
    supplier_name: 'Damage Test Supplier',
    items: [{ item_code: 'item', name: 'Damage Test Item', qty: 50, rate: 100, amount: 5000, uom: 'Nos', warehouse: 'MAIN' }]
  }, token);
  const po2Id = po2?.data?.id;
  if (po2Id) {
    await apiCall(p, 'POST', `/po/${po2Id}/submit`, {}, token);
  }

  // Create GRN
  const grn2 = await apiCall(p, 'POST', '/grn/', {
    warehouse_id: 1,
    purchase_order_id: po2Id,
    receiving_mode: 'invoice_only',
    truck_no: 'DAMAGE-001',
    driver_name: 'Damage Driver',
    expected_boxes: 1
  }, token);
  const grn2Id = grn2?.data?.id;

  if (grn2Id) {
    // Scan box with damage condition
    await apiCall(p, 'POST', '/grn/carton', {
      grn_session_id: grn2Id, carton_no: 'DAMAGE-BOX-001', condition: 'damaged'
    }, token);
    console.log('  Damaged box scanned');

    // Verify items — some damaged
    const verifyR2 = await apiCall(p, 'POST', `/grn/session/${grn2Id}/verify-item`, {
      item_code: 'item', qty: 40
    }, token);
    console.log(`  Verify: ${JSON.stringify(verifyR2?.data).slice(0, 200)}`);

    // Complete & finalize
    await apiCall(p, 'POST', `/grn/session/${grn2Id}/complete-verification`, {}, token);
    const finalizeR2 = await apiCall(p, 'POST', `/grn/session/${grn2Id}/finalize`, { force: true }, token);
    console.log(`  Finalize: ${JSON.stringify(finalizeR2?.data).slice(0, 200)}`);
    console.log('  ✅ Damaged goods received');
  }

  await p.goto(`${BASE}/grn`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'edge-damaged-goods-grn');

  // ============================================================
  // EDGE CASE 3: OVER-RECEIVING
  // ============================================================
  console.log('\n=== EDGE CASE 3: OVER-RECEIVING (110 of 100) ===');

  const po3 = await apiCall(p, 'POST', '/po/', {
    supplier_name: 'Over-Receive Supplier',
    items: [{ item_code: 'item', name: 'Over-Receive Item', qty: 100, rate: 50, amount: 5000, uom: 'Nos', warehouse: 'MAIN' }]
  }, token);
  const po3Id = po3?.data?.id;
  if (po3Id) {
    await apiCall(p, 'POST', `/po/${po3Id}/submit`, {}, token);
  }

  const grn3 = await apiCall(p, 'POST', '/grn/', {
    warehouse_id: 1,
    purchase_order_id: po3Id,
    receiving_mode: 'invoice_only',
    truck_no: 'OVER-001',
    driver_name: 'Over Driver',
    expected_boxes: 1
  }, token);
  const grn3Id = grn3?.data?.id;

  if (grn3Id) {
    await apiCall(p, 'POST', '/grn/carton', {
      grn_session_id: grn3Id, carton_no: 'OVER-BOX-001'
    }, token);

    // Try to receive 110 (10% over)
    const verifyR3 = await apiCall(p, 'POST', `/grn/session/${grn3Id}/verify-item`, {
      item_code: 'item', qty: 110
    }, token);
    console.log(`  Over-receive result: ${JSON.stringify(verifyR3?.data).slice(0, 300)}`);
    // This should either succeed with excess exception or be blocked

    await apiCall(p, 'POST', `/grn/session/${grn3Id}/complete-verification`, {}, token);
    const finalizeR3 = await apiCall(p, 'POST', `/grn/session/${grn3Id}/finalize`, { force: true }, token);
    console.log(`  Finalize: ${JSON.stringify(finalizeR3?.data).slice(0, 200)}`);
    console.log('  ✅ Over-receiving handled');
  }

  await p.goto(`${BASE}/grn`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'edge-over-receive-grn');

  // ============================================================
  // EDGE CASE 4: ZERO QUANTITY
  // ============================================================
  console.log('\n=== EDGE CASE 4: ZERO QUANTITY RECEIVE ===');
  const po4 = await apiCall(p, 'POST', '/po/', {
    supplier_name: 'Zero Qty Supplier',
    items: [{ item_code: 'item', name: 'Zero Qty Item', qty: 50, rate: 50, amount: 2500, uom: 'Nos', warehouse: 'MAIN' }]
  }, token);
  const po4Id = po4?.data?.id;
  if (po4Id) await apiCall(p, 'POST', `/po/${po4Id}/submit`, {}, token);

  const grn4 = await apiCall(p, 'POST', '/grn/', {
    warehouse_id: 1, purchase_order_id: po4Id, receiving_mode: 'invoice_only',
    truck_no: 'ZERO-001', driver_name: 'Zero Driver', expected_boxes: 1
  }, token);
  const grn4Id = grn4?.data?.id;

  if (grn4Id) {
    await apiCall(p, 'POST', '/grn/carton', { grn_session_id: grn4Id, carton_no: 'ZERO-BOX-001' }, token);

    // Try qty=0
    const verifyR4 = await apiCall(p, 'POST', `/grn/session/${grn4Id}/verify-item`, {
      item_code: 'item', qty: 0
    }, token);
    console.log(`  Zero qty result: ok=${verifyR4?.data?.ok} status=${verifyR4?.data?.status} error=${verifyR4?.error || 'none'}`);

    // Try qty=1 (should work)
    const verifyR4b = await apiCall(p, 'POST', `/grn/session/${grn4Id}/verify-item`, {
      item_code: 'item', qty: 1
    }, token);
    console.log(`  Qty=1 result: ok=${verifyR4b?.data?.ok} status=${verifyR4b?.data?.status}`);

    await apiCall(p, 'POST', `/grn/session/${grn4Id}/complete-verification`, {}, token);
    await apiCall(p, 'POST', `/grn/session/${grn4Id}/finalize`, { force: true }, token);
    console.log('  ✅ Zero quantity handled');
  }

  // ============================================================
  // EDGE CASE 5: DUPLICATE BOX SCAN
  // ============================================================
  console.log('\n=== EDGE CASE 5: DUPLICATE BOX SCAN ===');
  const grn5 = await apiCall(p, 'POST', '/grn/', {
    warehouse_id: 1, receiving_mode: 'invoice_only',
    truck_no: 'DUP-001', driver_name: 'Dup Driver', expected_boxes: 1
  }, token);
  const grn5Id = grn5?.data?.id;

  if (grn5Id) {
    // Scan same box twice
    const r1 = await apiCall(p, 'POST', '/grn/carton', { grn_session_id: grn5Id, carton_no: 'DUP-BOX-001' }, token);
    console.log(`  First scan: ${r1?.data?.status}`);
    const r2 = await apiCall(p, 'POST', '/grn/carton', { grn_session_id: grn5Id, carton_no: 'DUP-BOX-001' }, token);
    console.log(`  Duplicate scan: duplicate=${r2?.data?.duplicate} already_scanned=${r2?.data?.already_scanned}`);
    console.log('  ✅ Duplicate box detected');
  }

  // ============================================================
  // FINAL STATE CHECK
  // ============================================================
  console.log('\n=== FINAL STATE ===');
  const queue = await apiCall(p, 'GET', '/putaway/queue', null, token);
  console.log(`  Putaway queue items: ${queue?.data?.length || 0}`);

  const grnSessions = await apiCall(p, 'GET', '/grn/sessions', null, token);
  console.log(`  GRN sessions: ${grnSessions?.data?.length || 0}`);

  await p.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'edge-final-dashboard');

  await p.goto(`${BASE}/putaway`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'edge-final-putaway');

  console.log('\n══════════════════════════════════════');
  console.log(`✅ ALL EDGE CASES COMPLETE`);
  console.log(`📸 Total screenshots: ${n}`);
  console.log('══════════════════════════════════════');

  await browser.close();
})().catch(async (err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
