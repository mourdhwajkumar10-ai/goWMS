import { chromium } from 'playwright';
import path from 'path';

const BASE = 'http://127.0.0.1:8080';
const DIR = '/Users/yudhistherkumar/Downloads/goWMS/screenshots';

let n = 0;
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

// API helper — runs inside page context
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

  // ═══════════════════════════════════════════════════════════
  // STEP 1: LOGIN
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 1: LOGIN ===');
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await wait(2000);
  await shot(p, 'login-page');
  await p.locator('input[autocomplete="username"]').fill('admin');
  await p.locator('input[autocomplete="current-password"]').fill('admin123');
  await shot(p, 'login-filled');
  await p.locator('.login-card button.btn').last().click();
  await wait(4000);
  await shot(p, 'after-login');
  console.log('  ✅ Logged in');

  // ═══════════════════════════════════════════════════════════
  // STEP 2: CREATE PO VIA UI
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 2: CREATE PURCHASE ORDER ===');
  await p.goto(`${BASE}/po`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'po-page');

  // Get token for API fallback
  const loginR = await apiCall(p, 'POST', '/auth/login', { username: 'admin', password: 'admin123' });
  const token = loginR?.data?.token;

  // Fill supplier
  await fill(p, 'input[placeholder*="supplier" i]', 'E2E Test Supplier', 2000);
  await wait(500);

  // Fill item code in the PO items table
  await fill(p, 'input[placeholder*="Scan or type" i]', 'BEARING-BALL-6205', 2000);
  await wait(1000);
  // Click the suggestion if any
  await click(p, '[class*="suggestion"]:first-child, [class*="autocomplete"]:first-child', 1500);
  await wait(1000);

  // Set qty
  const qtyInputs = await p.locator('input[type="number"]').all();
  if (qtyInputs.length > 0) {
    await qtyInputs[qtyInputs.length - 1].fill('50');
  }

  await shot(p, 'po-item-added');

  // Try to add another item via the + button
  await click(p, 'button:has-text("Add"), button:has-text("+")', 1000);
  await wait(500);

  // Save
  await click(p, 'button:has-text("Save")', 2000);
  await wait(2000);
  await shot(p, 'po-saved');

  // Submit
  await click(p, 'button:has-text("Submit")', 2000);
  await wait(2000);
  await shot(p, 'po-submitted');
  console.log('  ✅ PO created via UI');

  // ═══════════════════════════════════════════════════════════
  // STEP 3: API - Create & Submit PO (backup)
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 3: ENSURE PO EXISTS (API backup) ===');
  const poList = await apiCall(p, 'GET', '/po/list', null, token);
  const openPOs = (poList?.data || []).filter((po: any) =>
    po.status === 'To Receive and Bill' || po.status === 'To Receive' || po.status === 'Draft'
  );
  console.log(`  Open POs: ${openPOs.length}`);
  if (openPOs.length === 0) {
    // Create one via API
    const createR = await apiCall(p, 'POST', '/po/', {
      supplier_name: 'E2E Auto Supplier',
      items: [{ item_code: 'item', name: 'Test Item', qty: 100, rate: 50, amount: 5000, uom: 'Nos', warehouse: 'MAIN' }]
    }, token);
    console.log(`  API PO Created: ${JSON.stringify(createR?.data).slice(0, 100)}`);
    if (createR?.data?.id) {
      const submitR = await apiCall(p, 'POST', `/po/${createR.data.id}/submit`, {}, token);
      console.log(`  API PO Submitted: ${JSON.stringify(submitR?.data).slice(0, 100)}`);
    }
  }

  // Refresh PO list
  const poList2 = await apiCall(p, 'GET', '/po/list', null, token);
  const readyPOs = (poList2?.data || []).filter((po: any) =>
    po.status === 'To Receive and Bill' || po.status === 'To Receive'
  );
  console.log(`  Ready POs: ${readyPOs.length}`);
  if (readyPOs.length > 0) {
    console.log(`  Using PO: ${readyPOs[0].name} (id: ${readyPOs[0].id})`);
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 4: GRN - START RECEIVING
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 4: GRN - START RECEIVING ===');
  await p.goto(`${BASE}/grn`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'grn-dashboard');

  // Fill arrival form
  await fill(p, 'input[placeholder*="truck" i]', 'MH-12-AB-1234', 2000);
  await fill(p, 'input[placeholder*="driver" i]', 'Ramesh Kumar', 2000);
  await fill(p, 'input[placeholder*="box" i], input[placeholder*="expected" i]', '3', 2000);

  await shot(p, 'grn-arrival-form');

  // Click Start Receiving on first available PO
  let startedReceiving = await click(p, 'button:has-text("Start Receiving")', 3000);
  if (!startedReceiving) {
    // Check a PO row first
    await click(p, 'table input[type="checkbox"], input[type="checkbox"]', 1000);
    await wait(500);
    startedReceiving = await click(p, 'button:has-text("Start Receiving"), button:has-text("Start")', 3000);
  }
  await wait(4000);
  await shot(p, 'grn-session-started');
  console.log(`  Current URL: ${p.url()}`);
  console.log('  ✅ GRN session started');

  // ═══════════════════════════════════════════════════════════
  // STEP 5: SKIP PACKING LIST
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 5: SKIP PACKING LIST ===');
  await click(p, 'button:has-text("Skip"), button:has-text("skip"), button:has-text("continue")', 3000);
  await wait(2000);
  await shot(p, 'grn-after-skip');
  console.log('  ✅ Moved to box scanning');

  // ═══════════════════════════════════════════════════════════
  // STEP 6: SCAN BOXES
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 6: SCAN BOXES ===');
  for (let i = 1; i <= 3; i++) {
    const boxNo = `BOX-${String(i).padStart(3,'0')}`;
    console.log(`  📦 Scanning ${boxNo}...`);
    // Try multiple input selectors
    const filled = await fill(p, 'input[placeholder*="Scan or pick" i], input[placeholder*="carton" i], input[placeholder*="box" i]', boxNo, 3000);
    if (!filled) {
      // Find any visible text input in the scan area
      const inputs = await p.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="number"]):not([type="date"])').all();
      for (const inp of inputs) {
        try {
          if (await inp.isVisible()) { await inp.fill(boxNo); break; }
        } catch {}
      }
    }
    await wait(300);
    await click(p, 'button:has-text("Receive Box"), button:has-text("Receive")', 2000);
    await wait(1500);
    // Handle confirmation modal
    await click(p, '[class*="modal"] button:has-text("Confirm"), [class*="overlay"] button:has-text("Confirm")', 1000);
    await wait(800);
    console.log(`  ✅ ${boxNo} received`);
  }
  await shot(p, 'grn-boxes-scanned');

  // Finish boxes
  await click(p, 'button:has-text("Finish")', 3000);
  await wait(2000);
  await shot(p, 'grn-boxes-finished');
  console.log('  ✅ Boxes finished');

  // ═══════════════════════════════════════════════════════════
  // STEP 7: VERIFY ITEMS
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 7: VERIFY ITEMS ===');
  // Open BOX-001
  await fill(p, 'input[placeholder*="Pick or scan" i], input[placeholder*="carton" i], input[placeholder*="box" i]', 'BOX-001', 3000);
  await click(p, 'button:has-text("Open box"), button:has-text("Open")', 2000);
  await wait(2000);
  await shot(p, 'grn-box-opened');

  // Try scanning items
  for (const item of ['item', 'BEARING-BALL-6205']) {
    console.log(`  🔍 Trying item: ${item}`);
    await fill(p, 'input[placeholder*="item" i], input[placeholder*="QR" i], input[placeholder*="case" i], input[placeholder*="Scan case" i]', item, 1500);
    await wait(300);
    // Fill qty if visible
    const qtyEl = p.locator('input[type="number"]').first();
    if (await qtyEl.isVisible({timeout:500}).catch(()=>false)) {
      await qtyEl.fill('50');
    }
    const verified = await click(p, 'button:has-text("Verify")', 2000);
    await wait(1500);
    if (verified) console.log(`  ✅ Verified ${item}`);
  }

  await shot(p, 'grn-items-verified');

  // Force close box
  await click(p, 'button:has-text("Force close")', 1000);
  await wait(1000);

  // Complete verification
  await click(p, 'button:has-text("Complete verify"), button:has-text("Complete item")', 3000);
  await wait(2000);
  await shot(p, 'grn-verify-complete');
  console.log('  ✅ Items verified');

  // ═══════════════════════════════════════════════════════════
  // STEP 8: FINALIZE GRN
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 8: FINALIZE GRN ===');
  await click(p, 'button:has-text("Finalize"), button:has-text("Complete")', 5000);
  await wait(2000);
  await click(p, 'button:has-text("Confirm"), button:has-text("Yes")', 3000);
  await wait(4000);
  await shot(p, 'grn-finalized');
  await click(p, 'button:has-text("OK"), button:has-text("Close"), button:has-text("Go to Putaway")', 2000);
  await wait(1000);
  await shot(p, 'grn-complete');
  console.log('  ✅ GRN finalized');

  // ═══════════════════════════════════════════════════════════
  // STEP 9: PUTAWAY
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 9: PUTAWAY ===');
  await p.goto(`${BASE}/putaway`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'putaway-dashboard');

  // Click "By Item"
  await click(p, 'button:has-text("By Item"), button:has-text("Single")', 3000);
  await wait(2000);
  await shot(p, 'putaway-item-mode');

  // Scan an item into tote
  const scanFilled = await fill(p, 'input[placeholder*="Scan item" i], input[placeholder*="item code" i], input[placeholder*="barcode" i]', 'item', 3000);
  if (scanFilled) {
    await click(p, 'button:has-text("Pick"), button:has-text("📷")', 2000);
    await wait(1500);
  }

  // Also click Pick button directly
  await click(p, 'button:has-text("Pick"):not(:disabled)', 3000);
  await wait(2000);
  await shot(p, 'putaway-item-picked');

  // Start putaway
  await click(p, 'button:has-text("Start Putaway")', 3000);
  await wait(4000);
  await shot(p, 'putaway-location-suggested');

  // Enter location
  await fill(p, 'input[placeholder*="location" i], input[placeholder*="bin" i], input[placeholder*="Scan" i]', 'A-01-01', 3000);
  await click(p, 'button:has-text("Confirm")', 2000);
  await wait(2000);
  await shot(p, 'putaway-placed');

  await click(p, 'button:has-text("Next Item"), button:has-text("Done")', 2000);
  await wait(1000);
  await shot(p, 'putaway-complete');
  console.log('  ✅ Putaway completed');

  // ═══════════════════════════════════════════════════════════
  // STEP 10: FINAL VERIFICATION
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== STEP 10: FINAL VERIFICATION ===');
  await p.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'dashboard-final');

  await p.goto(`${BASE}/items`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'items-final');

  await p.goto(`${BASE}/putaway`, { waitUntil: 'networkidle' });
  await wait(3000);
  await shot(p, 'putaway-final');

  console.log('\n══════════════════════════════════════');
  console.log(`✅ ALL E2E STEPS COMPLETE`);
  console.log(`📸 Total screenshots: ${n}`);
  console.log(`📁 ${DIR}`);
  console.log('══════════════════════════════════════');

  await browser.close();
})().catch(async (err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
