const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    
    console.log('Going to login...');
    await page.goto('http://127.0.0.1:8080/login', { timeout: 10000 });
    await page.waitForTimeout(1500);
    
    // Fill username
    const usernameInput = page.locator('input[autoComplete="username"]');
    await usernameInput.fill('admin');
    
    // Fill password
    const passwordInput = page.locator('input[autoComplete="current-password"]');
    await passwordInput.fill('admin123');
    
    // Click Login button (the one inside the form that is NOT the Password/PIN toggle)
    console.log('Clicking login...');
    await page.locator('button.btn:has-text("Login")').click();
    await page.waitForTimeout(3000);
    
    console.log('Navigating to putaway...');
    await page.goto('http://127.0.0.1:8080/putaway', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'screenshots/putaway-check.png', fullPage: true });
    console.log('Done!');
    
    await browser.close();
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
