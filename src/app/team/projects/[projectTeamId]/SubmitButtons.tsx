"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export default function SubmitButtons() {
  const { pending } = useFormStatus();
  const [clickedAction, setClickedAction] = useState<"draft" | "submit" | null>(
    null
  );

  return (
    <div className="flex justify-end gap-3">
      <button
        type="submit"
        name="action_type"
        value="draft"
        disabled={pending}
        onClick={() => setClickedAction("draft")}
        className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && clickedAction === "draft" ? "保存中..." : "下書き保存"}
      </button>

      <button
        type="submit"
        name="action_type"
        value="submit"
        disabled={pending}
        onClick={() => setClickedAction("submit")}
        className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && clickedAction === "submit" ? "提出中..." : "審査へ提出"}
      </button>
    </div>
  );
}
