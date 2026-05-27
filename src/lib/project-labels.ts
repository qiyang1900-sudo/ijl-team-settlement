const templateTypeLabels: Record<string, string> = {
  subsidy_report: "补助金结案报告",
  transportation_report: "交通费精算",
  invoice_report: "请款/发票相关",
  prize_report: "奖金相关",
  other: "其他",
};

const projectStatusLabels: Record<string, string> = {
  active: "进行中",
  inactive: "已停用",
  archived: "已归档",
  closed: "已关闭",
  completed: "已完成",
  draft: "草稿",
};

export function getTemplateTypeLabel(templateType?: string | null) {
  if (!templateType) {
    return "-";
  }

  return templateTypeLabels[templateType] || "其他";
}

export function getProjectStatusLabel(status?: string | null) {
  if (!status) {
    return "-";
  }

  return projectStatusLabels[status] || "未设置";
}
