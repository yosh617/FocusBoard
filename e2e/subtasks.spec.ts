import { expect, test, type Page } from "@playwright/test";

async function openTasks(page: Page) {
  const button = page.getByRole("button", { name: /^タスクを開く/ });
  if (!await button.isVisible()) await page.locator(".app-shell").click({ position: { x: 12, y: 12 } });
  await button.click();
  const tasks = page.getByRole("dialog", { name: "タスク", exact: true });
  await expect(tasks).toBeVisible();
  if (!await tasks.getByRole("textbox", { name: "新しいタスク" }).isVisible()) {
    await tasks.getByRole("navigation", { name: "タスク一覧", exact: true }).getByRole("button", { name: /^今日 / }).click();
  }
  return tasks;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1280, height: 800 }]) {
  test(`subtasks support details, persistence, completion and undo at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const tasks = await openTasks(page);
    const parent = "親タスク：技術資料をまとめる";
    const child = "図を確認して必要な説明を追加するサブタスク";
    const grandchild = "用語を確認する";
    await tasks.getByRole("textbox", { name: "新しいタスク" }).fill(parent);
    await tasks.getByRole("button", { name: "タスクを追加", exact: true }).click();
    await tasks.getByRole("button", { name: new RegExp(`${parent} 集中回数`) }).click();
    let details = tasks.getByRole("form", { name: `${parent}の詳細`, exact: true });
    await details.getByText("詳細設定", { exact: true }).click();
    await details.getByText("サブタスク", { exact: true }).click();
    await details.getByRole("textbox", { name: "サブタスク名" }).fill(child);
    await details.getByRole("button", { name: "追加", exact: true }).click();
    await details.getByRole("button", { name: `${child}の詳細を開く` }).click();
    details = tasks.getByRole("form", { name: `${child}の詳細`, exact: true });
    await expect(details.getByRole("button", { name: `親タスク：${parent}`, exact: true })).toBeVisible();
    await expect(details.getByRole("button", { name: `${parent}の詳細へ戻る`, exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("child-details.png") });
    await details.getByRole("group", { name: "タスクの期限をすばやく設定" }).getByRole("button", { name: "今日", exact: true }).click();
    await details.getByText("詳細設定", { exact: true }).click();
    await details.getByText("サブタスク", { exact: true }).click();
    await details.getByRole("textbox", { name: "サブタスク名" }).fill(grandchild);
    await details.getByRole("button", { name: "追加", exact: true }).click();
    await details.getByRole("button", { name: `${grandchild}の詳細を開く` }).click();
    await tasks.getByRole("form", { name: `${grandchild}の詳細`, exact: true }).getByRole("group", { name: "タスクの期限をすばやく設定" }).getByRole("button", { name: "今日", exact: true }).click();
    await tasks.getByRole("button", { name: `${child}の詳細へ戻る`, exact: true }).click();
    await tasks.getByRole("button", { name: `${parent}の詳細へ戻る`, exact: true }).click();
    await tasks.getByRole("button", { name: "タスク一覧へ戻る", exact: true }).click();
    await expect(tasks.getByRole("button", { name: `${child}のタイマーを開始`, exact: true })).toBeVisible();
    await expect(tasks.getByText(`親タスク：${parent}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("subtask-list.png") });
    expect(await tasks.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);

    await page.reload();
    const reloaded = await openTasks(page);
    await reloaded.getByRole("button", { name: new RegExp(`${child} 集中回数`) }).click();
    await expect(reloaded.getByRole("group", { name: "タスクの期限をすばやく設定" }).getByRole("button", { name: "今日", exact: true })).toHaveAttribute("aria-pressed", "true");
    await reloaded.getByRole("button", { name: `親タスク：${parent}`, exact: true }).click();
    await reloaded.getByRole("form", { name: `${parent}の詳細`, exact: true }).getByText("詳細設定", { exact: true }).click();
    await reloaded.getByRole("button", { name: `${child}の詳細を開く` }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("parent-details.png") });
    await reloaded.getByRole("button", { name: `${child}の詳細へ戻る`, exact: true }).click();
    await reloaded.getByRole("button", { name: "タスク一覧へ戻る", exact: true }).click();
    await reloaded.getByRole("button", { name: `${parent}を完了`, exact: true }).click();
    await expect(reloaded.getByRole("button", { name: `${child}を完了`, exact: true })).toHaveCount(0);
    await expect(reloaded.getByRole("button", { name: `${grandchild}を完了`, exact: true })).toHaveCount(0);
    await reloaded.getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect(reloaded.getByRole("button", { name: `${parent}を完了`, exact: true })).toBeVisible();
    await expect(reloaded.getByRole("button", { name: `${child}を完了`, exact: true })).toBeVisible();
    await expect(reloaded.getByRole("button", { name: `${grandchild}を完了`, exact: true })).toBeVisible();
  });
}
