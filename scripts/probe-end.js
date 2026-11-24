const { chromium } = require("playwright");
const fs = require("fs");
const MOCK = fs.readFileSync("/home/z/my-project/scripts/mock-yt.js", "utf8");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/www.youtube.com/iframe_api*", (r) => r.fulfill({ contentType: "text/javascript", body: MOCK }));
  await page.route("**/i.ytimg.com/**", (r) => r.abort());
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main .grid > button", { timeout: 30000 });
  await page.locator("main .grid > button").first().click();
  await page.waitForTimeout(1500);
  for (const t of [200, 500, 900, 1400]) {
    await page.evaluate(() => { try { window.__ctMock.seekTo(3599.5); } catch (e) {} });
    await page.waitForTimeout(t);
    const r = await page.evaluate(() => {
      const root = document.querySelector(".relative.overflow-hidden.bg-black");
      return {
        state: window.__ctMock && window.__ctMock.state,
        time: window.__ctMock && window.__ctMock.time,
        endcard: root ? root.innerText.includes("Up next") : null,
        text: root ? root.innerText.slice(0, 120).replace(/\n/g, " | ") : null,
      };
    });
    console.log(t, JSON.stringify(r));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
