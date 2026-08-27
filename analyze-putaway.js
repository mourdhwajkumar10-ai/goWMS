const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    
    await page.goto('http://127.0.0.1:8080/login', { timeout: 10000 });
    await page.waitForTimeout(1500);
    
    const usernameInput = page.locator('input[autoComplete="username"]');
    await usernameInput.fill('admin');
    const passwordInput = page.locator('input[autoComplete="current-password"]');
    await passwordInput.fill('admin123');
    await page.locator('button.btn:has-text("Login")').click();
    await page.waitForTimeout(3000);
    
    await page.goto('http://127.0.0.1:8080/putaway', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Get the page structure and styles
    const analysis = await page.evaluate(() => {
      const result = {};
      
      // Check for desk-page
      const deskPage = document.querySelector('.desk-page');
      if (!deskPage) return { error: 'No .desk-page found', bodyHTML: document.body.innerHTML.substring(0, 2000) };
      
      result.pageTitle = deskPage.querySelector('h1')?.textContent || 'no h1';
      
      // Mode cards
      const modeCards = document.querySelectorAll('.pw-mode-card');
      result.modeCards = Array.from(modeCards).map(card => {
        const rect = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        return {
          text: card.textContent?.trim().substring(0, 100),
          width: rect.width,
          height: rect.height,
          display: style.display,
          flexDirection: style.flexDirection,
          border: style.border,
          bg: style.backgroundColor,
          padding: style.padding,
          fontSize: style.fontSize
        };
      });
      
      // Mode icons
      const modeIcons = document.querySelectorAll('.pw-mode-icon');
      result.modeIcons = Array.from(modeIcons).map(icon => {
        const style = getComputedStyle(icon);
        return {
          text: icon.textContent,
          fontSize: style.fontSize,
          color: style.color
        };
      });
      
      // Queue banner
      const queueBanner = document.querySelector('.pw-queue-banner');
      if (queueBanner) {
        const rect = queueBanner.getBoundingClientRect();
        const style = getComputedStyle(queueBanner);
        result.queueBanner = {
          width: rect.width,
          height: rect.height,
          bg: style.backgroundColor,
          border: style.border,
          display: style.display,
          padding: style.padding,
          text: queueBanner.textContent?.trim().substring(0, 100)
        };
      }
      
      // Queue items
      const queueItems = document.querySelectorAll('.pw-queue-item');
      result.queueItemCount = queueItems.length;
      if (queueItems.length > 0) {
        const firstItem = queueItems[0];
        const rect = firstItem.getBoundingClientRect();
        const style = getComputedStyle(firstItem);
        result.queueItemStyle = {
          width: rect.width,
          height: rect.height,
          display: style.display,
          border: style.border,
          padding: style.padding,
          gap: style.gap,
          bg: style.backgroundColor
        };
      }
      
      // Nav sidebar
      const nav = document.querySelector('.nav');
      if (nav) {
        const navRect = nav.getBoundingClientRect();
        result.navSidebar = {
          width: navRect.width,
          left: navRect.left,
          top: navRect.top
        };
      }
      
      // Overall page layout
      const mainContent = document.querySelector('.main');
      if (mainContent) {
        const style = getComputedStyle(mainContent);
        result.mainLayout = {
          marginLeft: style.marginLeft,
          paddingLeft: style.paddingLeft,
          width: mainContent.getBoundingClientRect().width
        };
      }
      
      // Check for overlapping elements
      const allRects = [];
      document.querySelectorAll('.pw-mode-card, .pw-queue-banner, .pw-queue-item, .desk-head').forEach(el => {
        const rect = el.getBoundingClientRect();
        allRects.push({
          class: el.className,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height
        });
      });
      result.elementPositions = allRects;
      
      // Check CSS variables
      const root = getComputedStyle(document.documentElement);
      result.cssVars = {
        panel: root.getPropertyValue('--panel'),
        border: root.getPropertyValue('--border'),
        accent: root.getPropertyValue('--accent'),
        text: root.getPropertyValue('--text'),
        textDim: root.getPropertyValue('--text-dim'),
        bg: root.getPropertyValue('--bg')
      };
      
      return result;
    });
    
    console.log(JSON.stringify(analysis, null, 2));
    await browser.close();
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
