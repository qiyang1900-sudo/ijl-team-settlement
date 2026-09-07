const waitingReviewStatuses = [
  "submitted",
  "resubmitted",
  "pending",
  "pending_review",
  "reviewing",
];

export function normalizeProjectSubmissionStatus(status: string | null | undefined) {
  // Compatibility for records created before exports stopped changing approval state.
  return status === "exported" ? "approved" : String(status || "");
}

export function getTeamStatusLabel(status: string) {
  status = normalizeProjectSubmissionStatus(status);
  if (status === "returned") {
    return "差し戻し（追記必要）";
  }

  if (status === "draft") {
    return "保存済み";
  }

  if (status === "submitted") {
    return "提出済み";
  }

  if (isWaitingReview(status)) {
    return "審査中";
  }

  if (status === "approved") {
    return "承認済み";
  }

  return "未提出";
}

export function getAdminStatusLabel(status: string) {
  status = normalizeProjectSubmissionStatus(status);
  if (status === "returned") {
    return "已驳回需补充";
  }

  if (status === "draft") {
    return "已保存";
  }

  if (status === "submitted") {
    return "已提交";
  }

  if (isWaitingReview(status)) {
    return "审核中";
  }

  if (status === "approved") {
    return "已通过";
  }

  return "未提交";
}

export function getStatusTone(status: string) {
  status = normalizeProjectSubmissionStatus(status);
  if (status === "returned") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (waitingReviewStatuses.includes(status)) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (status === "approved") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function isApprovedLike(status: string) {
  return normalizeProjectSubmissionStatus(status) === "approved";
}

export function isWaitingReview(status: string) {
  return waitingReviewStatuses.includes(status);
}
