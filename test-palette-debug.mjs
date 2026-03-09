import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('=== PAGE CONTENT DEBUG ===\n');
  
  const html = await page.content();
  console.log('Page length:', html.length, 'characters');
  
  if (html.includes('<button')) {
    console.log('✓ Page has <button> elements in HTML');
  } else {
    console.log('✗ NO BUTTONS in initial HTML');
  }

  if (html.includes('theme')) {
    console.log('✓ Page has "theme" text');
  }

  // Try locating nav
  const nav = await page.locator('nav').count();
  console.log('Nav elements found:', nav);

  // Check if page loaded
  const title = await page.title();
  console.log('Page title:', title);

  // Wait longer for hydration
  console.log('\nWaiting for content to render...');
  await page.waitForSelector('button', { timeout: 10000 }).catch(() => console.log('  Timeout waiting for button'));

  const buttons = await page.locator('button').count();
  console.log('Buttons now:', buttons);

  if (buttons > 0) {
    const btnTexts = await page.locator('button').allTextContents();
    console.log('Button texts:', btnTexts.slice(0, 5));
  }

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await browser.close();
}
