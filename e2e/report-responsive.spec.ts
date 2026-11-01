import { expect, test } from "@playwright/test";

test("report charts fit the available width and retain the selected period", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date("2026-10-24T18:00:00+09:00"));
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("focusboard-productivity", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["focusSessions", "tasks", "projects"], "readwrite");
      const taskNames = ["制御の復習", "回路設計", "技術資料を読む"];
      const projectNames = ["学習", "開発", "読書"];
      for (let index = 0; index < 3; index += 1) {
        tx.objectStore("projects").put({ version: 1, id: `report-project-${index}`, name: projectNames[index], color: "#315f98", order: index, archivedAt: null, createdAt: 1, updatedAt: 1 });
        tx.objectStore("tasks").put({ version: 1, id: `report-task-${index}`, title: taskNames[index], status: "active", bucket: "inbox", projectId: `report-project-${index}`, parentTaskId: null, note: "", dueDate: null, reminderAt: null, repeatRule: null, repeatSeriesId: null, estimatedPomodoros: 4, order: index, createdAt: 1, updatedAt: 1, completedAt: null });
      }
      for (let offset = 0; offset < 365; offset += 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        date.setHours(9 + offset % 8, 0, 0, 0);
        const startedAt = date.getTime();
        const duration = (25 + offset % 4 * 20) * 60_000;
        const taskIndex = offset % 3;
        tx.objectStore("focusSessions").put({ version: 2, id: `report-${offset}`, taskId: `report-task-${taskIndex}`,
          taskTitleSnapshot: taskNames[taskIndex], projectIdSnapshot: `report-project-${taskIndex}`, projectNameSnapshot: projectNames[taskIndex],
          program: "pomodoro", mode: "work", result: "completed", startedAt, endedAt: startedAt + duration,
          plannedDurationMs: duration, focusedDurationMs: duration, pauseIntervals: [] });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  const launcher = page.getByRole("button", { name: /タスクを開く/ });
  if (!(await launcher.isVisible())) await page.locator(".app-shell").click({ position: { x: 12, y: 12 } });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "タスク", exact: true });
  await dialog.getByRole("button", { name: "レポート", exact: true }).click();
  const report = page.locator(".productivity-report");
  for (const width of [320, 390, 600, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const period of ["日", "週", "月"]) {
      const button = report.getByRole("group", { name: "集計期間", exact: true }).getByRole("button", { name: period, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await report.getByRole("button", { name: /集中時間 (?!0分)/ }).last().click();
      await expect(report.locator(".report-comparison__selected")).toBeVisible();
      const picker = report.getByRole("combobox", { name: period === "日" ? "グラフの時間を選択" : "グラフの日付を選択" });
      await expect(picker).toBeVisible();
      if (period === "月") {
        await report.evaluate((root) => { let parent = root.parentElement; while (parent) { parent.scrollTop = 0; parent = parent.parentElement; } });
        await page.screenshot({ path: `test-results/report-${process.env.REPORT_BASELINE ? "before" : "after"}-${width}-month.png` });
      }
      if (!process.env.REPORT_BASELINE) {
        const order = await report.evaluate((root) => [".report-summary", ".report-comparison", "#project-report-title"].map((selector) => root.querySelector(selector)!.getBoundingClientRect().top));
        expect(order[0]).toBeLessThan(order[1]);
        expect(order[1]).toBeLessThan(order[2]);
        const overflow = await report.evaluate((root) => [...root.querySelectorAll<HTMLElement>("*:not([hidden])")]
          .filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "auto")
          .map((el) => el.className));
        expect(overflow, `horizontal scrollers at ${width}px/${period}`).toEqual([]);
        const escaped = await report.evaluate((root) => {
          const bounds = root.getBoundingClientRect();
          return [...root.querySelectorAll<HTMLElement>("*")].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > bounds.right + 1).map((el) => ({ cls: el.className, text: el.textContent?.slice(0, 40), width: el.getBoundingClientRect().width }));
        });
        expect(await report.evaluate((el) => el.scrollWidth - el.clientWidth), JSON.stringify(escaped)).toBeLessThanOrEqual(1);
      }
    }
    await report.getByRole("button", { name: /年間の集中記録/ }).click();
    await expect(report.getByRole("button", { name: "‹ レポートに戻る" })).toBeInViewport();
    await page.screenshot({ path: `test-results/report-${process.env.REPORT_BASELINE ? "before" : "after"}-${width}-annual.png` });
    if (!process.env.REPORT_BASELINE) {
      expect(await report.locator(".report-activity__calendar").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await expect(report.getByRole("button", { name: "年間の集中記録", exact: true })).toHaveAttribute("aria-pressed", "true");
      expect(await report.locator(".report-month__day").first().evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(12);
      await report.locator(".report-month__day").last().scrollIntoViewIfNeeded();
      await report.evaluate((root) => { let parent = root.parentElement; while (parent) { if (parent.scrollHeight > parent.clientHeight) parent.scrollTop = parent.scrollHeight; parent = parent.parentElement; } });
      const lastDay = await report.locator(".report-month__day").last().boundingBox();
      const launcherBox = await launcher.boundingBox();
      expect(lastDay!.y + lastDay!.height).toBeLessThan(launcherBox!.y);
    }
    await report.getByRole("button", { name: "‹ レポートに戻る" }).click();
    await report.getByRole("button", { name: /実施時間帯/ }).click();
    await expect(report.getByRole("button", { name: "‹ レポートに戻る" })).toBeInViewport();
    await page.screenshot({ path: `test-results/report-${process.env.REPORT_BASELINE ? "before" : "after"}-${width}-timeline.png` });
    if (!process.env.REPORT_BASELINE) expect(await report.locator(".focus-timeline__scroll").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await report.getByRole("button", { name: "‹ レポートに戻る" }).click();
  }
});
