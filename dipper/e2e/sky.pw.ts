import { test, expect, type Page } from "@playwright/test";
const ready = async (p: Page) =>
  expect(p.locator("canvas")).toHaveAttribute(
    "data-rendered-star-count",
    /^[1-9]\d*$/,
  );
const find = async (p: Page, name: string) => {
  const s = p.getByRole("textbox", { name: "Search sky objects" });
  await s.fill(name);
  await s.press("Enter");
  await expect(p.locator(".detail h2")).toHaveText(name);
};
test("real rendered observation, location, time, camera, and deep field", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/Shader Error|VALIDATE_STATUS|shader failed/i.test(m.text()))
      errors.push(m.text());
  });
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  const start = Date.now();
  await page.goto("/");
  await ready(page);
  const canvas = page.locator("canvas");
  console.log(
    "Initial scene (ms)",
    Date.now() - start,
    await canvas.evaluate((c) => ({ ...c.dataset })),
  );
  await expect(canvas).toBeVisible();
  expect(Number(await canvas.getAttribute("data-draw-calls"))).toBeGreaterThan(
    1,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: process.env.DIPPER_SCREENSHOT || "test-results/desktop.png",
  });
  await find(page, "Sirius");
  const before = await page.locator(".object-data").innerText();
  const utc = await page.locator("time").getAttribute("datetime");
  await page.getByRole("button", { name: "Open world map" }).click();
  await page.getByLabel("Observer preset").selectOption("Cape Town");
  await page.getByRole("button", { name: "Apply location" }).click();
  await expect(page.locator(".city")).toHaveText("Cape Town");
  await expect(page.locator("time")).toHaveAttribute("datetime", utc!);
  await expect(page.locator(".object-data")).not.toHaveText(before, {
    useInnerText: true,
  });
  await page.locator(".field").filter({ hasText: "2026" }).click();
  await page.getByLabel("Local date and time").fill("2026-06-21T14:00");
  await page.getByRole("button", { name: "Apply time" }).click();
  await expect(page.locator("time")).toHaveAttribute(
    "datetime",
    "2026-06-21T12:00:00.000Z",
  );
  await find(page, "Moon");
  await expect(page.locator(".detail")).toContainText("diameter");
  await page.getByRole("button", { name: "Face north" }).click();
  await expect(page.locator(".view-hud")).toContainText("0.0° N");
  const coords = await page.locator(".object-data").innerText();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".view-hud")).toContainText("70°");
  await expect(page.locator(".object-data")).toHaveText(coords, {
    useInnerText: true,
  });
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".view-hud")).toContainText("5.0°");
  await page.getByLabel("Time rate").selectOption("-3600");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Pause time" }).click();
  expect(
    Date.parse((await page.locator("time").getAttribute("datetime"))!),
  ).toBeLessThan(Date.parse("2026-06-21T12:00Z"));
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.getByRole("button", { name: "Reset to now" }).click();
  expect(
    Math.abs(
      Date.parse((await page.locator("time").getAttribute("datetime"))!) -
        Date.now(),
    ),
  ).toBeLessThan(10000);
  expect(errors).toEqual([]);
});
test("catalogue corruption can be retried", async ({ page }) => {
  await page.route("**/bright-stars.bin", (r) =>
    r.fulfill({ body: "corrupt" }),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("checksum mismatch");
  await page.unroute("**/bright-stars.bin");
  await page.getByRole("button", { name: "Retry catalogue" }).click();
  await ready(page);
});
test("mobile observation and controls fit the viewport", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(test.info().project.use.baseURL!);
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: process.env.DIPPER_MOBILE_SCREENSHOT || "test-results/mobile.png",
  });
  await page.getByRole("button", { name: "Controls", exact: true }).tap();
  await page.getByRole("button", { name: "Layers", exact: true }).tap();
  await expect(
    page.getByRole("switch", { name: "Milky Way density" }),
  ).toBeVisible();
  await context.close();
});
test("Gaia streams local tiles on zoom and releases the deep view on zoom out", async ({
  page,
}) => {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/catalog/gaia/")) urls.push(r.url());
  });
  await page.goto("/?utc=2026-01-15T22:00:00Z&fov=20");
  await ready(page);
  await find(page, "Alnilam");
  expect(urls).toHaveLength(0);
  await page.getByRole("button", { name: "All layer settings" }).click();
  await page.getByRole("switch", { name: "Gaia deep fields" }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-gaia-sources",
    /^[1-9]\d*$/,
  );
  expect(urls.some((u) => u.includes("dr3-"))).toBe(true);
  await page
    .getByRole("button", { name: "Zoom out", exact: true })
    .click({ clickCount: 2 });
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-gaia-sources",
    "0",
  );
});
test("click a rendered object, deselect, and share its exact observation", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await find(page, "Sirius");
  await page.getByRole("button", { name: "Clear selection" }).click();
  const canvas = page.locator("canvas"),
    r = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: r.width / 2, y: r.height / 2 } });
  await expect(page.locator(".detail h2")).toHaveText("Sirius");
  await page.getByRole("button", { name: "Share view" }).click();
  await expect(page).toHaveURL(/utc=/);
  const utc = await page.locator("time").getAttribute("datetime");
  await page.reload();
  await ready(page);
  await expect(page.locator("time")).toHaveAttribute("datetime", utc!);
});
test("the rendered lunar crescent faces the projected Sun", async ({
  page,
}) => {
  const { bodyDirection, horizontal, rad } = await import("../src/astro/sky");
  const site = { latitudeDeg: 39.4699, longitudeDeg: -0.3763, elevationM: 0 };
  const utc = "2026-01-23T18:00:00Z",
    moon = bodyDirection("Moon", site, Date.parse(utc)),
    sun = bodyDirection("Sun", site, Date.parse(utc));
  await page.goto(
    "/?" +
      new URLSearchParams({
        utc,
        az: String(moon.azimuthDeg),
        alt: String(moon.apparentAltitudeDeg),
        fov: "10",
      }),
  );
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-draw-calls", /^[1-9]/);
  const png = (await canvas.screenshot()).toString("base64");
  const right = horizontal(moon.azimuthDeg + 90, 0),
    up = horizontal(moon.azimuthDeg, moon.apparentAltitudeDeg + 90),
    toSun = horizontal(sun.azimuthDeg, sun.apparentAltitudeDeg);
  const dot = (a: number[], b: number[]) =>
    a.reduce((n, v, i) => n + v * b[i], 0);
  const result = await page.evaluate(
    async ({ png, x, y, diam }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + png;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const radius =
        (c.height * 0.5 * Math.tan((diam * Math.PI) / 360)) /
        Math.tan((5 * Math.PI) / 180);
      const ux = x / Math.hypot(x, y),
        uy = y / Math.hypot(x, y);
      const sample = (sign: number) => {
        const xx = Math.round(c.width / 2 + sign * ux * radius * 0.8),
          yy = Math.round(c.height / 2 + sign * uy * radius * 0.8);
        return ctx.getImageData(xx, yy, 1, 1).data[0];
      };
      return [sample(1), sample(-1)];
    },
    {
      png,
      x: dot(right, toSun),
      y: -dot(up, toSun),
      diam: moon.angularDiameterDeg,
    },
  );
  expect(result[0] - result[1]).toBeGreaterThan(100);
});
test("sample interactive frame intervals at 1920 × 1080", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await ready(page);
  const stats = await page.locator("canvas").evaluate(async (c) => {
    const samples: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 65; i++) {
      const now = await new Promise<number>((r) => requestAnimationFrame(r));
      if (i >= 5) samples.push(now - last);
      last = now;
      c.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: i % 2 ? "ArrowRight" : "ArrowLeft",
          bubbles: true,
        }),
      );
    }
    samples.sort((a, b) => a - b);
    return { medianMs: samples[30], p95Ms: samples[57], ...c.dataset };
  });
  console.log("Panning sample", browser.version(), stats);
  expect(stats.medianMs).toBeGreaterThan(0);
});
test("local DST errors preserve UTC and both autumn occurrences are selectable", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const time = page.locator("time"),
    before = await time.getAttribute("datetime");
  await page.locator(".field").filter({ hasText: "2026" }).click();
  const input = page.getByLabel("Local date and time");
  await input.fill("2026-03-29T02:30");
  await page.getByRole("button", { name: "Apply time" }).click();
  await expect(page.getByRole("alert")).toContainText("does not exist");
  await expect(time).toHaveAttribute("datetime", before!);
  await input.fill("2026-10-25T02:30");
  await page.getByRole("button", { name: "Apply time" }).click();
  await page.getByRole("button", { name: /Second occurrence/ }).click();
  await expect(time).toHaveAttribute("datetime", "2026-10-25T01:30:00.000Z");
});
test("optional density failure leaves the sky usable", async ({ page }) => {
  await page.route("**/hyg-density.bin", (r) => r.fulfill({ status: 404 }));
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("status")).toContainText(
    "Milky Way density unavailable",
  );
  await find(page, "Polaris");
});
