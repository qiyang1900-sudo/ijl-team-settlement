"use client";

import { useState } from "react";

type ReminderResponse = {
  ok?: boolean;
  error?: string;
  total?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  missingWebhook?: number;
  ineligible?: number;
};

export default function ReminderButton({
  scope,
  projectTeamId,
  label,
  confirmMessage,
  disabled,
  compact = false,
}: {
  scope: "project_all" | "project_single";
  projectTeamId?: string;
  label: string;
  confirmMessage: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function sendReminder() {
    if (disabled || isPending) {
      return;
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setMessage("");
    setIsError(false);
    setIsPending(true);

    try {
      const response = await fetch("/api/admin/submission-reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, projectTeamId }),
      });
      const result = (await response.json()) as ReminderResponse;

      if (!response.ok || result.error) {
        throw new Error(result.error || "提醒发送失败。");
      }

      setMessage(formatResultMessage(result));
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "提醒发送失败。");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <button
        type="button"
        onClick={sendReminder}
        disabled={disabled || isPending}
        className={
          compact
            ? "rounded-lg border border-sky-400/60 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-50"
            : "rounded-lg bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isPending ? "发送中..." : label}
      </button>
      {message ? (
        <p
          className={`text-xs ${
            isError ? "text-rose-300" : compact ? "text-sky-200" : "text-slate-300"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function formatResultMessage(result: ReminderResponse) {
  const sent = result.sent || 0;
  const failed = result.failed || 0;
  const missingWebhook = result.missingWebhook || 0;
  const skipped = result.skipped || 0;
  const ineligible = result.ineligible || 0;
  const parts = [`已发送 ${sent} 条`];

  if (failed > 0) {
    parts.push(`失败 ${failed} 条`);
  }

  if (missingWebhook > 0) {
    parts.push(`${missingWebhook} 条未配置 Webhook`);
  }

  if (skipped > 0) {
    parts.push(`跳过 ${skipped} 条`);
  }

  if (ineligible > 0) {
    parts.push(`${ineligible} 条当前状态无需提醒`);
  }

  return parts.join("，");
}
