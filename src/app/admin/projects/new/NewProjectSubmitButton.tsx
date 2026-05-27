"use client";

import { useFormStatus } from "react-dom";

export default function NewProjectSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "保存中..." : "保存项目"}
    </button>
  );
}
