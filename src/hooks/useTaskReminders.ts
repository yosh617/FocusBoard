import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskRecord } from "../types/task";

type ReminderPermission = NotificationPermission | "unsupported";

export function useTaskReminders(tasks: TaskRecord[]) {
  const [message, setMessage] = useState("");
  const [permission, setPermission] = useState<ReminderPermission>(() => "Notification" in globalThis ? Notification.permission : "unsupported");
  const deliveredRef = useRef(new Set<string>());

  const checkReminders = useCallback(() => {
    const now = Date.now();
    const due = tasks
      .filter((task) => task.status === "open" && task.reminderAt !== null && task.reminderAt <= now)
      .sort((a, b) => (a.reminderAt ?? 0) - (b.reminderAt ?? 0));
    for (const task of due) {
      const key = `${task.id}:${task.reminderAt}`;
      if (deliveredRef.current.has(key)) continue;
      deliveredRef.current.add(key);
      const body = `「${task.title}」の時間です。`;
      setMessage(body);
      if (permission === "granted") {
        try { new Notification("FocusBoard", { body, tag: key }); } catch { /* In-app reminder remains available. */ }
      }
      break;
    }
  }, [permission, tasks]);

  useEffect(() => {
    checkReminders();
    const interval = window.setInterval(checkReminders, 15_000);
    document.addEventListener("visibilitychange", checkReminders);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkReminders);
    };
  }, [checkReminders]);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in globalThis)) return false;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setMessage(result === "granted" ? "システム通知を有効にしました。" : "システム通知は許可されませんでした。アプリ内でお知らせします。");
      return result === "granted";
    } catch {
      setMessage("システム通知を設定できませんでした。アプリ内でお知らせします。");
      return false;
    }
  }, []);

  return {
    reminderMessage: message,
    setReminderMessage: setMessage,
    notificationPermission: permission,
    requestNotificationPermission: requestPermission
  };
}
