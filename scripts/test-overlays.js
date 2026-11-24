/* End-to-end overlay regression test for ChadTube (Next app).
 * Runs the real app on :3000 with the YT API replaced by scripts/mock-yt.js.
 * Asserts: NO overlay element ever appears on open / pause / resume / nav;
 * the player is recreated (not reused) per video; the end card still works. */
const { chromium } = require("playwright");
const fs = require("fs");

const MOCK = fs.readFileSync("/home/z/my-project/scripts/mock-yt.js", "utf8");
const SHOT = "/tmp/render";
fs.mkdirSync(SHOT, { recursive: true });

let failures = 0;
function ok(cond, label) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

async function audit(page, rootSel) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { found: false };
    const q = (s) => root.querySelectorAll(s).length;
    return {
      found: true,
      maxres: q('img[src*="maxresdefault"]'), // removed paused-poster cover
      spin: q(".animate-spin"), // removed buffering spinner
      loadingTxt: root.innerText.includes("Loading…"), // removed swap cover
      endcard: /up next/i.test(root.innerText),
      mockState: window.__ctMock ? window.__ctMock.state : null,
      mockId: window.__ctMock ? window.__ctMock.id : null,
      hostText: window.__ctMock ? window.__ctMock.mount.textContent : null,
    };
  }, rootSel);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/resource|ERR_FAILED|Failed to load/i.test(m.text()))
      errors.push("console: " + m.text());
  });
  await page.route("**/www.youtube.com/iframe_api*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: MOCK })
  );
  await page.route("**/i.ytimg.com/**", (route) => route.abort());

  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main .grid > button", { timeout: 30000 });

  // ---- 1. open a video from the grid ----
  await page.locator("main .grid > button").first().click();
  await page.waitForTimeout(1500);
  let a = await audit(page, ".relative.overflow-hidden.bg-black");
  ok(a.found && a.mockState === 1, "open: video is playing (state 1, id " + a.mockId + ")");
  ok(a.maxres === 0 && a.spin === 0 && !a.loadingTxt && !a.endcard,
     "open: NO poster / spinner / glyph / swap cover / end card on top");
  await page.screenshot({ path: SHOT + "/01-playing.png" });

  // ---- 2. pause ----
  const shell = page.locator(".relative.overflow-hidden.bg-black");
  const box = await shell.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  a = await audit(page, ".relative.overflow-hidden.bg-black");
  ok(a.mockState === 2, "pause: state is 2");
  ok(a.maxres === 0 && a.spin === 0 && !a.loadingTxt && !a.endcard,
     "pause: NO poster / spinner / glyph on top of the paused frame");
  await page.screenshot({ path: SHOT + "/02-paused.png" });

  // ---- 3. resume ----
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  a = await audit(page, ".relative.overflow-hidden.bg-black");
  ok(a.mockState === 1, "resume: playing again");
  ok(a.maxres === 0 && a.spin === 0 && !a.loadingTxt && !a.endcard,
     "resume: NO spinner / cover on top");
  await page.screenshot({ path: SHOT + "/03-resumed.png" });

  // ---- 4. navigate with Next: player must be RECREATED, nothing overlaid ----
  const oldId = a.mockId;
  await page.locator("button", { hasText: /^Next/ }).first().click();
  await page.waitForTimeout(80); // instant, mid-swap
  a = await audit(page, ".relative.overflow-hidden.bg-black");
  ok(!a.endcard && !a.loadingTxt && a.spin === 0 && a.maxres === 0,
     "nav (instant): no end card flash, no swap cover, no spinner");
  await page.screenshot({ path: SHOT + "/04-nav-instant.png" });
  await page.waitForTimeout(1200);
  a = await audit(page, ".relative.overflow-hidden.bg-black");
  ok(a.mockState === 1 && a.mockId !== oldId,
     "nav: fresh player playing a DIFFERENT video (old end screen destroyed, not covered)");
  ok(a.maxres === 0 && a.spin === 0 && !a.loadingTxt && !a.endcard,
     "nav: NO overlays while/after the new video loads");
  await page.screenshot({ path: SHOT + "/05-next-playing.png" });

  // ---- 5. end card (only after the video actually ends) ----
  await page.evaluate(() => window.__ctMock.seekTo(3599.5));
  await page.waitForTimeout(900);
  a = await audit(page, ".relative.overflow-hidden.bg-black");
  ok(a.mockState === 0 && a.endcard, "end: our end card replaces YT's end screen");
  await page.screenshot({ path: SHOT + "/06-endcard.png" });
  await page.locator("button", { hasText: "Play now" }).first().click();
  await page.waitForTimeout(1300);
  a = await audit(page, ".relative.overflow-hidden.bg-black");
  ok(a.mockState === 1 && !a.endcard, "end card 'Play now': next video plays, card gone");
  await page.screenshot({ path: SHOT + "/07-playnow.png" });

  // ---- 6. TV mode ----
  await page.locator("button", { hasText: "TV mode" }).first().click();
  await page.waitForTimeout(1600);
  a = await audit(page, '[role="dialog"][aria-label="TV mode"]');
  ok(a.found && a.mockState === 1, "tv: playing");
  ok(a.maxres === 0 && a.spin === 0 && !a.loadingTxt && !a.endcard, "tv: NO overlays");
  await page.screenshot({ path: SHOT + "/08-tv-playing.png" });

  const dlg = page.locator('[role="dialog"][aria-label="TV mode"]');
  const dbox = await dlg.boundingBox();
  await page.mouse.click(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
  await page.waitForTimeout(400);
  a = await audit(page, '[role="dialog"][aria-label="TV mode"]');
  ok(a.mockState === 2, "tv pause: state 2");
  ok(a.maxres === 0 && a.spin === 0 && !a.loadingTxt, "tv pause: NO poster cover / spinner");
  await page.screenshot({ path: SHOT + "/09-tv-paused.png" });
  await page.mouse.click(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
  await page.waitForTimeout(400);

  const tvOldId = a.mockId;
  await page.keyboard.press("n");
  await page.waitForTimeout(1400);
  a = await audit(page, '[role="dialog"][aria-label="TV mode"]');
  ok(a.mockState === 1 && a.mockId !== tvOldId, "tv next: fresh player, new video");
  ok(a.maxres === 0 && a.spin === 0 && !a.loadingTxt && !a.endcard, "tv next: NO overlays");
  await page.screenshot({ path: SHOT + "/10-tv-next.png" });
  await page.keyboard.press("Escape");

  ok(errors.length === 0, "no page errors " + (errors.length ? JSON.stringify(errors) : ""));
  await browser.close();
  console.log(failures === 0 ? "\nALL GREEN" : "\n" + failures + " FAILURES");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("SCRIPT ERROR", e);
  process.exit(2);
});
