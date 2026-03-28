const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
    });
    page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.message));
    page.on('requestfailed', request => {
      console.log(`REQUEST FAILED: ${request.url()} - ${request.failure().errorText}`);
    });

    await page.goto('http://127.0.0.1:8080/index.html', { waitUntil: 'networkidle0' });
    
    // Test search
    await page.click('[data-tab="search"]'); // Go to search tab if needed, or just type
    // If there is an input #q
    const input = await page.$('#q');
    if (input) {
      await input.type('avatar');
      console.log('Typed avatar...');
      await new Promise(r => setTimeout(r, 2000)); // wait for debounce and fetch
    } else {
      console.log('Search input #q not found!');
    }

    await browser.close();
  } catch (err) {
    console.error('Puppeteer Script Error:', err);
  }
})();
