const { chromium } = require('playwright');
const http = require('http');

const BASE = 'http://127.0.0.1:8080';
const SS = 'screenshots/split-test';

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: 8080, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    };
    const req = http.request(opts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve({ raw: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let step = 0;

  async function ss(name) {
    step++;
    const file = `${SS}/${String(step).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  📸 ${file}`);
  }

  try {
    // ─── 1. LOGIN ───
    console.log('1. Login...');
    await page.goto(`${BASE}/login`, { timeout: 10000 });
    await page.waitForTimeout(1500);
    await page.fill('input[autoComplete="username"]', 'admin');
    await page.fill('input[autoComplete="current-password"]', 'admin123');
    await page.locator('button.btn:has-text("Login")').click();
    await page.waitForTimeout(3000);
    await ss('login');

    // Get auth token via API
    const loginR = await apiCall('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    const token = loginR.data?.token;
    console.log(`  Token: ${token ? '✅' : '❌'}`);

    // ─── 2. CREATE PO VIA API ───
    console.log('2. Create PO via API...');
    const poR = await apiCall('POST', '/api/po', {
      supplier_name: 'sup-01',
      items: [{ item_code: 'item', qty: 80, rate: 100 }]
    }, token);
    const poNo = poR.data?.po_no || poR.data?.name;
    console.log(`  PO: ${poNo || JSON.stringify(poR).substring(0, 200)}`);

    // Submit PO
    if (poR.data?.id) {
      const submitR = await apiCall('POST', `/api/po/${poR.data.id}/submit`, {}, token);
      console.log(`  PO submitted: ${submitR.ok ? '✅' : '❌ ' + (submitR.error || '')}`);
    }

    // ─── 3. START GRN SESSION VIA API ───
    console.log('3. Start GRN session...');
    // Get the PO ID
    const poList = await apiCall('GET', '/api/po/list', null, token);
    const openPOs = (poList.data || []).filter(p => p.status === 'To Receive and Bill' || p.status === 'Draft');
    console.log(`  Open POs: ${openPOs.length}`);

    if (openPOs.length === 0) {
      console.log('  ❌ No open POs found — cannot proceed');
      await ss('no-open-pos');
      return;
    }

    const targetPO = openPOs[openPOs.length - 1]; // Use most recent
    console.log(`  Using PO: ${targetPO.po_no || targetPO.name} (id: ${targetPO.id})`);

    // Create GRN session
    const grnR = await apiCall('POST', '/api/grn', {
      truck_no: 'MH-12-SPLIT-001',
      driver_name: 'Split Test Driver',
      driver_phone: '9876543210',
      expected_boxes: 1,
      purchase_order_id: targetPO.id,
      receiving_mode: 'invoice_only',
      packing_list_available: false,
      warehouse_id: 1
    }, token);
    const grnId = grnR.data?.grn_id || grnR.data?.id;
    console.log(`  GRN session: ${grnId || JSON.stringify(grnR).substring(0, 200)}`);

    if (!grnId) {
      console.log('  ❌ Could not create GRN session');
      await ss('grn-create-failed');
      return;
    }

    // ─── 4. RECEIVE ITEMS VIA API ───
    console.log('4. Receive items...');

    // Scan box (carton)
    const boxR = await apiCall('POST', `/api/grn/session/${grnId}/cartons`, { box_id: 'BOX-SPLIT-001' }, token);
    console.log(`  Box scan: ${boxR.ok ? '✅' : '❌ ' + (boxR.error || '')}`);

    // Complete box receiving
    const cbrR = await apiCall('POST', `/api/grn/session/${grnId}/complete-box-receiving`, {}, token);
    console.log(`  Complete box receiving: ${cbrR.ok ? '✅' : '❌ ' + (cbrR.error || '')}`);

    // Open box for verify
    const openR = await apiCall('POST', `/api/grn/session/${grnId}/open-box`, { box_id: 'BOX-SPLIT-001' }, token);
    console.log(`  Open box: ${openR.ok ? '✅' : '❌ ' + (openR.error || '')}`);

    // Scan items (qty 80 — exceeds 50-item bin capacity)
    const itemR = await apiCall('POST', `/api/grn/session/${grnId}/verify-item`, {
      item_code: 'item',
      qty: 80
    }, token);
    console.log(`  Item scan (80 pcs): ${itemR.ok ? '✅' : '❌ ' + (itemR.error || '')}`);

    // Complete item verification
    const civR = await apiCall('POST', `/api/grn/session/${grnId}/complete-verification`, {}, token);
    console.log(`  Complete verification: ${civR.ok ? '✅' : '❌ ' + (civR.error || '')}`);

    // Finalize GRN
    const finR = await apiCall('POST', `/api/grn/session/${grnId}/finalize`, {}, token);
    console.log(`  Finalize: ${finR.ok ? '✅' : '❌ ' + (finR.error || '')}`);

    // ─── 5. VERIFY STOCK IN INCOMING ───
    console.log('5. Verify stock in staging...');
    const stockR = await apiCall('GET', '/api/stock-scan?code=item', null, token);
    console.log(`  Stock: ${JSON.stringify(stockR.data || stockR).substring(0, 300)}`);

    // ─── 6. PUTAWAY SPLIT TEST VIA UI ───
    console.log('6. Putaway split test via UI...');
    await page.goto(`${BASE}/putaway`, { timeout: 10000 });
    await page.waitForTimeout(2000);
    await ss('putaway-page');

    // Check queue
    const queueText = await page.locator('.pw-queue-banner, .pw-queue-count').first().textContent().catch(() => 'no queue');
    console.log(`  Queue: ${queueText}`);

    // Click "By Item" mode
    const byItemCard = page.locator('button.pw-mode-card:has-text("By Item")');
    if (await byItemCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await byItemCard.click();
      await page.waitForTimeout(2000);
      await ss('item-mode');
    } else {
      console.log('  ⚠ By Item card not visible, trying to find items...');
      await ss('no-item-card');
    }

    // Scan for the 184-qty 'item' from staging
    const scanInput = page.locator('.pw-scan-field[placeholder*="item"], .pw-scan-field[placeholder*="barcode"]').first();
    if (await scanInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await scanInput.fill('item');
      await page.waitForTimeout(1000);
      await ss('item-scan-typed');
      const pickBtn = page.locator('.pw-scan-btn:has-text("Pick")').first();
      if (await pickBtn.isVisible()) {
        await pickBtn.click();
        await page.waitForTimeout(1500);
      }
    } else {
      console.log('  ⚠ Scan input not found, clicking Pick directly');
      const pickBtn = page.locator('.pw-scan-btn:has-text("Pick")').first();
      await pickBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    await ss('item-picked');

    // Start putaway
    const startPutawayBtn = page.locator('button:has-text("Start Putaway")');
    if (await startPutawayBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('  Clicking Start Putaway...');
      await startPutawayBtn.click();
      // Wait for suggestion to load (async API call)
      await page.waitForTimeout(5000);
      await ss('putaway-started');
    } else {
      console.log('  ⚠ Start Putaway button not visible');
      await ss('no-start-putaway-btn');
    }

    // Check for suggestion
    const suggestionVisible = await page.locator('.pw-suggestion-card, .pw-location-code').isVisible({ timeout: 8000 }).catch(() => false);
    if (suggestionVisible) {
      const locCode = await page.locator('.pw-location-code').first().textContent().catch(() => '?');
      console.log(`  Suggested location: ${locCode}`);
    } else {
      console.log('  ⚠ No suggestion visible');
    }

    // Read the suggested location, or use a known bin
    let locCode = await page.locator('.pw-location-code').first().textContent().catch(() => '');
    if (!locCode || !locCode.trim()) locCode = 'A-02-01-01'; // Known empty bin
    console.log(`  Using location: ${locCode.trim()}`);

    // Type the location in the scan input
    const locInput = page.locator('input[placeholder*="location"], input[placeholder*="bin"]').first();
    if (await locInput.isVisible()) {
      await locInput.fill(locCode.trim());
      await page.waitForTimeout(500);
    }

    // Click Confirm — this should trigger bin_full error for 184 items > 50 capacity
    const confirmBtn = page.locator('button:has-text("Confirm")').first();
    if (await confirmBtn.isVisible()) {
      console.log('  Clicking Confirm (expecting bin_full error)...');
      await confirmBtn.click();
      // Wait for async: location lookup API + place API + UI update
      await page.waitForTimeout(8000);
    } else {
      console.log('  ⚠ Confirm button not found');
    }
    await ss('after-confirm');

    // Check for exception panel
    const exceptionVisible = await page.locator('.pw-exception-panel').isVisible({ timeout: 5000 }).catch(() => false);
    if (exceptionVisible) {
      console.log('  ✅ Exception panel appeared!');
      const exceptionMsg = await page.locator('.pw-exception-msg').textContent().catch(() => '');
      console.log(`  Error: ${exceptionMsg}`);
      await ss('exception-panel');

      // Click "Split quantity"
      const splitBtn = page.locator('button:has-text("Split quantity")');
      if (await splitBtn.isVisible()) {
        await splitBtn.click();
        await page.waitForTimeout(1500);
        await ss('split-form');

        // Check pre-filled qty
        const fitQtyInput = page.locator('input[type="number"]').first();
        if (await fitQtyInput.isVisible()) {
          const fitQtyValue = await fitQtyInput.inputValue();
          console.log(`  Pre-filled qty: ${fitQtyValue}`);
        }

        // Check button text
        const placeBtn = page.locator('button:has-text("Place"), button:has-text("remaining")').first();
        if (await placeBtn.isVisible()) {
          const btnText = await placeBtn.textContent();
          console.log(`  Button: ${btnText}`);
          await placeBtn.click();
          await page.waitForTimeout(3000);
          await ss('after-split');
        }

        // Check if new suggestion appeared for remainder
        const newSuggestion = await page.locator('.pw-suggestion-card, .pw-location-code').isVisible({ timeout: 5000 }).catch(() => false);
        if (newSuggestion) {
          const newLoc = await page.locator('.pw-location-code').first().textContent().catch(() => '?');
          console.log(`  ✅ New suggestion for remainder: ${newLoc}`);
          await ss('remainder-suggestion');
        } else {
          console.log('  ⚠ No new suggestion (may be complete)');
          await ss('no-new-suggestion');
        }
      }
    } else {
      console.log('  ⚠ No exception panel — checking if item fit directly');
      await ss('no-exception');
    }

    // ─── 7. VERIFY FINAL STOCK ───
    console.log('7. Verify final stock...');
    await page.goto(`${BASE}/locations`, { timeout: 10000 });
    await page.waitForTimeout(2000);
    await ss('locations-final');

    console.log('\n✅ E2E split test complete!');
    console.log(`📸 ${step} screenshots saved to ${SS}/`);

  } catch (e) {
    console.error('❌ Error:', e.message);
    await ss('error').catch(() => {});
  } finally {
    await browser.close();
  }
})();
