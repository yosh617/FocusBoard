import { useEffect, useState } from "react";

export function useClock(showSeconds: boolean) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, showSeconds ? 250 : 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [showSeconds]);

  return now;
}
