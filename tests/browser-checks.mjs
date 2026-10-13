import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseURL = process.env.TEST_URL || "http://localhost:4173/";
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
const variants = [
  { weight: "100", sku: "01306", price: "326,40 ₽", oldPrice: "349,20 ₽" },
  { weight: "500", sku: "01307", price: "1 432 ₽", oldPrice: "1 646 ₽" },
  { weight: "1000", sku: "01308", price: "2 064 ₽", oldPrice: "2 592 ₽" },
  { weight: "5000", sku: "01309", price: "6 320 ₽", oldPrice: "8 710 ₽" },
];
const sizes = [
  { width: 1440, height: 1000, name: "desktop-1440" },
  { width: 768, height: 1024, name: "tablet-768" },
  { width: 375, height: 812, name: "mobile-375" },
];

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function expectVariant(page, variant) {
  assert.equal(await page.locator("#product-sku").textContent(), variant.sku);
  assert.equal(normalize(await page.locator("#current-price").textContent()), variant.price);
  assert.equal(normalize(await page.locator("#old-price").textContent()), variant.oldPrice);
  assert.equal(await page.locator('input[name="package"]:checked').inputValue(), variant.weight);
  assert.equal(await page.locator("#price-unit").textContent(), `за ${variant.weight} г`);
  assert.equal(await page.locator('input[name="package"]:checked').count(), 1);
  assert.ok(await page.locator("#old-price").isVisible());
  assert.ok(await page.locator("#old-price").evaluate((element) => getComputedStyle(element).textDecorationLine.includes("line-through")));
}

async function expectLayout(page, width) {
  const measurements = await page.evaluate(() => {
    const photo = document.querySelector(".product__visual").getBoundingClientRect();
    const details = document.querySelector(".product__details").getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      imagesLoaded: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      photo: { x: photo.x, bottom: photo.bottom, right: photo.right },
      details: { x: details.x, y: details.y },
      targets: [...document.querySelectorAll(".package span, .cart-button")].map((element) => {
        const rectangle = element.getBoundingClientRect();
        return { width: rectangle.width, height: rectangle.height };
      }),
    };
  });
  assert.equal(measurements.overflow, false, `Horizontal overflow at ${width}px`);
  assert.equal(measurements.imagesLoaded, true, "Product image and logo must load");
  assert.ok(measurements.targets.every((target) => target.width >= 44 && target.height >= 44));
  if (width >= 640) {
    assert.ok(measurements.details.x > measurements.photo.right, "Tablet/desktop use two columns");
  } else {
    assert.ok(measurements.details.y > measurements.photo.bottom, "Mobile uses one column");
  }
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
const requests = [];
const results = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("request", (request) => requests.push(request.url()));
page.on("response", (response) => {
  if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
});
page.on("requestfailed", (request) => errors.push(`${request.failure()?.errorText}: ${request.url()}`));

try {
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(baseURL);
    await page.evaluate(() => document.fonts.ready);
    await expectVariant(page, variants[0]);

    for (const variant of variants) {
      await page.locator(`.package:has(input[value="${variant.weight}"])`).click();
      await expectVariant(page, variant);
      await expectLayout(page, size.width);
      // Wait for CSS transitions before comparing the selected and unselected styles.
      await page.locator(".package span").evaluateAll((elements) =>
        Promise.all(elements.flatMap((element) => element.getAnimations().map((animation) => animation.finished))),
      );
      const selectedStyle = await page.locator('input:checked + span').evaluate((element) => getComputedStyle(element).backgroundColor);
      const unselectedStyle = await page.locator('input:not(:checked) + span').first().evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.notEqual(selectedStyle, unselectedStyle, "Selected package must be visually distinct");
      results.push(`${size.width}px: ${variant.weight} g / ${variant.sku} / prices / selection / layout`);
    }

    await page.screenshot({ path: `${output}${size.name}-5000.png`, fullPage: true });
    await page.locator('.package:has(input[value="100"])').click();
    await page.locator('input[value="100"]').focus();
    await page.keyboard.press("ArrowRight");
    await expectVariant(page, variants[1]);
    assert.equal(await page.locator('input:checked + span').evaluate((element) => getComputedStyle(element).outlineStyle), "solid");
    await page.keyboard.press("ArrowLeft");
    await expectVariant(page, variants[0]);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(".cart-button").evaluate((element) => element === document.activeElement), true);
    const requestCount = requests.length;
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#cart-feedback").textContent(), /100 г \(демо\)/);
    assert.equal(requests.length, requestCount, "Demo cart must not call a backend or navigate");
    await page.locator('.package:has(input[value="500"])').click();
    assert.equal(await page.locator("#cart-feedback").textContent(), "");
    assert.match(await page.locator("#selection-announcement").textContent(), /500 г.*01307/);
    await page.locator('.package:has(input[value="100"])').click();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${output}${size.name}.png`, fullPage: true });
    results.push(`${size.width}px: keyboard / focus / demo cart / live announcement`);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  const normalColor = await page.locator(".cart-button").evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.locator(".cart-button").hover();
  await page.waitForFunction((color) => getComputedStyle(document.querySelector(".cart-button")).backgroundColor !== color, normalColor);
  results.push("Button hover changes background color");

  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".cart-button").evaluate((element) => getComputedStyle(element).transitionDuration), "0s");
  results.push("Reduced motion respected");

  await page.reload();
  await expectVariant(page, variants.find((variant) => variant.weight === "100"));
  await expectLayout(page, 1440);
  results.push("Reload keeps radio, SKU and prices in sync");

  const touchContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(baseURL);
  for (const variant of variants) {
    await touchPage.locator(`.package:has(input[value="${variant.weight}"])`).tap();
    await expectVariant(touchPage, variant);
  }
  await touchPage.locator(".cart-button").tap();
  assert.match(await touchPage.locator("#cart-feedback").textContent(), /5000 г \(демо\)/);
  await expectLayout(touchPage, 375);
  await touchContext.close();
  results.push("375px: touch selection and demo cart");

  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(baseURL);
  assert.equal(normalize(await staticPage.locator("#current-price").textContent()), "326,40 ₽");
  assert.ok(await staticPage.locator(".no-script").isVisible());
  await staticContext.close();
  results.push("Without JavaScript: initial card and explanatory fallback visible");

  assert.deepEqual(errors, [], "Page must have no console errors or failed resources");
  assert.ok(requests.every((url) => new URL(url).origin === new URL(baseURL).origin), "Page assets must be self-contained");
  results.push("No console/network errors; all page resources are local");
  await writeFile(`${output}report.json`, JSON.stringify({ url: baseURL, passed: results.length, results }, null, 2));
  console.log(`PASS: ${results.length} checks at ${baseURL}\n${results.join("\n")}`);
} finally {
  await browser.close();
}
