import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Check the live deployed site — no manipulation, just observe
await page.goto('https://cwcorella-git.github.io');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/live-neutral.png' });
console.log('neutral (default) → /tmp/live-neutral.png');

// Check sky
await page.evaluate(() => localStorage.setItem('cwc-theme','sky'));
await page.reload();
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/live-sky.png' });
console.log('sky → /tmp/live-sky.png');

// Check amber
await page.evaluate(() => localStorage.setItem('cwc-theme','amber'));
await page.reload();
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/live-amber.png' });
console.log('amber → /tmp/live-amber.png');

// Dump the actual CSS vars currently set on :root
const vars = await page.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  return {
    'glass-bg':     s.getPropertyValue('--glass-bg').trim(),
    'glass-nav-bg': s.getPropertyValue('--glass-nav-bg').trim(),
    'glass-bg-heavy': s.getPropertyValue('--glass-bg-heavy').trim(),
    'clr-text':     s.getPropertyValue('--clr-text').trim(),
    'body-bg':      s.getPropertyValue('--body-bg').trim(),
  };
});
console.log('CSS vars (amber):', vars);

await browser.close();
