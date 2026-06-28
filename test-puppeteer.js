const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  
  // Tab 1: Host
  const page1 = await browser.newPage();
  page1.on('console', msg => console.log('HOST CONSOLE:', msg.text()));
  await page1.goto('http://localhost:3000');
  
  // Click Join (assuming there is a form, or we can just navigate to the lobby)
  // Let's just wait for a bit to see if we can trigger the UI
  // Wait, I need to know the UI flow.
  // We can just look at the code or write a script that connects directly using socket.io.
  
  await browser.close();
})();
