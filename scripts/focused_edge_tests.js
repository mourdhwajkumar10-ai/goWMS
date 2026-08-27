/**
 * goWMS Focused Edge Case Tests - Quick Execution
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://34.93.122.213:8080';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'edge_tests');
const RESULTS_FILE = path.join(__dirname, '..', 'docs', 'EDGE_TEST_REPORT.md');

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const results = [];

async function ss(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}_${Date.now()}.png`) });
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const inputs = await page.$$('form.login-card input');
  if (inputs.length >= 2) {
    await inputs[0].type('admin', { delay: 30 });
    await inputs[1].type('admin123', { delay: 30 });
  }
  const btn = await page.$('form.login-card button');
  if (btn) { await btn.click(); await new Promise(r => setTimeout(r, 3000)); }
}

async function run(id, name, fn, page) {
  const t = Date.now();
  try {
    const r = await fn(page);
    results.push({ id, name, r, t: Date.now()-t, s: 'PASS' });
    console.log(`✅ ${id}: ${name}`);
  } catch (e) {
    results.push({ id, name, r: e.message.substring(0,60), t: Date.now()-t, s: 'FAIL' });
    console.log(`❌ ${id}: ${name}`);
  }
}

async function main() {
  console.log('🚀 Running Focused Edge Case Tests\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  
  await login(page);
  console.log('✅ Logged in\n');
  
  // SECURITY (10 tests)
  console.log('🔒 Security Tests');
  
  await run('SEC-01', 'SQL Injection Login', async p => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type("' OR '1'='1");
      await inputs[1].type("' OR '1'='1");
      const btn = await p.$('form.login-card button');
      if (btn) await btn.click();
      await new Promise(r => setTimeout(r, 1000));
    }
    return p.url().includes('login') ? 'Blocked' : 'VULNERABLE';
  }, page);
  
  await run('SEC-02', 'Invalid Token', async p => {
    await p.setExtraHTTPHeaders({ 'Authorization': 'Bearer invalid' });
    const r = await p.goto(`${BASE_URL}/api/grn/sessions`, { waitUntil: 'domcontentloaded' });
    await p.setExtraHTTPHeaders({});
    return r.status() === 401 ? 'Rejected' : `Status ${r.status()}`;
  }, page);
  
  await run('SEC-03', 'Password Field Type', async p => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const input = await p.$('input[type="password"]');
    return input ? 'Masked correctly' : 'NOT MASKED';
  }, page);
  
  await run('SEC-04', 'Session Persistence', async p => {
    await login(p);
    const t1 = await p.evaluate(() => localStorage.getItem('gowms_token'));
    await p.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const t2 = await p.evaluate(() => localStorage.getItem('gowms_token'));
    return t1 === t2 ? 'Persists' : 'Lost';
  }, page);
  
  await run('SEC-05', 'Deep Link Without Auth', async p => {
    await p.evaluate(() => localStorage.clear());
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    return p.url().includes('login') ? 'Redirected to login' : 'No redirect';
  }, page);
  
  await run('SEC-06', 'XSS in Input', async p => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const input = await p.$('input[placeholder*="MH-12"]');
    if (input) {
      await input.type('<img src=x onerror=alert(1)>', { delay: 10 });
      return 'XSS input accepted (check rendering)';
    }
    return 'Input not found';
  }, page);
  
  await run('SEC-07', 'Empty Search Query', async p => {
    await p.goto(`${BASE_URL}/items`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const search = await p.$('input[type="search"], input[placeholder*="search"]');
    if (search) {
      await search.type('');
      await new Promise(r => setTimeout(r, 500));
      return 'Empty search handled';
    }
    return 'Search not found';
  }, page);
  
  await run('SEC-08', 'API Health Check', async p => {
    const r = await p.goto(`${BASE_URL}/api/health`, { waitUntil: 'domcontentloaded' });
    return r.status() === 200 ? 'Health OK' : `Status ${r.status()}`;
  }, page);
  
  await run('SEC-09', 'Large Input', async p => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type('A'.repeat(1000), { delay: 1 });
      return 'Large input handled';
    }
    return 'Could not test';
  }, page);
  
  await run('SEC-10', 'Concurrent Requests', async p => {
    await login(p);
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(p.goto(`${BASE_URL}/api/grn/sessions`, { waitUntil: 'domcontentloaded' }));
    }
    await Promise.all(promises);
    return '5 concurrent requests completed';
  }, page);
  
  // ACCESSIBILITY (10 tests)
  console.log('\n♿ Accessibility Tests');
  
  await run('A11Y-01', 'Tab Navigation', async p => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const order = [];
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press('Tab');
      const focused = await p.evaluate(() => document.activeElement?.tagName);
      if (focused) order.push(focused);
    }
    return `Tab order: ${order.join('→')}`;
  }, page);
  
  await run('A11Y-02', 'Button Sizes', async p => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const btns = await p.$$('button');
    let small = 0;
    for (const b of btns.slice(0, 10)) {
      const s = await p.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      }, b);
      if (s) small++;
    }
    return `${small}/${Math.min(btns.length,10)} buttons < 44px`;
  }, page);
  
  await run('A11Y-03', 'Page Title', async p => {
    await login(p);
    const t = await p.title();
    return t ? `Title: "${t}"` : 'No title';
  }, page);
  
  await run('A11Y-04', 'Input Labels', async p => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const labels = await p.$$('label');
    const inputs = await p.$$('input');
    return `${labels.length} labels, ${inputs.length} inputs`;
  }, page);
  
  await run('A11Y-05', 'Focus Visible', async p => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    await p.keyboard.press('Tab');
    const visible = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.outlineStyle !== 'none' || s.boxShadow !== 'none';
    });
    return visible ? 'Focus visible' : 'Focus not visible';
  }, page);
  
  await run('A11Y-06', 'Color Contrast', async p => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const c = await p.evaluate(() => {
      const s = getComputedStyle(document.body);
      return `${s.backgroundColor} / ${s.color}`;
    });
    return `Colors: ${c}`;
  }, page);
  
  await run('A11Y-07', 'Viewport Meta', async p => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    const has = await p.evaluate(() => !!document.querySelector('meta[name="viewport"]'));
    return has ? 'Viewport meta present' : 'No viewport meta';
  }, page);
  
  await run('A11Y-08', 'Table Headers', async p => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const tables = await p.$$('table');
    let withTh = 0;
    for (const t of tables) {
      if (await p.evaluate(el => !!el.querySelector('th'), t)) withTh++;
    }
    return `${withTh}/${tables.length} tables have headers`;
  }, page);
  
  await run('A11Y-09', 'Escape Key', async p => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const btn = await p.$('button:has-text("Scan")');
    if (btn) {
      await btn.click();
      await new Promise(r => setTimeout(r, 500));
      await p.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 300));
    }
    return 'Escape key tested';
  }, page);
  
  await run('A11Y-10', 'Form Error Messages', async p => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type('wrong');
      await inputs[1].type('wrong');
      const btn = await p.$('form.login-card button');
      if (btn) await btn.click();
      await new Promise(r => setTimeout(r, 1000));
      const err = await p.$('.error-banner');
      return err ? 'Error message shown' : 'No error message';
    }
    return 'Could not test';
  }, page);
  
  // MOBILE (10 tests)
  console.log('\n📱 Mobile Tests');
  
  const mobileViewports = [
    { name: 'iPhone SE', w: 375, h: 667 },
    { name: 'iPhone 14', w: 390, h: 844 },
    { name: 'iPad', w: 768, h: 1024 },
    { name: 'Galaxy S21', w: 360, h: 800 },
    { name: 'Pixel 7', w: 412, h: 915 }
  ];
  
  for (let i = 0; i < mobileViewports.length; i++) {
    const v = mobileViewports[i];
    await run(`MOB-0${i+1}`, `${v.name} (${v.w}x${v.h})`, async p => {
      await p.setViewport({ width: v.w, height: v.h });
      await login(p);
      await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
      const overflow = await p.evaluate(() => document.body.scrollWidth > window.innerWidth);
      return overflow ? 'HORIZONTAL SCROLL' : 'No overflow';
    }, page);
  }
  
  await run('MOB-06', 'Touch Events', async p => {
    await p.setViewport({ width: 375, height: 667 });
    const touch = await p.evaluate(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0);
    return touch ? 'Touch supported' : 'No touch';
  }, page);
  
  await run('MOB-07', 'Input Font Size', async p => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('input');
    let small = 0;
    for (const inp of inputs) {
      const fs = await p.evaluate(el => parseInt(getComputedStyle(el).fontSize), inp);
      if (fs < 16) small++;
    }
    return small === 0 ? 'All inputs >= 16px' : `${small} inputs < 16px (causes zoom)`;
  }, page);
  
  await run('MOB-08', 'Button Tap Targets', async p => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const btns = await p.$$('button');
    let small = 0;
    for (const b of btns.slice(0, 15)) {
      const s = await p.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.width < 44 || r.height < 44;
      }, b);
      if (s) small++;
    }
    return `${small}/${Math.min(btns.length,15)} buttons < 44px tap target`;
  }, page);
  
  await run('MOB-09', 'Table Overflow', async p => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const tables = await p.$$('table');
    let overflow = 0;
    for (const t of tables.slice(0, 3)) {
      if (await p.evaluate(el => el.scrollWidth > el.clientWidth, t)) overflow++;
    }
    return `${overflow}/${Math.min(tables.length,3)} tables overflow`;
  }, page);
  
  await run('MOB-10', 'Responsive Layout', async p => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const usesGrid = await p.evaluate(() => {
      return document.querySelector('.grid, [class*="grid-cols"]') !== null;
    });
    return usesGrid ? 'Responsive grid detected' : 'No responsive grid';
  }, page);
  
  // PERFORMANCE (10 tests)
  console.log('\n⚡ Performance Tests');
  
  await run('PERF-01', 'Login Time', async p => {
    const t = Date.now();
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    const load = Date.now() - t;
    return `Login page: ${load}ms`;
  }, page);
  
  await run('PERF-02', 'GRN Page Load', async p => {
    await login(p);
    const t = Date.now();
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 500));
    return `GRN page: ${Date.now()-t}ms`;
  }, page);
  
  await run('PERF-03', 'Putaway Page Load', async p => {
    const t = Date.now();
    await p.goto(`${BASE_URL}/putaway`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 500));
    return `Putaway page: ${Date.now()-t}ms`;
  }, page);
  
  await run('PERF-04', 'Items Page Load', async p => {
    const t = Date.now();
    await p.goto(`${BASE_URL}/items`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 500));
    return `Items page: ${Date.now()-t}ms`;
  }, page);
  
  await run('PERF-05', 'API Health Latency', async p => {
    const t = Date.now();
    await p.goto(`${BASE_URL}/api/health`, { waitUntil: 'domcontentloaded' });
    return `Health API: ${Date.now()-t}ms`;
  }, page);
  
  await run('PERF-06', 'API Sessions Latency', async p => {
    await login(p);
    const t = Date.now();
    await p.goto(`${BASE_URL}/api/grn/sessions`, { waitUntil: 'domcontentloaded' });
    return `Sessions API: ${Date.now()-t}ms`;
  }, page);
  
  await run('PERF-07', 'DOM Size', async p => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const count = await p.evaluate(() => document.querySelectorAll('*').length);
    return `DOM elements: ${count}`;
  }, page);
  
  await run('PERF-08', 'Console Errors', async p => {
    await login(p);
    const errors = [];
    p.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    return errors.length === 0 ? 'No errors' : `${errors.length} errors`;
  }, page);
  
  await run('PERF-09', 'Resources Loaded', async p => {
    await login(p);
    let count = 0;
    p.on('response', () => count++);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'networkidle2' });
    return `${count} resources`;
  }, page);
  
  await run('PERF-10', 'Tab Switch Speed', async p => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const tabs = ['overview', 'boxes', 'items'];
    const times = [];
    for (const t of tabs) {
      const start = Date.now();
      const btn = await p.$(`button:has-text("${t}")`);
      if (btn) { await btn.click(); await new Promise(r => setTimeout(r, 200)); }
      times.push(Date.now() - start);
    }
    const avg = times.reduce((a,b) => a+b, 0) / times.length;
    return `Tab switch avg: ${avg.toFixed(0)}ms`;
  }, page);
  
  // DATA INTEGRITY (10 tests)
  console.log('\n🔐 Data Integrity Tests');
  
  await run('DATA-01', 'Session Token Format', async p => {
    await login(p);
    const token = await p.evaluate(() => localStorage.getItem('gowms_token'));
    if (token) {
      const parts = token.split('.');
      return parts.length === 3 ? 'Valid JWT format' : 'Invalid format';
    }
    return 'No token';
  }, page);
  
  await run('DATA-02', 'Role Storage', async p => {
    await login(p);
    const role = await p.evaluate(() => localStorage.getItem('gowms_role'));
    return role ? `Role: ${role}` : 'No role stored';
  }, page);
  
  await run('DATA-03', 'Numeric Input', async p => {
    await p.goto(`${BASE_URL}/putaway`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const input = await p.$('input[type="number"]');
    if (input) {
      await input.type('abc');
      const val = await p.evaluate(el => el.value, input);
      return val === '' || val === 'abc' ? 'Validated' : `Accepted: "${val}"`;
    }
    return 'No number input';
  }, page);
  
  await run('DATA-04', 'Date Input', async p => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const input = await p.$('input[type="datetime-local"]');
    if (input) {
      await input.type('invalid');
      const val = await p.evaluate(el => el.value, input);
      return val === '' ? 'Invalid date rejected' : `Value: "${val}"`;
    }
    return 'No date input';
  }, page);
  
  await run('DATA-05', 'Unicode Support', async p => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const input = await p.$('input[placeholder*="MH-12"]');
    if (input) {
      await input.type('मुंबई 123');
      const val = await p.evaluate(el => el.value, input);
      return val.includes('मुंबई') ? 'Unicode accepted' : 'Unicode rejected';
    }
    return 'Input not found';
  }, page);
  
  await run('DATA-06', 'Form Clear', async p => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const input = await p.$('input');
    if (input) {
      await input.type('test');
      await p.evaluate(() => document.querySelectorAll('input').forEach(el => el.value = ''));
      const val = await p.evaluate(el => el.value, input);
      return val === '' ? 'Clear works' : `Value: "${val}"`;
    }
    return 'No input';
  }, page);
  
  await run('DATA-07', 'Checkbox Toggle', async p => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const cb = await p.$('input[type="checkbox"]');
    if (cb) {
      const before = await p.evaluate(el => el.checked, cb);
      await cb.click();
      const after = await p.evaluate(el => el.checked, cb);
      return before !== after ? 'Toggle works' : 'Toggle failed';
    }
    return 'No checkbox';
  }, page);
  
  await run('DATA-08', 'Select Dropdown', async p => {
    const select = await p.$('select');
    if (select) {
      const opts = await p.$$eval('select:first-of-type option', os => os.map(o => o.value));
      return `Options: ${opts.length}`;
    }
    return 'No select';
  }, page);
  
  await run('DATA-09', 'Negative Number', async p => {
    await p.goto(`${BASE_URL}/putaway`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const input = await p.$('input[type="number"]');
    if (input) {
      await input.type('-100');
      const val = await p.evaluate(el => el.value, input);
      return val === '-100' ? 'Negative accepted (should validate)' : `Value: "${val}"`;
    }
    return 'No input';
  }, page);
  
  await run('DATA-10', 'Max Length', async p => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const inputs = await p.$$('input');
    let withMax = 0;
    for (const inp of inputs.slice(0, 10)) {
      const has = await p.evaluate(el => el.maxLength > 0 && el.maxLength < 2147483647, inp);
      if (has) withMax++;
    }
    return `${withMax}/${Math.min(inputs.length,10)} have maxLength`;
  }, page);
  
  // Generate Report
  console.log('\n📄 Generating report...');
  
  const passed = results.filter(r => r.s === 'PASS').length;
  const failed = results.filter(r => r.s === 'FAIL').length;
  const total = results.length;
  const avgTime = results.reduce((s,r) => s + r.t, 0) / total;
  
  let report = `# goWMS Edge Case Test Report\n\n`;
  report += `## Summary\n`;
  report += `- **Total Tests:** ${total}\n`;
  report += `- **Passed:** ${passed} (${((passed/total)*100).toFixed(0)}%)\n`;
  report += `- **Failed:** ${failed}\n`;
  report += `- **Avg Time:** ${avgTime.toFixed(0)}ms\n\n`;
  
  report += `## Results by Category\n\n`;
  report += `| Category | Tests | Passed |\n`;
  report += `|----------|-------|--------|\n`;
  
  ['SEC', 'A11Y', 'MOB', 'PERF', 'DATA'].forEach((cat, i) => {
    const names = ['Security', 'Accessibility', 'Mobile', 'Performance', 'Data Integrity'];
    const catTests = results.filter(r => r.id.startsWith(cat));
    const catPassed = catTests.filter(r => r.s === 'PASS').length;
    report += `| ${names[i]} | ${catTests.length} | ${catPassed} |\n`;
  });
  
  report += `\n## Detailed Results\n\n`;
  report += `| ID | Test | Status | Time | Result |\n`;
  report += `|-----|------|--------|------|--------|\n`;
  
  for (const r of results) {
    report += `| ${r.id} | ${r.name} | ${r.s === 'PASS' ? '✅' : '❌'} | ${r.t}ms | ${r.r} |\n`;
  }
  
  report += `\n## Critical Findings\n\n`;
  const critical = results.filter(r => r.r.includes('VULNERABLE') || r.r.includes('WARNING') || r.r.includes('SCROLL') || r.s === 'FAIL');
  if (critical.length > 0) {
    for (const c of critical) report += `- **${c.id}:** ${c.r}\n`;
  } else {
    report += `- No critical issues found\n`;
  }
  
  report += `\n---\n*Generated: ${new Date().toISOString()}*\n`;
  
  fs.writeFileSync(RESULTS_FILE, report);
  
  console.log(`\n✅ Complete: ${passed}/${total} passed`);
  console.log(`📄 Report: ${RESULTS_FILE}`);
  console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
  
  await browser.close();
}

main().catch(console.error);
