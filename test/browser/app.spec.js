import { test, expect } from '@playwright/test';

test('Arena startet standardmäßig in der Begehung', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#project-title')).not.toBeEmpty();
  await expect(page.locator('#tab-game')).toHaveClass(/active/);
  await expect(page.locator('#ready-panel')).toBeVisible();
});

test('Generator übernimmt die eingestellten Spielparameter', async ({ page }) => {
  await page.goto('/');
  await page.locator('#map-size').selectOption('large');
  await page.locator('#enemy-count').selectOption('16');
  await page.locator('#arena-style').selectOption('warehouse');
  await page.locator('#random-map').click();
  await expect(page.locator('#project-title')).toContainText('Lagerhalle');
  await expect(page.locator('#arena-meta')).toContainText('Bereiche');
});

test('Inventar, Fernkampfmunition und Pause sind verfügbar', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('KeyI');
  await expect(page.locator('#inventory-panel')).toBeVisible();
  await page.locator('#creative-toggle').click();
  await page.locator('#creative-search').fill('Pistole');
  await page.getByRole('button', { name: 'Pistole · P12 zum Inventar hinzufügen' }).click();
  await page.locator('.inventory-slot').first().click();
  await page.locator('#inventory-close').click();
  await expect(page.locator('#ammo-status')).toBeVisible();
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause-panel')).toBeVisible();
});

test('Der Bogen lässt sich ausrüsten, ohne das Spiel zu unterbrechen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.keyboard.press('KeyI');
  await page.locator('#creative-toggle').click();
  await page.locator('#creative-search').fill('Bogen');
  await page.getByRole('button', { name: 'Jagdbogen zum Inventar hinzufügen' }).click();
  await page.locator('.inventory-slot:not(.empty)').first().click();
  await page.locator('#inventory-close').click();
  await page.locator('.hotbar-slot').nth(4).click();
  await page.waitForTimeout(150);
  expect(errors).toEqual([]);
  await expect(page.locator('#ammo-status')).toContainText('Pfeile');
});

test('Eine laufende Runde verarbeitet Bewegung und Gegner-KI ohne Laufzeitfehler', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#game-start').click();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(750);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  await expect(page.locator('#match-wave')).toContainText(/ARENA SICHERN|WELLE/);
});

test('Eine große schwere Arena bleibt mit 24 Gegnern reaktionsfähig', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#difficulty').selectOption('hard');
  await page.locator('#map-size').selectOption('large');
  await page.locator('#enemy-count').selectOption('24');
  await page.locator('#random-map').click();
  await page.locator('#game-start').click();
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  await page.keyboard.press('ControlLeft');
  await page.mouse.click(720, 450);
  const frames = await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const started = performance.now();
    const next = (time) => {
      count++;
      if (time - started > 1200) resolve(count);
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }));
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  expect(frames).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('Mobile Ansicht erzeugt keinen horizontalen Überlauf', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
