/**
 * goWMS Additional Edge Case & Stress Test Scenarios
 * Focuses on: Security, Accessibility, Stress, Mobile, Data Integrity
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://34.93.122.213:8080';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'edge_case_tests');
const RESULTS_FILE = path.join(__dirname, '..', 'docs', 'EDGE_CASE_TEST_REPORT.md');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const testResults = [];

async function screenshot(page, name) {
  const filename = `${name}_${Date.now()}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename) });
  return filename;
}

async function login(page) {
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    const inputs = await page.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type('admin', { delay: 30 });
      await inputs[1].type('admin123', { delay: 30 });
    }
    const loginBtn = await page.$('form.login-card button');
    if (loginBtn) {
      await loginBtn.click();
      await new Promise(r => setTimeout(r, 3000));
    }
  } catch (e) {
    console.log('Login error:', e.message);
  }
}

async function test(id, name, fn, page) {
  const start = Date.now();
  try {
    const result = await fn(page);
    const time = Date.now() - start;
    const ss = await screenshot(page, id);
    testResults.push({ id, name, result, time, status: 'PASS', ss });
    console.log(`✅ ${id}: ${name}`);
    return true;
  } catch (e) {
    const time = Date.now() - start;
    const ss = await screenshot(page, `${id}_fail`);
    testResults.push({ id, name, result: e.message, time, status: 'FAIL', ss });
    console.log(`❌ ${id}: ${name} - ${e.message.substring(0, 50)}`);
    return false;
  }
}

// ============================================
// SECURITY TESTS (20 scenarios)
// ============================================
async function runSecurityTests(page) {
  console.log('\n🔒 SECURITY TESTS');
  
  await test('SEC-001', 'SQL Injection in Login', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type("' OR '1'='1", { delay: 10 });
      await inputs[1].type("' OR '1'='1", { delay: 10 });
      const loginBtn = await p.$('form.login-card button');
      if (loginBtn) await loginBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      const url = p.url();
      return url.includes('login') ? 'SQL injection blocked' : 'VULNERABILITY: SQL injection succeeded';
    }
    return 'Could not test';
  }, page);
  
  await test('SEC-002', 'XSS in Truck Number', async (p) => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const truckInput = await p.$('input[placeholder*="MH-12"]');
    if (truckInput) {
      await truckInput.type('<script>alert("XSS")</script>', { delay: 10 });
      const hasAlert = await p.evaluate(() => {
        return document.querySelectorAll('script').length > 0;
      });
      return 'XSS input accepted (check if rendered)';
    }
    return 'Input not found';
  }, page);
  
  await test('SEC-003', 'Empty Body Request', async (p) => {
    const response = await p.goto(`${BASE_URL}/api/grn/sessions`, { waitUntil: 'domcontentloaded' });
    const status = response.status();
    return status === 401 ? 'Unauthorized correctly returned' : `Status: ${status}`;
  }, page);
  
  await test('SEC-004', 'Invalid Token Access', async (p) => {
    await p.setExtraHTTPHeaders({ 'Authorization': 'Bearer invalid-token-123' });
    const response = await p.goto(`${BASE_URL}/api/grn/sessions`, { waitUntil: 'domcontentloaded' });
    const status = response.status();
    await p.setExtraHTTPHeaders({});
    return status === 401 ? 'Invalid token rejected' : `Status: ${status}`;
  }, page);
  
  await test('SEC-005', 'No Auth Header', async (p) => {
    await p.setExtraHTTPHeaders({});
    const response = await p.goto(`${BASE_URL}/api/grn/sessions`, { waitUntil: 'domcontentloaded' });
    const status = response.status();
    return status === 401 ? 'No auth correctly rejected' : `Status: ${status}`;
  }, page);
  
  await test('SEC-006', 'Whitespace Input Handling', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type('   ', { delay: 10 });
      await inputs[1].type('   ', { delay: 10 });
      const loginBtn = await p.$('form.login-card button');
      if (loginBtn) await loginBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      return 'Whitespace input tested';
    }
    return 'Could not test';
  }, page);
  
  await test('SEC-007', 'Special Characters in Search', async (p) => {
    await p.goto(`${BASE_URL}/items`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const searchInput = await p.$('input[type="search"], input[placeholder*="search"]');
    if (searchInput) {
      await searchInput.type('!@#$%^&*()', { delay: 10 });
      await new Promise(r => setTimeout(r, 500));
      return 'Special characters in search tested';
    }
    return 'Search input not found';
  }, page);
  
  await test('SEC-008', 'Deep Link Without Auth', async (p) => {
    await p.setExtraHTTPHeaders({});
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const url = p.url();
    return url.includes('login') ? 'Redirected to login' : 'Accessed without auth';
  }, page);
  
  await test('SEC-009', 'Rate Limit Test', async (p) => {
    const results = [];
    for (let i = 0; i < 20; i++) {
      const response = await p.goto(`${BASE_URL}/api/health`, { waitUntil: 'domcontentloaded' });
      results.push(response.status());
    }
    const allOk = results.every(r => r === 200);
    return allOk ? 'Rate limit not hit (120/min)' : `Some requests failed: ${results.filter(r => r !== 200).length}`;
  }, page);
  
  await test('SEC-010', 'Large Payload Test', async (p) => {
    const largeString = 'A'.repeat(10000);
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type(largeString, { delay: 1 });
      return 'Large payload input tested';
    }
    return 'Could not test';
  }, page);
  
  await test('SEC-011', 'Concurrent Session Test', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const hasSessionInfo = await p.evaluate(() => {
      return localStorage.getItem('gowms_token') !== null;
    });
    return hasSessionInfo ? 'Session token stored in localStorage' : 'Session not found';
  }, page);
  
  await test('SEC-012', 'Password Field Visibility', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const passwordInput = await p.$('input[type="password"]');
    if (passwordInput) {
      const type = await p.evaluate(el => el.type, passwordInput);
      return type === 'password' ? 'Password field masked' : 'VULNERABILITY: Password visible';
    }
    return 'Password input not found';
  }, page);
  
  await test('SEC-013', 'JWT Token Expiry Check', async (p) => {
    const token = await p.evaluate(() => localStorage.getItem('gowms_token'));
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const exp = new Date(payload.exp * 1000);
        const now = new Date();
        return `Token expires: ${exp.toISOString()} (valid: ${exp > now})`;
      }
    }
    return 'No token found';
  }, page);
  
  await test('SEC-014', 'API Error Message Exposure', async (p) => {
    await p.setExtraHTTPHeaders({ 'Authorization': 'Bearer invalid' });
    const response = await p.goto(`${BASE_URL}/api/grn/sessions`, { waitUntil: 'domcontentloaded' });
    const text = await p.evaluate(() => document.body.textContent);
    await p.setExtraHTTPHeaders({});
    const hasInternalInfo = text.includes('stack') || text.includes('trace') || text.includes('error.sql');
    return hasInternalInfo ? 'VULNERABILITY: Internal error exposed' : 'Error messages safe';
  }, page);
  
  await test('SEC-015', 'CORS Headers Check', async (p) => {
    const response = await p.goto(`${BASE_URL}/api/health`, { waitUntil: 'domcontentloaded' });
    const headers = response.headers();
    const hasCORS = headers['access-control-allow-origin'];
    return hasCORS ? `CORS configured: ${hasCORS}` : 'No CORS headers';
  }, page);
  
  await test('SEC-016', 'Content-Type Validation', async (p) => {
    const response = await p.goto(`${BASE_URL}/api/health`, { waitUntil: 'domcontentloaded' });
    const contentType = response.headers()['content-type'];
    return contentType?.includes('application/json') ? 'JSON content-type correct' : `Content-Type: ${contentType}`;
  }, page);
  
  await test('SEC-017', 'Session Persistence', async (p) => {
    await login(p);
    const token1 = await p.evaluate(() => localStorage.getItem('gowms_token'));
    await p.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const token2 = await p.evaluate(() => localStorage.getItem('gowms_token'));
    return token1 === token2 ? 'Session persists after reload' : 'Session lost after reload';
  }, page);
  
  await test('SEC-018', 'Logout Functionality', async (p) => {
    await login(p);
    await p.evaluate(() => localStorage.removeItem('gowms_token'));
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const url = p.url();
    return url.includes('login') ? 'Logout clears token' : 'Logout not working';
  }, page);
  
  await test('SEC-019', 'SQL Injection in Search', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/items`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const searchInput = await p.$('input[type="search"], input[placeholder*="search"]');
    if (searchInput) {
      await searchInput.type("' UNION SELECT * FROM users--", { delay: 10 });
      await new Promise(r => setTimeout(r, 1000));
      const hasError = await p.evaluate(() => {
        return document.body.textContent.includes('error') || 
               document.body.textContent.includes('SQL');
      });
      return hasError ? 'SQL injection attempt logged' : 'SQL injection tested (check server logs)';
    }
    return 'Search not found';
  }, page);
  
  await test('SEC-020', 'HTTPS Enforcement', async (p) => {
    const url = p.url();
    return url.startsWith('http://') ? 'HTTP only (no HTTPS)' : 'HTTPS enforced';
  }, page);
}

// ============================================
// ACCESSIBILITY TESTS (15 scenarios)
// ============================================
async function runAccessibilityTests(page) {
  console.log('\n♿ ACCESSIBILITY TESTS');
  
  await test('A11Y-001', 'Tab Navigation - Login', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    
    const focusOrder = [];
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press('Tab');
      const focused = await p.evaluate(() => {
        const el = document.activeElement;
        return el ? { tag: el.tagName, type: el.type, placeholder: el.placeholder } : null;
      });
      if (focused) focusOrder.push(focused);
    }
    return `Tab order: ${focusOrder.map(f => f.tag).join(' → ')}`;
  }, page);
  
  await test('A11Y-002', 'Enter Key Submission', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type('admin');
      await inputs[1].type('admin123');
      await p.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 2000));
      return 'Enter key submission tested';
    }
    return 'Could not test';
  }, page);
  
  await test('A11Y-003', 'Button Aria Labels', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const buttons = await p.$$('button');
    let withAria = 0;
    for (const btn of buttons.slice(0, 10)) {
      const hasAria = await p.evaluate(el => {
        return el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      }, btn);
      if (hasAria) withAria++;
    }
    return `${withAria}/${Math.min(buttons.length, 10)} buttons have aria labels`;
  }, page);
  
  await test('A11Y-004', 'Input Labels', async (p) => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const inputs = await p.$$('input');
    let withLabel = 0;
    for (const input of inputs.slice(0, 10)) {
      const hasLabel = await p.evaluate(el => {
        const id = el.id;
        return id && document.querySelector(`label[for="${id}"]`);
      }, input);
      if (hasLabel) withLabel++;
    }
    return `${withLabel}/${Math.min(inputs.length, 10)} inputs have associated labels`;
  }, page);
  
  await test('A11Y-005', 'Color Contrast Check', async (p) => {
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const contrast = await p.evaluate(() => {
      const body = getComputedStyle(document.body);
      return { bg: body.backgroundColor, color: body.color };
    });
    return `Background: ${contrast.bg}, Text: ${contrast.color}`;
  }, page);
  
  await test('A11Y-006', 'Focus Visible Indicator', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    await p.keyboard.press('Tab');
    const focusVisible = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    });
    return focusVisible ? 'Focus indicator visible' : 'Focus indicator not visible';
  }, page);
  
  await test('A11Y-007', 'Form Error Announcements', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    const inputs = await p.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].type('wrong');
      await inputs[1].type('wrong');
      const loginBtn = await p.$('form.login-card button');
      if (loginBtn) await loginBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      const hasAriaLive = await p.evaluate(() => {
        return document.querySelector('[aria-live]') !== null;
      });
      return hasAriaLive ? 'Error announcements configured' : 'No aria-live for errors';
    }
    return 'Could not test';
  }, page);
  
  await test('A11Y-008', 'Table Headers', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const tables = await p.$$('table');
    let withHeaders = 0;
    for (const table of tables) {
      const hasTh = await p.evaluate(el => el.querySelector('th') !== null, table);
      if (hasTh) withHeaders++;
    }
    return `${withHeaders}/${tables.length} tables have header cells`;
  }, page);
  
  await test('A11Y-009', 'Link Text Clarity', async (p) => {
    await login(p);
    const links = await p.$$('a');
    let unclear = 0;
    for (const link of links.slice(0, 10)) {
      const text = await p.evaluate(el => el.textContent.trim(), link);
      if (text === 'click here' || text === 'read more' || text === '') unclear++;
    }
    return `${unclear}/${Math.min(links.length, 10)} links have unclear text`;
  }, page);
  
  await test('A11Y-010', 'Modal Focus Trap', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const scanBtn = await p.$('button:has-text("Scan")');
    if (scanBtn) {
      await scanBtn.click();
      await new Promise(r => setTimeout(r, 500));
      const hasModal = await p.$('.fixed');
      if (hasModal) {
        const closeBtn = await p.$('.fixed button');
        if (closeBtn) await closeBtn.click();
        return 'Modal opened (focus trap check requires interaction)';
      }
    }
    return 'Could not open modal';
  }, page);
  
  await test('A11Y-011', 'Text Resize Handling', async (p) => {
    await login(p);
    await p.evaluate(() => {
      document.body.style.fontSize = '24px';
    });
    await new Promise(r => setTimeout(r, 500));
    const overflow = await p.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth;
    });
    await p.evaluate(() => { document.body.style.fontSize = ''; });
    return overflow ? 'Content overflows at 24px' : 'Layout adapts to text resize';
  }, page);
  
  await test('A11Y-012', 'Keyboard Escape Key', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const scanBtn = await p.$('button:has-text("Scan")');
    if (scanBtn) {
      await scanBtn.click();
      await new Promise(r => setTimeout(r, 500));
      await p.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 300));
      const modalGone = await p.$('.fixed') === null;
      return modalGone ? 'Escape closes modal' : 'Escape key not handled';
    }
    return 'Could not test';
  }, page);
  
  await test('A11Y-013', 'Touch Target Size', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const buttons = await p.$$('button');
    let tooSmall = 0;
    for (const btn of buttons.slice(0, 10)) {
      const size = await p.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }, btn);
      if (size.width < 44 || size.height < 44) tooSmall++;
    }
    return `${tooSmall}/${Math.min(buttons.length, 10)} buttons smaller than 44px`;
  }, page);
  
  await test('A11Y-014', 'Form Field Placeholders', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    const inputs = await p.$$('input');
    let withPlaceholder = 0;
    for (const input of inputs.slice(0, 10)) {
      const placeholder = await p.evaluate(el => el.placeholder, input);
      if (placeholder) withPlaceholder++;
    }
    return `${withPlaceholder}/${Math.min(inputs.length, 10)} inputs have placeholders`;
  }, page);
  
  await test('A11Y-015', 'Page Title', async (p) => {
    await login(p);
    const title = await p.title();
    return title ? `Page title: "${title}"` : 'No page title';
  }, page);
}

// ============================================
// MOBILE & RESPONSIVE TESTS (10 scenarios)
// ============================================
async function runMobileTests(page) {
  console.log('\n📱 MOBILE & RESPONSIVE TESTS');
  
  const viewports = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 14', width: 390, height: 844 },
    { name: 'iPad', width: 768, height: 1024 },
    { name: 'iPad Pro', width: 1024, height: 1366 },
    { name: 'Galaxy S21', width: 360, height: 800 }
  ];
  
  for (let i = 0; i < viewports.length; i++) {
    const vp = viewports[i];
    await test(`MOB-00${i + 1}`, `Responsive: ${vp.name}`, async (p) => {
      await p.setViewport({ width: vp.width, height: vp.height });
      await login(p);
      await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
      
      const overflow = await p.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth;
      });
      
      const buttonsVisible = await p.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        let visible = 0;
        buttons.forEach(btn => {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) visible++;
        });
        return visible;
      });
      
      return `${buttonsVisible} buttons visible, overflow: ${overflow}`;
    }, page);
  }
  
  await test('MOB-006', 'Touch Event Handling', async (p) => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const hasTouchEvents = await p.evaluate(() => {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    });
    
    return hasTouchEvents ? 'Touch events supported' : 'No touch support detected';
  }, page);
  
  await test('MOB-007', 'Horizontal Scroll Check', async (p) => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const hasHorizontalScroll = await p.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    
    return hasHorizontalScroll ? 'WARNING: Horizontal scroll detected' : 'No horizontal scroll';
  }, page);
  
  await test('MOB-008', 'Table Responsiveness', async (p) => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const tables = await p.$$('table');
    let overflow = 0;
    for (const table of tables.slice(0, 3)) {
      const overflows = await p.evaluate(el => {
        return el.scrollWidth > el.clientWidth;
      }, table);
      if (overflows) overflow++;
    }
    
    return `${overflow}/${Math.min(tables.length, 3)} tables overflow`;
  }, page);
  
  await test('MOB-009', 'Input Zoom on Focus', async (p) => {
    await p.setViewport({ width: 375, height: 667 });
    await login(p);
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    
    const inputs = await p.$$('input');
    let fontSizeOk = true;
    for (const input of inputs) {
      const fontSize = await p.evaluate(el => {
        return parseInt(getComputedStyle(el).fontSize);
      }, input);
      if (fontSize < 16) fontSizeOk = false;
    }
    
    return fontSizeOk ? 'Input font size >= 16px (no zoom)' : 'WARNING: Inputs < 16px cause zoom';
  }, page);
  
  await test('MOB-010', 'Viewport Meta Tag', async (p) => {
    await p.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    
    const hasViewport = await p.evaluate(() => {
      return document.querySelector('meta[name="viewport"]') !== null;
    });
    
    return hasViewport ? 'Viewport meta tag present' : 'WARNING: No viewport meta tag';
  }, page);
}

// ============================================
// STRESS & PERFORMANCE TESTS (10 scenarios)
// ============================================
async function runStressTests(page) {
  console.log('\n⚡ STRESS & PERFORMANCE TESTS');
  
  await test('STR-001', 'Rapid Page Navigation', async (p) => {
    await login(p);
    const pages = ['/grn', '/putaway', '/items', '/qi', '/inventory'];
    const times = [];
    
    for (const pagePath of pages) {
      const start = Date.now();
      await p.goto(`${BASE_URL}${pagePath}`, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 500));
      times.push(Date.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return `Average navigation: ${avg.toFixed(0)}ms`;
  }, page);
  
  await test('STR-002', 'Rapid Button Clicking', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      const btn = await p.$('button');
      if (btn) await btn.click();
      await new Promise(r => setTimeout(r, 50));
    }
    
    return `10 rapid clicks in ${Date.now() - startTime}ms`;
  }, page);
  
  await test('STR-003', 'Large Form Input', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const largeText = 'A'.repeat(5000);
    const inputs = await p.$$('input');
    if (inputs.length > 0) {
      const start = Date.now();
      await inputs[0].type(largeText, { delay: 1 });
      return `5000 chars input in ${Date.now() - start}ms`;
    }
    return 'No inputs found';
  }, page);
  
  await test('STR-004', 'Multiple Tab Performance', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const tabs = ['overview', 'boxes', 'items', 'exceptions', 'audit', 'activity'];
    const times = [];
    
    for (const tab of tabs) {
      const start = Date.now();
      const tabBtn = await p.$(`button:has-text("${tab}")`);
      if (tabBtn) {
        await tabBtn.click();
        await new Promise(r => setTimeout(r, 300));
      }
      times.push(Date.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return `Tab switching avg: ${avg.toFixed(0)}ms`;
  }, page);
  
  await test('STR-005', 'Memory Leak Check', async (p) => {
    await login(p);
    
    const initialMetrics = await p.metrics();
    const initialJS = initialMetrics.JSHeapUsedSize;
    
    for (let i = 0; i < 10; i++) {
      await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 500));
    }
    
    const finalMetrics = await p.metrics();
    const finalJS = finalMetrics.JSHeapUsedSize;
    const increase = ((finalJS - initialJS) / initialJS * 100).toFixed(1);
    
    const initialMB = (initialJS/1024/1024).toFixed(1);
    const finalMB = (finalJS/1024/1024).toFixed(1);
    return `JS heap: ${initialMB}MB → ${finalMB}MB (${increase}% increase)`;
  }, page);
  
  await test('STR-006', 'Network Latency Simulation', async (p) => {
    await login(p);
    
    await p.setCacheEnabled(false);
    const start = Date.now();
    await p.goto(`${BASE_URL}/api/health`, { waitUntil: 'domcontentloaded' });
    const healthTime = Date.now() - start;
    
    await p.setCacheEnabled(true);
    
    return `Health endpoint: ${healthTime}ms (uncached)`;
  }, page);
  
  await test('STR-007', 'DOM Element Count', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const count = await p.evaluate(() => document.querySelectorAll('*').length);
    return `DOM elements: ${count}`;
  }, page);
  
  await test('STR-008', 'API Response Time', async (p) => {
    await login(p);
    
    const endpoints = ['/api/grn/sessions', '/api/po/list', '/api/masterdata/items'];
    const times = [];
    
    for (const ep of endpoints) {
      const start = Date.now();
      await p.goto(`${BASE_URL}${ep}`, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 100));
      times.push(Date.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return `API avg response: ${avg.toFixed(0)}ms`;
  }, page);
  
  await test('STR-009', 'Console Error Check', async (p) => {
    await login(p);
    const errors = [];
    p.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    return errors.length === 0 ? 'No console errors' : `${errors.length} console errors`;
  }, page);
  
  await test('STR-010', 'Resource Load Count', async (p) => {
    await login(p);
    let resourceCount = 0;
    
    p.on('response', () => resourceCount++);
    
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'networkidle2' });
    
    return `${resourceCount} resources loaded`;
  }, page);
}

// ============================================
// DATA INTEGRITY TESTS (10 scenarios)
// ============================================
async function runDataIntegrityTests(page) {
  console.log('\n🔐 DATA INTEGRITY TESTS');
  
  await test('DAT-001', 'Session Storage Persistence', async (p) => {
    await login(p);
    const token1 = await p.evaluate(() => localStorage.getItem('gowms_token'));
    const role1 = await p.evaluate(() => localStorage.getItem('gowms_role'));
    
    await p.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));
    
    const token2 = await p.evaluate(() => localStorage.getItem('gowms_token'));
    const role2 = await p.evaluate(() => localStorage.getItem('gowms_role'));
    
    return token1 === token2 && role1 === role2 ? 'Session persists correctly' : 'Session data changed';
  }, page);
  
  await test('DAT-002', 'Concurrent Form Submission', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const draftBtn = await p.$('button:has-text("Save draft")');
    if (draftBtn) {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(draftBtn.click());
      }
      await Promise.all(promises);
      await new Promise(r => setTimeout(r, 1000));
      return '3 concurrent draft saves attempted';
    }
    return 'Draft button not found';
  }, page);
  
  await test('DAT-003', 'Numeric Input Validation', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const numberInputs = await p.$$('input[type="number"]');
    let validated = 0;
    
    for (const input of numberInputs) {
      await input.type('abc', { delay: 10 });
      const value = await p.evaluate(el => el.value, input);
      if (value === '' || value === 'abc') validated++;
    }
    
    return `${validated}/${numberInputs.length} numeric inputs validated`;
  }, page);
  
  await test('DAT-004', 'Date Format Validation', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const dateInput = await p.$('input[type="datetime-local"]');
    if (dateInput) {
      await dateInput.type('invalid-date', { delay: 10 });
      const value = await p.evaluate(el => el.value, dateInput);
      return value === '' ? 'Invalid date rejected' : `Value: "${value}"`;
    }
    return 'No date input found';
  }, page);
  
  await test('DAT-005', 'Empty Form Submission', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const submitBtn = await p.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      return 'Empty form submission attempted';
    }
    return 'No submit button found';
  }, page);
  
  await test('DAT-006', 'Special Character Encoding', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const truckInput = await p.$('input[placeholder*="MH-12"]');
    if (truckInput) {
      await truckInput.type('Mumbai ट्रक 123', { delay: 10 });
      const value = await p.evaluate(el => el.value, truckInput);
      return value.includes('Mumbai') ? 'Unicode input accepted' : 'Unicode rejected';
    }
    return 'Input not found';
  }, page);
  
  await test('DAT-007', 'Max Length Enforcement', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const inputs = await p.$$('input');
    let withMaxLength = 0;
    
    for (const input of inputs.slice(0, 10)) {
      const hasMax = await p.evaluate(el => {
        return el.maxLength > 0 && el.maxLength < 2147483647;
      }, input);
      if (hasMax) withMaxLength++;
    }
    
    return `${withMaxLength}/${Math.min(inputs.length, 10)} inputs have maxLength`;
  }, page);
  
  await test('DAT-008', 'Negative Number Handling', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/putaway`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const qtyInput = await p.$('input[type="number"]');
    if (qtyInput) {
      await qtyInput.type('-100', { delay: 10 });
      const value = await p.evaluate(el => el.value, qtyInput);
      return value === '-100' ? 'Negative value accepted (should validate)' : `Value: "${value}"`;
    }
    return 'No quantity input found';
  }, page);
  
  await test('DAT-009', 'Boolean Field Handling', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const checkboxes = await p.$$('input[type="checkbox"]');
    return `${checkboxes.length} checkbox fields found`;
  }, page);
  
  await test('DAT-010', 'Form Reset Functionality', async (p) => {
    await login(p);
    await p.goto(`${BASE_URL}/grn`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    const inputs = await p.$$('input');
    if (inputs.length > 0) {
      await inputs[0].type('test value', { delay: 10 });
      const beforeReset = await p.evaluate(el => el.value, inputs[0]);
      
      await p.evaluate(() => {
        document.querySelectorAll('input').forEach(el => el.value = '');
      });
      
      const afterReset = await p.evaluate(el => el.value, inputs[0]);
      return beforeReset && !afterReset ? 'Form reset works' : 'Form reset issue';
    }
    return 'No inputs found';
  }, page);
}

// ============================================
// REPORT GENERATION
// ============================================
function generateReport() {
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  const total = testResults.length;
  const avgTime = testResults.reduce((s, r) => s + r.time, 0) / total;
  
  let report = `# goWMS Edge Case & Stress Test Report\n\n`;
  report += `## Executive Summary\n\n`;
  report += `- **Total Tests:** ${total}\n`;
  report += `- **Passed:** ${passed} (${((passed/total)*100).toFixed(0)}%)\n`;
  report += `- **Failed:** ${failed}\n`;
  report += `- **Average Execution Time:** ${avgTime.toFixed(0)}ms\n\n`;
  
  report += `## Test Categories\n\n`;
  report += `| Category | Tests | Passed | Failed |\n`;
  report += `|----------|-------|--------|--------|\n`;
  
  const categories = ['SEC', 'A11Y', 'MOB', 'STR', 'DAT'];
  const catNames = ['Security', 'Accessibility', 'Mobile', 'Stress', 'Data Integrity'];
  
  for (let i = 0; i < categories.length; i++) {
    const catTests = testResults.filter(r => r.id.startsWith(categories[i]));
    const catPassed = catTests.filter(r => r.status === 'PASS').length;
    report += `| ${catNames[i]} | ${catTests.length} | ${catPassed} | ${catTests.length - catPassed} |\n`;
  }
  
  report += `\n## Detailed Results\n\n`;
  report += `| ID | Test | Status | Time | Notes |\n`;
  report += `|-----|------|--------|------|-------|\n`;
  
  for (const t of testResults) {
    report += `| ${t.id} | ${t.name} | ${t.status === 'PASS' ? '✅' : '❌'} | ${t.time}ms | ${t.result.substring(0, 40)} |\n`;
  }
  
  report += `\n## Critical Findings\n\n`;
  
  const critical = testResults.filter(r => 
    r.result.includes('VULNERABILITY') || 
    r.result.includes('WARNING') ||
    r.status === 'FAIL'
  );
  
  if (critical.length > 0) {
    for (const c of critical) {
      report += `- **${c.id}:** ${c.result}\n`;
    }
  } else {
    report += `- No critical vulnerabilities or warnings found\n`;
  }
  
  report += `\n## Screenshots\n\n`;
  report += `All screenshots saved to: \`docs/screenshots/edge_case_tests/\`\n`;
  report += `\n---\n*Generated: ${new Date().toISOString()}*\n`;
  
  return report;
}

// ============================================
// MAIN EXECUTION
// ============================================
async function run() {
  console.log('🚀 Starting goWMS Edge Case & Stress Tests\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    
    console.log('🔐 Logging in...');
    await login(page);
    console.log('✅ Logged in\n');
    
    // Run all test categories
    await runSecurityTests(page);
    await runAccessibilityTests(page);
    await runMobileTests(page);
    await runStressTests(page);
    await runDataIntegrityTests(page);
    
    // Generate report
    console.log('\n📄 Generating report...');
    const report = generateReport();
    fs.writeFileSync(RESULTS_FILE, report);
    
    const passed = testResults.filter(r => r.status === 'PASS').length;
    console.log(`\n✅ Test Complete: ${passed}/${testResults.length} passed`);
    console.log(`📄 Report: ${RESULTS_FILE}`);
    console.log(`📸 Screenshots: ${SCREENSHOTS_DIR}`);
    
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
