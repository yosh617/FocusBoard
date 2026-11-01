import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1280]) {
  test(`edits task deadlines with a right swipe at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: /タスクを開く/ }).click();
    const tasks = page.locator(".task-drawer");
    const openToday = async () => {
      const navigation = tasks.getByRole("navigation", { name: "タスク一覧", exact: true });
      if (await navigation.isVisible()) await navigation.getByRole("button", { name: /^今日 / }).click();
    };
    await openToday();
    await tasks.getByRole("textbox", { name: "新しいタスク" }).fill("スワイプ期限テスト");
    await tasks.getByRole("button", { name: "タスクを追加", exact: true }).click();
    const row = tasks.getByRole("article").filter({ hasText: "スワイプ期限テスト" });
    const touchSession = width === 390 ? await page.context().newCDPSession(page) : null;
    const swipe = async (direction: 1 | -1) => {
      await row.scrollIntoViewIfNeeded();
      const box = (await row.boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (touchSession) {
        await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        for (let step = 1; step <= 8; step++) {
          await touchSession.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 85 * direction * step / 8, y: y + 2 }] });
        }
        await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        return;
      }
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 85 * direction, y + 2, { steps: 8 });
      await page.mouse.up();
    };
    await swipe(1);
    const editor = page.getByRole("dialog", { name: "期限を変更", exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByText("スワイプ期限テスト", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "期限", exact: true }).click();
    await editor.getByRole("button", { name: "今日", exact: true }).click();
    await page.screenshot({ path: `test-results/swipe-due-${width}.png` });
    await editor.getByRole("button", { name: "保存", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /タスクを開く/ }).click();
    await openToday();
    await swipe(1);
    await expect(editor.getByRole("button", { name: "期限", exact: true })).not.toHaveText("日付を選択");
    await editor.getByRole("button", { name: "期限なし", exact: true }).click();
    await editor.getByRole("button", { name: "保存", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await swipe(1);
    await expect(editor.getByRole("button", { name: "期限", exact: true })).toHaveText("日付を選択");
    await editor.getByRole("button", { name: "キャンセル", exact: true }).click();
    await swipe(-1);
    await expect(page.getByRole("dialog", { name: "タスクを完全に削除しますか？", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    await expect(row).toBeVisible();
    await swipe(1);
    await editor.getByRole("button", { name: "期限", exact: true }).click();
    await editor.getByRole("button", { name: "明日", exact: true }).click();
    await editor.getByRole("button", { name: "保存", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(row).not.toBeVisible();
    await expect(tasks.locator("#task-workspace-main")).toBeFocused();
  });
}
