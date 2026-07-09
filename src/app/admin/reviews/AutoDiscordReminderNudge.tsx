"use client";

import { useEffect } from "react";

type CronReminderResponse = {
  ok?: boolean;
  error?: string;
  failed?: number;
};

export default function AutoDiscordReminderNudge() {
  useEffect(() => {
    const todayKey = getTokyoDateKey(new Date());
    const storageKey = `ijl:auto-discord-reminders:${todayKey}`;

    if (window.localStorage.getItem(storageKey) === "done") {
      return;
    }

    window.localStorage.setItem(storageKey, "pending");

    fetch("/api/cron/discord-reminders?source=admin_reviews", {
      method: "POST",
      cache: "no-store",
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as
          | CronReminderResponse
          | null;

        if (!response.ok || result?.error || (result?.failed || 0) > 0) {
          window.localStorage.removeItem(storageKey);
          return;
        }

        window.localStorage.setItem(storageKey, "done");
      })
      .catch(() => {
        window.localStorage.removeItem(storageKey);
      });
  }, []);

  return null;
}

function getTokyoDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";

  return `${year}-${month}-${day}`;
}
