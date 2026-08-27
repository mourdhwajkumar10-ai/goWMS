/**
 * goWMS Visible Browser Test Script
 * Launches a visible browser window with slow motion for demonstration
 */

const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'http://34.93.122.213:8080';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'screenshots');

async function runVisibleTest() {
  console.log('🚀 Launching visible browser...\n');
  console.log('⚠️  Note: Browser window will appear on the server machine.');
  console.log('   If you cannot see it, the screenshots will capture each step.\n');
  
  const browser = await puppeteer.launch({
    headless: false,  // VISIBLE browser window
    slowMo: 100,      // Slow down by 100ms for visibility
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized'
    ],
    defaultViewport: null  // Use full window size
  });
  
  try {
    const page = await browser.newPage();
    
    // Step 1: Navigate to login
    console.log('1️⃣  Navigating to login page...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'visible_01_login.png') });
    console.log('   ✅ Login page loaded\n');
    
    // Step 2: Wait and show the page
    console.log('2️⃣  Waiting 3 seconds to view login page...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 3: Fill username
    console.log('3️⃣  Filling username...');
    const inputs = await page.$$('form.login-card input');
    if (inputs.length >= 2) {
      await inputs[0].click();
      await inputs[0].type('admin', { delay: 100 });
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'visible_02_username.png') });
      console.log('   ✅ Username entered\n');
    }
    
    // Step 4: Fill password
    console.log('4️⃣  Filling password...');
    if (inputs.length >= 2) {
      await inputs[1].click();
      await inputs[1].type('admin123', { delay: 100 });
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'visible_03_password.png') });
      console.log('   ✅ Password entered\n');
    }
    
    // Step 5: Click login
    console.log('5️⃣  Clicking login button...');
    const loginBtn = await page.$('form.login-card button');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'visible_04_dashboard.png') });
      console.log('   ✅ Logged in successfully!\n');
    }
    
    // Step 6: Wait on dashboard
    console.log('6️⃣  Viewing dashboard for 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 7: Navigate to GRN
    console.log('7️⃣  Navigating to GRN page...');
    await page.goto(`${BASE_URL}/grn`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'visible_05_grn.png') });
    console.log('   ✅ GRN page loaded\n');
    
    // Step 8: Wait and show GRN
    console.log('8️⃣  Viewing GRN page for 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 9: Navigate to Putaway
    console.log('9️⃣  Navigating to Putaway page...');
    await page.goto(`${BASE_URL}/putaway`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'visible_06_putaway.png') });
    console.log('   ✅ Putaway page loaded\n');
    
    // Step 10: Final wait
    console.log('🔟 Viewing Putaway page for 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('\n✅ Visible browser test complete!');
    console.log('📸 Screenshots saved to docs/screenshots/visible_*.png');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    console.log('\n🔒 Closing browser...');
    await browser.close();
  }
}

// Run the test
runVisibleTest().catch(console.error);
