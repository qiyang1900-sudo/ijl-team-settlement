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
        className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && clickedAction === "draft" ? "保存中..." : "保存草稿"}
      </button>

      <button
        type="submit"
        name="action_type"
        value="submit"
        disabled={pending}
        onClick={() => setClickedAction("submit")}
        className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && clickedAction === "submit" ? "提交中..." : "提交审核"}
      </button>
    </div>
  );
}
