"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  discord_webhook_url: string | null;
  discord_mention_text: string | null;
  is_active: boolean | null;
};

type TeamEditDialogProps = {
  team: Team;
  updateTeamAction: (formData: FormData) => void | Promise<void>;
};

export function TeamEditDialog({
  team,
  updateTeamAction,
}: TeamEditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
      >
        编辑信息
      </button>

      <dialog
        ref={dialogRef}
        className="w-[min(720px,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-0 text-white shadow-2xl backdrop:bg-slate-950/70"
      >
        <div className="border-b border-slate-700 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">编辑战队信息</h2>
              <p className="mt-1 text-sm text-slate-400">{team.name}</p>
            </div>

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              关闭
            </button>
          </div>
        </div>

        <form
          action={updateTeamAction}
          className="grid gap-4 px-6 py-6 md:grid-cols-2"
        >
          <input type="hidden" name="team_id" defaultValue={team.id} />

          <label className="block text-sm text-slate-300">
            战队名
            <input
              name="name"
              required
              defaultValue={team.name}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </label>

          <label className="block text-sm text-slate-300">
            简称
            <input
              name="short_name"
              defaultValue={team.short_name || ""}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </label>

          <label className="block text-sm text-slate-300">
            联系人
            <input
              name="contact_name"
              defaultValue={team.contact_name || ""}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </label>

          <label className="block text-sm text-slate-300">
            联系邮箱
            <input
              name="contact_email"
              type="email"
              defaultValue={team.contact_email || ""}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </label>

          <label className="block text-sm text-slate-300 md:col-span-2">
            Discord Webhook
            <input
              name="discord_webhook_url"
              defaultValue={team.discord_webhook_url || ""}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
          </label>

          <label className="block text-sm text-slate-300 md:col-span-2">
            负责人 Discord 用户ID / mention
            <input
              name="discord_mention_text"
              defaultValue={team.discord_mention_text || ""}
              placeholder="复制用户 ID，或填写 <@用户ID> / <@&角色ID>"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-white"
            />
            <span className="mt-2 block text-xs text-slate-500">
              只填数字也可以，系统会自动转成 Discord mention 来通知负责人。
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={Boolean(team.is_active)}
              className="h-4 w-4"
            />
            启用这个战队
          </label>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <SaveButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-800"
    >
      {pending ? "保存中..." : "保存修改"}
    </button>
  );
}
