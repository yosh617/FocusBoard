import { expect, test } from "@playwright/test";
import { defaultSettings } from "../src/types/settings";

test("keeps the task display card draggable and the task button fixed across viewport sizes", async ({ page }) => {
  await page.addInitScript((settings) => {
    localStorage.setItem("focusboard:settings", JSON.stringify(settings));
  }, { ...defaultSettings, taskLauncherVisibility: "always" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "タイマー設定をしまう" }).click();

  const card = page.getByRole("group", { name: "タスク表示カード" });
  const openButton = page.getByRole("button", { name: /タスクを開く/ });
  await expect(card).toBeVisible();
  await expect(openButton).toBeVisible();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    const cardBox = await card.boundingBox();
    const buttonBox = await openButton.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(Math.abs(cardBox!.x - buttonBox!.x) + Math.abs(cardBox!.y - buttonBox!.y)).toBeGreaterThan(10);

    await page.mouse.move(cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height / 2 - 90, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await card.boundingBox())?.y).toBeLessThan(cardBox!.y - 30);
    await expect(openButton).toBeVisible();
    await expect(page.getByRole("dialog", { name: "タスク" })).not.toBeVisible();
    await page.screenshot({ path: `test-results/task-card-${viewport.width}.png` });
  }

  await openButton.click();
  await expect(page.getByRole("dialog", { name: "タスク" })).toBeVisible();
});
