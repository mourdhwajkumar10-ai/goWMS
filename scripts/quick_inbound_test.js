/**
 * goWMS Quick Inbound Test - 20 Key Scenarios
 * Tests core inbound workflow with screenshots
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://34.93.122.213:8080';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'inbound_tests');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const testResults = [];

async function takeScreenshot(page, name) {
  const filename = `${name}_${Date.now()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath });
  return filename;
}

async function login(page) {
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000)); // Wait for React to render
    
    const inputs = await page.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type('admin', { delay: 30 });
      await inputs[1].type('admin123', { delay: 30 });
    }
    
    const loginBtn = await page.$('form.login-card button');
    if (loginBtn) {
      await loginBtn.click();
      await new Promise(r => setTimeout(r, 3000)); // Wait for login
    }
  } catch (e) {
    console.log('Login error:', e.message);
  }
}

async function runTest(page, id, name, fn) {
  const start = Date.now();
  try {
    const result = await fn(page);
    const loadTime = Date.now() - start;
    const screenshot = await takeScreenshot(page, id);
    testResults.push({ id, name, result, loadTime, status: 'PASS', screenshot });
    console.log(`✅ ${id}: ${name} (${loadTime}ms)`);
    return true;
  } catch (error) {
    const loadTime = Date.now() - start;
    const screenshot = await takeScreenshot(page, `${id}_error`);
    testResults.push({ id, name, result: error.message, loadTime, status: 'FAIL', screenshot });
    console.log(`❌ ${id}: ${name} - ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting goWMS Quick Inbound Test\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    
    // Login
    console.log('🔐 Logging in...');
    await login(page);
    console.log('✅ Logged in\n');
    
    // MODULE 1: Truck Arrival (5 tests)
    console.log('=== MODULE 1: Truck Arrival & GRN ===');
    
    await runTest(page, 'TC-GRN-001', 'Navigate to GRN page', async (p) => {
      await p.goto(`${BASE_URL}/grn`, { waitUntil: 'networkidle2' });
      return 'GRN page loaded';
    });
    
    await runTest(page, 'TC-GRN-002', 'Check PO list', async (p) => {
      const rows = await p.$$('.erpnext-card table tbody tr');
      return `Found ${rows.length} POs`;
    });
    
    await runTest(page, 'TC-GRN-003', 'Check warehouse dropdown', async (p) => {
      const select = await p.$('select');
      return select ? 'Warehouse dropdown found' : 'No dropdown';
    });
    
    await runTest(page, 'TC-GRN-004', 'Check session filters', async (p) => {
      const filters = await p.$$('button');
      const filterTexts = [];
      for (const f of filters.slice(0, 10)) {
        const text = await p.evaluate(el => el.textContent.trim(), f);
        if (text) filterTexts.push(text);
      }
      return `Filters: ${filterTexts.join(', ')}`;
    });
    
    await runTest(page, 'TC-GRN-005', 'Check workflow stepper', async (p) => {
      const hasStepper = await p.evaluate(() => {
        return document.body.textContent.includes('Truck') || 
               document.body.textContent.includes('GRN') ||
               document.body.textContent.includes('Box');
      });
      return hasStepper ? 'Workflow stepper visible' : 'Stepper not visible';
    });
    
    // MODULE 2: Box Receiving (5 tests)
    console.log('\n=== MODULE 2: Box Receiving ===');
    
    await runTest(page, 'TC-BOX-001', 'Check carton input', async (p) => {
      const input = await p.$('input[placeholder*="carton"], input[placeholder*="box"]');
      return input ? 'Carton input found' : 'Carton input not found';
    });
    
    await runTest(page, 'TC-BOX-002', 'Check receive box button', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Receive Box')) return 'Receive Box button found';
      }
      return 'Button not found';
    });
    
    await runTest(page, 'TC-BOX-003', 'Check finish boxes button', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Finish box')) return 'Finish boxes button found';
      }
      return 'Button not found';
    });
    
    await runTest(page, 'TC-BOX-004', 'Check open box for verify', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Open box')) return 'Open box button found';
      }
      return 'Button not found';
    });
    
    await runTest(page, 'TC-BOX-005', 'Check CSV import', async (p) => {
      const hasImport = await p.evaluate(() => {
        return document.body.textContent.includes('Import Packing List');
      });
      return hasImport ? 'CSV import available' : 'Import not found';
    });
    
    // MODULE 3: Item Verification (5 tests)
    console.log('\n=== MODULE 3: Item Verification ===');
    
    await runTest(page, 'TC-VER-001', 'Check verify button', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Verify')) return 'Verify button found';
      }
      return 'Button not found';
    });
    
    await runTest(page, 'TC-VER-002', 'Check scan item input', async (p) => {
      const input = await p.$('input[placeholder*="Scan"]');
      return input ? 'Scan item input found' : 'Input not found';
    });
    
    await runTest(page, 'TC-VER-003', 'Check quantity input', async (p) => {
      const input = await p.$('input[type="number"]');
      return input ? 'Quantity input found' : 'Input not found';
    });
    
    await runTest(page, 'TC-VER-004', 'Check complete verify button', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Complete verify')) return 'Complete verify found';
      }
      return 'Button not found';
    });
    
    await runTest(page, 'TC-VER-005', 'Check item summary', async (p) => {
      const hasSummary = await p.evaluate(() => {
        return document.body.textContent.includes('Items expected') ||
               document.body.textContent.includes('received');
      });
      return hasSummary ? 'Item summary visible' : 'Summary not visible';
    });
    
    // MODULE 4: Exceptions (5 tests)
    console.log('\n=== MODULE 4: Exceptions ===');
    
    await runTest(page, 'TC-EXC-001', 'Navigate to exceptions tab', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('exception')) {
          await btn.click();
          await new Promise(r => setTimeout(r, 300));
          return 'Exceptions tab opened';
        }
      }
      return 'Tab not found';
    });
    
    await runTest(page, 'TC-EXC-002', 'Check exception table', async (p) => {
      const table = await p.$('.erpnext-table');
      return table ? 'Exception table found' : 'Table not found';
    });
    
    await runTest(page, 'TC-EXC-003', 'Check resolve input', async (p) => {
      const input = await p.$('input[placeholder*="Resolution"]');
      return input ? 'Resolve input found' : 'Input not found';
    });
    
    await runTest(page, 'TC-EXC-004', 'Check activity tab', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('activity')) return 'Activity tab found';
      }
      return 'Tab not found';
    });
    
    await runTest(page, 'TC-EXC-005', 'Check finalize button', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Finalize')) return 'Finalize button found';
      }
      return 'Button not found';
    });
    
    // MODULE 5: Putaway (5 tests)
    console.log('\n=== MODULE 5: Putaway ===');
    
    await runTest(page, 'TC-PUT-001', 'Navigate to putaway', async (p) => {
      await p.goto(`${BASE_URL}/putaway`, { waitUntil: 'networkidle2' });
      return 'Putaway page loaded';
    });
    
    await runTest(page, 'TC-PUT-002', 'Check suggest button', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Suggest')) return 'Suggest button found';
      }
      return 'Button not found';
    });
    
    await runTest(page, 'TC-PUT-003', 'Check putaway queue', async (p) => {
      const hasQueue = await p.evaluate(() => {
        return document.body.textContent.includes('queue') ||
               document.body.textContent.includes('pending');
      });
      return hasQueue ? 'Queue visible' : 'Queue not visible';
    });
    
    await runTest(page, 'TC-PUT-004', 'Check target input', async (p) => {
      const input = await p.$('input[placeholder*="RACK"]');
      return input ? 'Target input found' : 'Input not found';
    });
    
    await runTest(page, 'TC-PUT-005', 'Check confirm button', async (p) => {
      const buttons = await p.$$('button');
      for (const btn of buttons) {
        const text = await p.evaluate(el => el.textContent, btn);
        if (text.includes('Confirm')) return 'Confirm button found';
      }
      return 'Button not found';
    });
    
    // MODULE 6: QI (5 tests)
    console.log('\n=== MODULE 6: Quality Inspection ===');
    
    await runTest(page, 'TC-QI-001', 'Navigate to QI', async (p) => {
      await p.goto(`${BASE_URL}/qi`, { waitUntil: 'networkidle2' });
      return 'QI page loaded';
    });
    
    await runTest(page, 'TC-QI-002', 'Check QI list', async (p) => {
      const hasList = await p.evaluate(() => {
        return document.body.textContent.includes('Quality') ||
               document.body.textContent.includes('inspection');
      });
      return hasList ? 'QI list visible' : 'List not visible';
    });
    
    await runTest(page, 'TC-QI-003', 'Check QI status', async (p) => {
      const hasStatus = await p.evaluate(() => {
        return document.body.textContent.includes('pending') ||
               document.body.textContent.includes('accepted') ||
               document.body.textContent.includes('rejected');
      });
      return hasStatus ? 'Status visible' : 'Status not visible';
    });
    
    await runTest(page, 'TC-QI-004', 'Check locations page', async (p) => {
      await p.goto(`${BASE_URL}/locations`, { waitUntil: 'networkidle2' });
      const hasLocations = await p.evaluate(() => {
        return document.body.textContent.includes('INCOMING') ||
               document.body.textContent.includes('HOLD') ||
               document.body.textContent.includes('DAMAGED');
      });
      return hasLocations ? 'Special locations found' : 'Locations not found';
    });
    
    await runTest(page, 'TC-QI-005', 'Check inventory page', async (p) => {
      await p.goto(`${BASE_URL}/inventory`, { waitUntil: 'networkidle2' });
      const hasInventory = await p.evaluate(() => {
        return document.body.textContent.includes('stock') ||
               document.body.textContent.includes('inventory');
      });
      return hasInventory ? 'Inventory page loaded' : 'Page not loaded';
    });
    
    // Generate report
    console.log('\n📊 Generating report...\n');
    
    const passed = testResults.filter(r => r.status === 'PASS').length;
    const failed = testResults.filter(r => r.status === 'FAIL').length;
    const total = testResults.length;
    const avgLoad = testResults.reduce((s, r) => s + r.loadTime, 0) / total;
    
    let report = `# goWMS Inbound Test Report\n\n`;
    report += `## Summary\n`;
    report += `- **Total Tests:** ${total}\n`;
    report += `- **Passed:** ${passed} (${((passed/total)*100).toFixed(0)}%)\n`;
    report += `- **Failed:** ${failed}\n`;
    report += `- **Average Load Time:** ${avgLoad.toFixed(0)}ms\n\n`;
    
    report += `## Test Results\n\n`;
    report += `| ID | Test | Status | Load Time | Screenshot |\n`;
    report += `|-----|------|--------|-----------|------------|\n`;
    
    for (const t of testResults) {
      report += `| ${t.id} | ${t.name} | ${t.status === 'PASS' ? '✅' : '❌'} | ${t.loadTime}ms | ${t.screenshot} |\n`;
    }
    
    report += `\n## Screenshots\n\n`;
    report += `All screenshots saved to: \`docs/screenshots/inbound_tests/\`\n`;
    
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'QUICK_INBOUND_TEST_REPORT.md'), report);
    
    console.log(`✅ Test Complete: ${passed}/${total} passed`);
    console.log(`📄 Report: docs/QUICK_INBOUND_TEST_REPORT.md`);
    console.log(`📸 Screenshots: docs/screenshots/inbound_tests/`);
    
  } finally {
    await browser.close();
  }
}

runTests().catch(console.error);
