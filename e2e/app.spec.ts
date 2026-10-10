import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const openTasks = async (page: Page) => {
  const dockButton = page.getByRole("button", { name: "タスク", exact: true });
  if (!(await dockButton.isVisible())) {
    await page.locator(".app-shell").click({ position: { x: 12, y: 12 } });
  }
  await dockButton.click();
  return page.getByRole("dialog", { name: "タスク" });
};

const openSettings = async (page: Page) => {
  const tasks = await openTasks(page);
  await tasks.getByRole("button", { name: "設定を開く" }).click();
  return page.getByRole("dialog", { name: "設定" });
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("home, clock controls, and dashboard fit supported viewport sizes", async ({ page }) => {
  await page.getByRole("button", { name: "タイマー設定をしまう" }).click();
  const clockButton = page.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
  await clockButton.click();
  await expect(page.getByRole("dialog", { name: "時計とカレンダーの表示設定" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "時計とカレンダーの表示設定" })).toHaveCount(0);

  for (const viewport of [
    { width: 320, height: 780 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 }
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth
    }));
    expect(dimensions.pageWidth, `horizontal overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(dimensions.viewportWidth);
  }
});

test("timer controls remain clickable beside the task launcher on narrow screens", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 780 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 }
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "開始", exact: true }).click();
    const picker = page.getByRole("dialog", { name: /タスク/ });
    if (await picker.count()) await picker.getByRole("button", { name: "タスクなしで開始" }).click();
    await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
    await page.getByRole("button", { name: "一時停止" }).click();
    await page.getByRole("button", { name: "終了して記録" }).click();
  }
});

test("settings categories work and a setting survives a reload", async ({ page }) => {
  const settings = await openSettings(page);
  for (const category of ["背景", "表示", "タイマー", "データ"]) {
    const tab = settings.getByRole("tab", { name: category });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }

  await settings.getByRole("tab", { name: "表示" }).click();
  await settings.locator("summary").filter({ hasText: "時計・日付の見やすさ" }).click();
  await settings.locator("summary").filter({ hasText: "表示形式とサイズ" }).click();
  const secondsToggle = settings.getByRole("checkbox", { name: "秒を表示" });
  const wasChecked = await secondsToggle.isChecked();
  await secondsToggle.setChecked(!wasChecked);
  await expect(settings.getByRole("status").filter({ hasText: /保存済み|保存中/ })).toBeVisible();
  await page.reload();

  const reloadedSettings = await openSettings(page);
  await reloadedSettings.getByRole("tab", { name: "表示" }).click();
  await reloadedSettings.locator("summary").filter({ hasText: "時計・日付の見やすさ" }).click();
  await reloadedSettings.locator("summary").filter({ hasText: "表示形式とサイズ" }).click();
  await expect(reloadedSettings.getByRole("checkbox", { name: "秒を表示" })).toHaveJSProperty("checked", !wasChecked);
});

test("task creation, report navigation, and backup export/import stay local", async ({ page }) => {
  const tasks = await openTasks(page);
  const taskTitle = "E2E テスト用タスク";
  await tasks.getByRole("textbox", { name: "新しいタスク" }).fill(taskTitle);
  await tasks.getByRole("button", { name: "タスクを追加" }).click();
  await expect(tasks.getByText(taskTitle)).toBeVisible();

  await tasks.getByRole("button", { name: "レポート", exact: true }).click();
  await expect(page.getByRole("region", { name: "集中レポート" })).toBeVisible();

  await tasks.getByRole("navigation", { name: "作業ビュー" }).getByRole("button", { name: "タスク", exact: true }).click();
  await page.getByRole("button", { name: "データ管理" }).click();
  const backup = page.getByRole("region", { name: "バックアップと復元" });
  await expect(backup).toContainText("外部送信なし");
  const downloadPromise = page.waitForEvent("download");
  await backup.getByRole("button", { name: "JSONを書き出す" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^focusboard-backup-.*\.json$/);
  const exportedBackup = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(exportedBackup).tasks).toHaveLength(1);

  await backup.locator("input[type=file]").setInputFiles({
    name: "focusboard-roundtrip.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportedBackup)
  });
  await expect(backup.getByRole("region", { name: "復元前の確認" })).toBeVisible();
  await backup.getByRole("button", { name: "スマートマージを実行" }).click();
  await expect(backup.getByRole("status")).toContainText("スマートマージが完了しました");
  await page.reload();
  const reloadedTasks = await openTasks(page);
  await expect(reloadedTasks.getByText(taskTitle)).toBeVisible();
});

test("task completion can be undone and task details open from the list", async ({ page }) => {
  const tasks = await openTasks(page);
  const title = "E2E 詳細タスク";
  await tasks.getByRole("textbox", { name: "新しいタスク" }).fill(title);
  await tasks.getByRole("button", { name: "タスクを追加" }).click();
  await expect(tasks.getByText(title)).toBeVisible();
  await tasks.getByRole("button", { name: `${title}を完了` }).click();
  await tasks.getByRole("button", { name: "元に戻す" }).click();
  await expect(tasks.getByRole("button", { name: `${title}を完了` })).toBeVisible();
  await tasks.getByRole("button", { name: new RegExp(`${title} 集中回数`) }).click();
  await expect(tasks.getByRole("form", { name: `${title}の詳細` })).toBeVisible();
});

test("timer can pause, resume, complete, and show overflow interactions", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-10T01:00:00.000Z") });
  await page.reload();
  await page.getByRole("button", { name: "カウントダウン" }).click();
  await page.getByRole("spinbutton", { name: "時間（分）" }).fill("1");
  await page.getByRole("button", { name: "開始", exact: true }).click();
  const picker = page.getByRole("dialog", { name: /タスク/ });
  if (await picker.count()) await picker.getByRole("button", { name: "タスクなしで開始" }).click();

  await expect(page.getByRole("button", { name: "一時停止" })).toBeVisible();
  await page.clock.fastForward(5_000);
  await page.getByRole("button", { name: "一時停止" }).click();
  await expect(page.getByRole("button", { name: "再開" })).toBeVisible();
  await page.getByRole("button", { name: "再開" }).click();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("status").filter({ hasText: /延長中/ })).toBeVisible();
  await page.getByRole("button", { name: "終了", exact: true }).click();
  await expect(page.getByRole("button", { name: "開始", exact: true })).toBeVisible();

  const tasks = await openTasks(page);
  await tasks.getByRole("button", { name: "レポート", exact: true }).click();
  await expect(page.getByRole("region", { name: "集中レポート" })).toContainText("集中履歴");
});

test("app remains usable when browser storage and fullscreen are unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.indexedDB, "open", {
      configurable: true,
      value: () => { throw new DOMException("Storage disabled", "UnknownError"); }
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: () => Promise.reject(new Error("Fullscreen denied"))
    });
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  const settings = await openSettings(page);
  await settings.getByRole("tab", { name: "表示" }).click();
  await settings.getByRole("checkbox", { name: "全画面表示" }).click();
  await expect(page.getByRole("status")).toContainText("このブラウザでは全画面表示を利用できません。");
  await settings.getByRole("button", { name: "タスクを開く" }).click();
  await expect(page.getByText("タスク保存を利用できません")).toBeVisible();
  await expect(page.getByRole("button", { name: "時計とカレンダーの表示設定を開く" })).toBeVisible();
});
