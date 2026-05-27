const waitingReviewStatuses = [
  "submitted",
  "resubmitted",
  "pending",
  "pending_review",
];

export function getTeamStatusLabel(status: string) {
  if (status === "returned") {
    return "再提出待ち";
  }

  if (waitingReviewStatuses.includes(status)) {
    return "審査待ち";
  }

  if (status === "approved" || status === "exported") {
    return "承認済み";
  }

  return "未提出";
}

export function getAdminStatusLabel(status: string) {
  if (status === "returned") {
    return "待再次提交";
  }

  if (waitingReviewStatuses.includes(status)) {
    return "待审核";
  }

  if (status === "approved" || status === "exported") {
    return "审核通过";
  }

  return "未提交";
}

export function getStatusTone(status: string) {
  if (status === "returned") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (waitingReviewStatuses.includes(status)) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (status === "approved" || status === "exported") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function isApprovedLike(status: string) {
  return status === "approved" || status === "exported";
}

export function isWaitingReview(status: string) {
  return waitingReviewStatuses.includes(status);
}
