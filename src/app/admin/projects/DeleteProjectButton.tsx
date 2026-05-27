"use client";

type DeleteProjectButtonProps = {
  projectId: string;
  projectTitle: string;
  deleteProjectAction: (formData: FormData) => void | Promise<void>;
};

export default function DeleteProjectButton({
  projectId,
  projectTitle,
  deleteProjectAction,
}: DeleteProjectButtonProps) {
  return (
    <form
      action={deleteProjectAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `确定要删除「${projectTitle}」吗？\n\n项目、战队提交内容、审核记录和已上传截图都会一起删除，删除后无法恢复。`
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <button
        type="submit"
        className="text-red-300 underline hover:text-red-100"
      >
        删除项目
      </button>
    </form>
  );
}
