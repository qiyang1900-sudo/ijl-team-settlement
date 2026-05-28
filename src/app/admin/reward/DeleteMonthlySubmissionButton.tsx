"use client";

export default function DeleteMonthlySubmissionButton({
  submissionId,
  action,
}: {
  submissionId: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("这条月数据记录会从管理员和战队页面同时消失。确定删除吗？")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="submission_id" value={submissionId} />
      <button className="rounded-lg border border-rose-400 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-950">
        删除记录
      </button>
    </form>
  );
}
