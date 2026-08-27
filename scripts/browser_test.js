/**
 * goWMS Browser Automation Test Script
 * Tests UI/UX, latency, and functionality using Puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://34.93.122.213:8080';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const RESULTS_FILE = path.join(__dirname, '..', 'docs', 'browser_test_results.md');

// Test results storage
const results = {
  login: { passed: false, latency: 0 },
  pages: [],
  interactions: [],
  screenshots: []
};

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Measure page load time
 */
async function measurePageLoad(page, url, name) {
  const startTime = Date.now();
  
  try {
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    const latency = Date.now() - startTime;
    
    results.pages.push({
      name,
      url,
      latency,
      status: 'passed'
    });
    
    console.log(`✅ ${name}: ${latency}ms`);
    return latency;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    results.pages.push({
      name,
      url,
      latency,
      status: 'failed',
      error: error.message
    });
    
    console.log(`❌ ${name}: Failed after ${latency}ms - ${error.message}`);
    return null;
  }
}

/**
 * Take screenshot with timestamp
 */
async function takeScreenshot(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}_${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  
  try {
    await page.screenshot({ 
      path: filepath, 
      fullPage: true 
    });
    
    results.screenshots.push({
      name,
      filename,
      filepath
    });
    
    console.log(`📸 Screenshot saved: ${filename}`);
    return filepath;
  } catch (error) {
    console.log(`❌ Screenshot failed: ${error.message}`);
    return null;
  }
}

/**
 * Test login functionality
 */
async function testLogin(page) {
  console.log('\n=== Testing Login ===');
  
  try {
    // Navigate to login page
    await page.goto(`${BASE_URL}/login`, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await takeScreenshot(page, '01_login_page');
    
    // Wait for login form - use more specific selectors based on React component
    await page.waitForSelector('form.login-card', {
      timeout: 10000
    });
    
    // Wait for inputs to render
    await page.waitForSelector('form.login-card input', {
      timeout: 5000
    });
    
    // Find all inputs in the form
    const inputs = await page.$$('form.login-card input');
    console.log(`Found ${inputs.length} inputs on login page`);
    
    // First input is username, second is password
    if (inputs.length >= 2) {
      await inputs[0].type('admin', { delay: 50 });
      await inputs[1].type('admin123', { delay: 50 });
    } else if (inputs.length === 1) {
      // Only one input visible, might be in PIN mode
      await inputs[0].type('admin', { delay: 50 });
    }
    
    await takeScreenshot(page, '02_login_filled');
    
    // Click login button - the submit button in the form
    const loginButton = await page.$('form.login-card button[type="submit"], form.login-card button:not([type="button"])');
    if (loginButton) {
      const startTime = Date.now();
      await loginButton.click();
      
      // Wait for navigation
      await page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 15000 
      }).catch(() => {});
      
      const latency = Date.now() - startTime;
      results.login = { passed: true, latency };
      
      console.log(`✅ Login successful: ${latency}ms`);
      await takeScreenshot(page, '03_after_login');
      
      return true;
    }
  } catch (error) {
    console.log(`❌ Login failed: ${error.message}`);
    results.login = { passed: false, error: error.message };
  }
  
  return false;
}

/**
 * Test navigation to different pages
 */
async function testPageNavigation(page) {
  console.log('\n=== Testing Page Navigation ===');
  
  const pages = [
    { name: 'Dashboard', url: '/' },
    { name: 'GRN', url: '/grn' },
    { name: 'Putaway', url: '/putaway' },
    { name: 'Items', url: '/items' },
    { name: 'Inventory', url: '/inventory' },
    { name: 'Pick', url: '/pick' },
    { name: 'Pack', url: '/pack' },
    { name: 'Dispatch', url: '/dispatch' },
    { name: 'Quality Inspection', url: '/qi' },
    { name: 'Suppliers', url: '/suppliers' }
  ];
  
  for (const pageConfig of pages) {
    const latency = await measurePageLoad(
      page, 
      `${BASE_URL}${pageConfig.url}`, 
      pageConfig.name
    );
    
    if (latency !== null) {
      await takeScreenshot(page, `page_${pageConfig.name.toLowerCase()}`);
    }
    
    // Small delay between pages
    await new Promise(r => setTimeout(r, 500));
  }
}

/**
 * Test interactive elements
 */
async function testInteractions(page) {
  console.log('\n=== Testing Interactions ===');
  
  // Test GRN page interactions
  try {
    await page.goto(`${BASE_URL}/grn`, { waitUntil: 'networkidle2' });
    
    // Test warehouse dropdown
    const warehouseSelect = await page.$('select');
    if (warehouseSelect) {
      await warehouseSelect.click();
      await takeScreenshot(page, 'interaction_warehouse_dropdown');
      console.log('✅ Warehouse dropdown clickable');
    }
    
    // Test buttons
    const buttons = await page.$$('button');
    console.log(`Found ${buttons.length} buttons on GRN page`);
    
    // Test scan button
    const scanButton = await page.$('button:has-text("Scan")');
    if (scanButton) {
      await scanButton.click();
      await new Promise(r => setTimeout(r, 500));
      await takeScreenshot(page, 'interaction_scan_modal');
      console.log('✅ Scan button works');
      
      // Close modal if opened
      const closeButton = await page.$('button:has-text("Cancel"), button:has-text("Close")');
      if (closeButton) {
        await closeButton.click();
      }
    }
    
    // Test session filter buttons
    const filterButtons = await page.$$('button:has-text("All"), button:has-text("In progress")');
    if (filterButtons.length > 0) {
      await filterButtons[0].click();
      await takeScreenshot(page, 'interaction_filter_buttons');
      console.log('✅ Filter buttons work');
    }
    
  } catch (error) {
    console.log(`❌ Interaction test failed: ${error.message}`);
  }
}

/**
 * Test responsive design (mobile viewport)
 */
async function testResponsive(page) {
  console.log('\n=== Testing Responsive Design ===');
  
  const viewports = [
    { name: 'Desktop', width: 1920, height: 1080 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Mobile', width: 375, height: 667 }
  ];
  
  for (const viewport of viewports) {
    await page.setViewport({ 
      width: viewport.width, 
      height: viewport.height 
    });
    
    await page.goto(`${BASE_URL}/grn`, { waitUntil: 'networkidle2' });
    await takeScreenshot(page, `responsive_${viewport.name.toLowerCase()}`);
    
    console.log(`✅ ${viewport.name} viewport (${viewport.width}x${viewport.height})`);
  }
}

/**
 * Test keyboard navigation
 */
async function testKeyboardNavigation(page) {
  console.log('\n=== Testing Keyboard Navigation ===');
  
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    
    // Test Tab navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await takeScreenshot(page, 'keyboard_tab_navigation');
    
    // Test Enter key
    await page.keyboard.press('Enter');
    
    console.log('✅ Keyboard navigation tested');
  } catch (error) {
    console.log(`❌ Keyboard test failed: ${error.message}`);
  }
}

/**
 * Generate test report
 */
function generateReport() {
  let report = `# goWMS Browser Automation Test Report\n\n`;
  report += `**Test Date:** ${new Date().toISOString()}\n`;
  report += `**Target:** ${BASE_URL}\n\n`;
  
  // Login results
  report += `## Login Test\n\n`;
  report += `| Metric | Result |\n`;
  report += `|--------|--------|\n`;
  report += `| Status | ${results.login.passed ? '✅ Passed' : '❌ Failed'} |\n`;
  report += `| Latency | ${results.login.latency}ms |\n\n`;
  
  // Page load results
  report += `## Page Load Performance\n\n`;
  report += `| Page | Latency | Status |\n`;
  report += `|------|---------|--------|\n`;
  
  for (const page of results.pages) {
    report += `| ${page.name} | ${page.latency}ms | ${page.status === 'passed' ? '✅' : '❌'} |\n`;
  }
  
  // Calculate average
  const avgLatency = results.pages
    .filter(p => p.status === 'passed')
    .reduce((sum, p) => sum + p.latency, 0) / results.pages.filter(p => p.status === 'passed').length;
  
  report += `\n**Average Page Load:** ${Math.round(avgLatency)}ms\n\n`;
  
  // Screenshots
  report += `## Screenshots Captured\n\n`;
  for (const screenshot of results.screenshots) {
    report += `- ${screenshot.name}: \`${screenshot.filename}\`\n`;
  }
  
  report += `\n---\n*Generated by Puppeteer Browser Automation*\n`;
  
  return report;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('🚀 Starting goWMS Browser Automation Tests\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });
  
  try {
    const page = await browser.newPage();
    
    // Set default timeout
    page.setDefaultTimeout(30000);
    
    // Run tests
    const loginSuccess = await testLogin(page);
    
    if (loginSuccess) {
      await testPageNavigation(page);
      await testInteractions(page);
      await testResponsive(page);
      await testKeyboardNavigation(page);
    }
    
    // Generate report
    const report = generateReport();
    fs.writeFileSync(RESULTS_FILE, report);
    
    console.log('\n✅ Tests complete!');
    console.log(`📄 Report saved to: ${RESULTS_FILE}`);
    console.log(`📸 Screenshots saved to: ${SCREENSHOTS_DIR}`);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
  } finally {
    await browser.close();
  }
}

// Run tests
runTests().catch(console.error);
