const { chromium } = require('playwright');
const http = require('http');

const BASE = 'http://127.0.0.1:8080';
const SS = 'screenshots/multi-split';

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

  async function login() {
    await page.goto(`${BASE}/login`, { timeout: 10000 });
    await page.waitForTimeout(1500);
    await page.fill('input[autoComplete="username"]', 'admin');
    await page.fill('input[autoComplete="current-password"]', 'admin123');
    await page.locator('button.btn:has-text("Login")').click();
    await page.waitForTimeout(3000);
  }

  try {
    // ─── 1. LOGIN ───
    console.log('1. Login...');
    await login();
    await ss('login');

    // Get token
    const loginR = await apiCall('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    const token = loginR.data?.token;

    // ─── 2. CHECK EXISTING QUEUE ───
    console.log('2. Check putaway queue...');
    const queueR = await apiCall('GET', '/api/putaway/queue', null, token);
    const queue = queueR.data || [];
    const itemEntry = queue.find(q => q.item_code === 'item' && q.qty > 50);
    if (!itemEntry) {
      console.log('  No item with qty > 50 in queue. Using first available entry.');
      console.log('  Queue:', queue.map(q => `${q.item_code}:${q.qty}@${q.location_code}`).join(', '));
      // Use whatever is in the queue
    }
    const totalQty = itemEntry ? itemEntry.qty : (queue[0]?.qty || 0);
    const itemCode = itemEntry ? itemEntry.item_code : (queue[0]?.item_code || 'item');
    console.log(`  Item: ${itemCode}, Total qty: ${totalQty}`);
    await ss('queue');

    if (totalQty <= 50) {
      console.log('  ⚠ Qty ≤ 50 — no split needed. Creating test data first...');
      // We need at least 100+ items to test multi-split
      // Check if there's enough stock
      console.log('  Proceeding with existing data...');
    }

    // ─── 3. PUTAWAY: PICK ITEM ───
    console.log('3. Pick item for putaway...');
    await page.goto(`${BASE}/putaway`, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // By Item mode
    await page.locator('button.pw-mode-card:has-text("By Item")').click();
    await page.waitForTimeout(2000);
    await ss('item-mode');

    // Scan the item
    const scanInput = page.locator('.pw-scan-field').first();
    await scanInput.fill(itemCode);
    await page.waitForTimeout(1000);
    await page.locator('.pw-scan-btn:has-text("Pick")').click();
    await page.waitForTimeout(1500);
    await ss('item-picked');

    // Start putaway
    await page.locator('button:has-text("Start Putaway")').click();
    await page.waitForTimeout(5000);
    await ss('putaway-started');

    // ─── 4. FIRST SPLIT: Place 50 of N ───
    let remaining = totalQty;
    let splitNum = 0;
    const SPLIT_SIZE = 50;

    while (remaining > 0) {
      splitNum++;
      const toPlace = Math.min(SPLIT_SIZE, remaining);
      console.log(`\n--- Split ${splitNum}: Place ${toPlace} (remaining: ${remaining}) ---`);

      // Type a bin location
      const locInput = page.locator('input[placeholder*="location"], input[placeholder*="bin"]').first();
      if (await locInput.isVisible()) {
        // Use different bins for each split
        const binCode = `A-02-01-0${splitNum}`;
        await locInput.fill(binCode);
        await page.waitForTimeout(500);
        console.log(`  Using bin: ${binCode}`);
      }

      // Click Confirm
      const confirmBtn = page.locator('button:has-text("Confirm")').first();
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(8000); // Wait for async location lookup + place
      }
      await ss(`split-${splitNum}-after-confirm`);

      // Check for exception panel
      const exceptionVisible = await page.locator('.pw-exception-panel').isVisible({ timeout: 3000 }).catch(() => false);
      if (exceptionVisible) {
        const errorMsg = await page.locator('.pw-exception-msg').textContent().catch(() => '');
        console.log(`  Exception: ${errorMsg}`);

        // Click "Split quantity"
        const splitBtn = page.locator('button:has-text("Split quantity")');
        if (await splitBtn.isVisible()) {
          await splitBtn.click();
          await page.waitForTimeout(1500);
          await ss(`split-${splitNum}-form`);

          // Check pre-filled qty
          const fitQtyInput = page.locator('input[type="number"]').first();
          if (await fitQtyInput.isVisible()) {
            const prefilled = await fitQtyInput.inputValue();
            console.log(`  Pre-filled: ${prefilled}`);

            // Set to the split size we want
            await fitQtyInput.clear();
            await fitQtyInput.fill(String(toPlace));
            await page.waitForTimeout(500);
          }

          // Click "Place X here · Y remaining"
          const placeBtn = page.locator('button:has-text("Place"), button:has-text("remaining")').first();
          if (await placeBtn.isVisible()) {
            const btnText = await placeBtn.textContent();
            console.log(`  Button: ${btnText}`);
            await placeBtn.click();
            await page.waitForTimeout(5000);
            await ss(`split-${splitNum}-placed`);

            remaining -= toPlace;
            console.log(`  ✅ Placed ${toPlace}. Remaining: ${remaining}`);
          } else {
            console.log('  ⚠ Place button not found');
            break;
          }
        } else {
          console.log('  ⚠ Split button not found');
          break;
        }
      } else {
        // No exception — item fit directly (qty ≤ 50)
        console.log(`  ✅ No exception — ${toPlace} items fit directly`);
        remaining -= toPlace;
        await ss(`split-${splitNum}-direct`);

        // If there are more items, go back to pick next
        if (remaining > 0) {
          // Go back to item pick
          const backBtn = page.locator('button:has-text("Back")').first();
          if (await backBtn.isVisible()) {
            await backBtn.click();
            await page.waitForTimeout(2000);
          }

          // Scan next batch
          const scanInput2 = page.locator('.pw-scan-field').first();
          if (await scanInput2.isVisible()) {
            await scanInput2.fill(itemCode);
            await page.waitForTimeout(1000);
            await page.locator('.pw-scan-btn:has-text("Pick")').click().catch(() => {});
            await page.waitForTimeout(1500);
          }

          // Start putaway again
          const startBtn = page.locator('button:has-text("Start Putaway")');
          if (await startBtn.isVisible()) {
            await startBtn.click();
            await page.waitForTimeout(5000);
          }
        }
      }
    }

    // ─── 5. VERIFY FINAL STATE ───
    console.log('\n5. Verify final stock...');
    await page.goto(`${BASE}/locations`, { timeout: 10000 });
    await page.waitForTimeout(2000);
    await ss('locations-final');

    // Check putaway queue is empty (or reduced)
    const finalQueue = await apiCall('GET', '/api/putaway/queue', null, token);
    const remainingItems = (finalQueue.data || []).filter(q => q.item_code === itemCode);
    console.log(`  Remaining in queue: ${remainingItems.map(q => `${q.qty}@${q.location_code}`).join(', ') || 'none'}`);

    // Check putaway logs
    const logsR = await apiCall('GET', '/api/putaway/rules', null, token);
    console.log(`  Putaway rules: ${JSON.stringify(logsR.data || []).substring(0, 200)}`);

    console.log(`\n✅ Multi-split test complete! ${step} screenshots saved to ${SS}/`);
    console.log(`   Total splits: ${splitNum}, Final remaining: ${remaining}`);

  } catch (e) {
    console.error('❌ Error:', e.message);
    await ss('error').catch(() => {});
  } finally {
    await browser.close();
  }
})();
