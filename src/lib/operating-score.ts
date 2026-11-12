import { isOfficialMonthlyRow, parseMonthlyPlayerRows, type MonthlyPlayerRow } from "./monthly-data";
import { parseMonthlyContent, contentWorkKey } from "./monthly-content";
import { parseClubActivityItems } from "./club-activities";
import type { TiktokMonthlyRow } from "./tiktok-monthly-data";
import type { TiktokImportIssue } from "./tiktok-sheet-import";

export const operatingStartMonth = "2026-10";
export const operatingRuleVersion = "2026-10-v2";
export const operatingGroups = {
  players: { label: "① 選手管理", max: 15 },
  team: { label: "② チーム管理", max: 25 },
  youtube: { label: "YouTube運用", max: 30 },
  tiktok: { label: "TikTok運用", max: 15 },
  x: { label: "X運用", max: 15 },
} as const;
export type OperatingGroup = keyof typeof operatingGroups;
export const operatingFields = {
  salary: { label: "給与関連", group: "players", min: 0, max: 5 },
  conduct: { label: "選手管理", group: "players", min: 0, max: 10 },
  fans: { label: "ファンイベント", group: "team", min: 0, max: 10 },
  cooperation: { label: "運営への協力", group: "team", min: 0, max: 10 },
  appearances: { label: "選手のイベント出演", group: "team", min: 0, max: 5 },
  officialVideos: { label: "公式動画 2本", group: "youtube", min: 0, max: 10 },
  memberVideos: { label: "選手・コーチ長尺 4本（指定2本）", group: "youtube", min: 0, max: 10 },
  memberShorts: { label: "選手・コーチ Shorts 8本（指定4本＋その他4本）", group: "youtube", min: 0, max: 10 },
  streams: { label: "全隊 YouTube配信 20回", group: "youtube", min: -10, max: 0 },
  ttAccounts: { label: "TikTokアカウント開設", group: "tiktok", min: 0, max: 5 },
  ttPosts: { label: "TikTok投稿 5本", group: "tiktok", min: 0, max: 10 },
  xProfile: { label: "プロフィール統一", group: "x", min: -5, max: 0 },
  xPosts: { label: "公式X投稿 15件", group: "x", min: 0, max: 10 },
  xReposts: { label: "指定投稿の引用・リポスト", group: "x", min: -10, max: 0 },
} as const;
export type OperatingField = keyof typeof operatingFields;
export type OperatingInputs = { scores: Partial<Record<OperatingField, number>>; note: string };
export type OperatingTeam = { id: string; name: string; short_name: string; is_active: boolean };
export type OperatingSubmission = {
  team_id: string; target_month: string; status: string; player_rows: unknown;
  content_entries?: unknown; club_activity_link?: string | null;
  club_activity_image_url?: string | null; club_activity_image_name?: string | null;
};
export type OperatingContext = {
  month: string; teams: OperatingTeam[]; submissions: OperatingSubmission[];
  tiktokRows: TiktokMonthlyRow[]; tiktokIssues: TiktokImportIssue[];
};
export type OperatingItem = {
  key: OperatingField; auto: number; score: number; reason: string;
  manual: boolean; adjusted: boolean; missing: boolean;
};
export type OperatingResult = {
  teamId: string; name: string; shortName: string; month: string;
  hasSubmittedData: boolean; submissionStatus: string;
  items: OperatingItem[]; groups: Record<OperatingGroup, number>;
  total: number | null; grade: string | null; note: string; deductions: string[];
};
export type OperatingReview = {
  team_id: string; target_month: string; status: "draft" | "reviewed";
  inputs: OperatingInputs; source_hash: string; updated_at: string;
  result: OperatingResult;
};
export function validOperatingMonth(month: string) {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) && month >= operatingStartMonth;
}
export function normalizeOperatingInputs(value: unknown): OperatingInputs {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("评分内容格式不正确。");
  const raw = value as Record<string, unknown>;
  if (!raw.scores || typeof raw.scores !== "object" || Array.isArray(raw.scores)) throw new Error("评分项目格式不正确。");
  const scores: OperatingInputs["scores"] = {};
  for (const [key, value] of Object.entries(raw.scores)) {
    if (!Object.hasOwn(operatingFields, key)) throw new Error("存在未知评分项目。");
    const field = key as OperatingField, rule = operatingFields[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < rule.min || value > rule.max)
      throw new Error(`${rule.label} 必须为 ${rule.min}～${rule.max} 的整数。`);
    scores[field] = value;
  }
  const note = String(raw.note ?? "").trim();
  if (note.length > 4000) throw new Error("审核备注不能超过4000字。");
  if (Object.keys(scores).length && !note) throw new Error("人工调整时请填写审核备注，说明扣分项目和原因。");
  return { scores, note };
}
function count(value: unknown): number | null {
  const text = String(value ?? "").normalize("NFKC").trim().replace(/,/g, "");
  const n = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(n) ? n : null;
}
function total(rows: MonthlyPlayerRow[], field: keyof MonthlyPlayerRow) {
  const values = rows.map((row) => count(row[field]));
  return { value: values.reduce<number>((sum, value) => sum + (value ?? 0), 0), missing: !values.length || values.includes(null) };
}
export function operatingGrade(score: number) {
  return score >= 90 ? "S" : score >= 85 ? "A" : score >= 75 ? "B" : score >= 65 ? "C" : "D";
}
export function calculateOperatingTeam(team: OperatingTeam, context: OperatingContext, inputs: OperatingInputs = { scores: {}, note: "" }): OperatingResult {
  if (!validOperatingMonth(context.month)) throw new Error("運営方針评分从2026年10月开始。");
  const submissions = context.submissions.filter((row) => row.team_id === team.id && row.target_month === context.month);
  if (submissions.length > 1) throw new Error(`${team.short_name} 本月有重复月数据，请先核查。`);
  const submission = submissions[0];
  const hasSubmittedData = ["submitted", "reviewing", "approved"].includes(submission?.status ?? "");
  const rows = hasSubmittedData ? parseMonthlyPlayerRows(submission.player_rows) : [];
  const official = rows.filter(isOfficialMonthlyRow);
  const members = rows.filter((row) => !isOfficialMonthlyRow(row) && !/manager|マネージャー|经理|經理|運営スタッフ|运营/i.test(`${row.playerRole ?? ""} ${row.playerPosition ?? ""}`));
  const all = [...official, ...members];
  const items: OperatingItem[] = [];
  const add = (key: OperatingField, auto: number, reason: string, manual = false, missing = false) =>
    items.push({ key, auto, score: inputs.scores[key] ?? auto, reason, manual, missing, adjusted: inputs.scores[key] != null });
  add("salary", 5, "默认符合：提交工资明细并接受审核，俱乐部奖金留成不超过40%。需扣分时由人工复核；不改变工资审核状态。", true);
  add("conduct", 10, "默认遵守选手合同、大会规则及工作人员指示；违约或违规由人工复核扣分。", true);
  const activities = hasSubmittedData ? parseClubActivityItems({
    link: submission.club_activity_link, imageUrl: submission.club_activity_image_url, imageName: submission.club_activity_image_name,
  }).filter((item) => (!item.activityDate || item.activityDate.startsWith(`${context.month}-`)) && Boolean(item.link || item.imageUrl)) : [];
  const eventCount = new Set(activities.map((item) => item.link || item.imageUrl)).size;
  add("fans", eventCount >= 1 ? 10 : 0, `クラブ活動有凭证的当月活动 ${eventCount}/1 场${eventCount < 1 ? "，未达标扣10分" : "，达标"}。仅物贩不计入，内容资格由人工复核。`);
  add("cooperation", 10, "默认符合：四岗位独立且不兼任选手；空缺不超过10天、变更3个工作日内报备；按时提交、配合活动素材及会议、及时沟通。", true);
  add("appearances", 5, "默认完成联盟指定活动出演（每月最多1次）；未被要求出演不扣分。", true);
  const ov = total(official, "youtubeVideoPostCount");
  add("officialVideos", ov.value >= 2 ? 10 : 0, `官方普通视频 ${ov.value}/2 条${ov.value < 2 ? "，未达标扣10分" : "，达标"}。`, false, ov.missing);
  const seen = new Set<string>();
  let long = 0, short = 0;
  for (const work of hasSubmittedData ? parseMonthlyContent(submission.content_entries) : []) {
    const key = contentWorkKey(work.url);
    if (!key || seen.has(key) || !work.claims.includes("designated") || !work.publishedOn.startsWith(`${context.month}-`) ||
      work.accountId === "official" || !members.some((row) => [row.id, row.playerId].includes(work.accountId))) continue;
    seen.add(key);
    if (work.platform === "youtube") long++;
    if (work.platform === "youtube_short") short++;
  }
  const mv = total(members, "youtubeVideoPostCount"), ms = total(members, "youtubeShortPostCount");
  const longOK = mv.value >= 4 && long >= 2, shortOK = ms.value >= 8 && short >= 4;
  add("memberVideos", longOK ? 10 : 0, `选手＋教练长视频 ${mv.value}/4 条，其中指定视频 ${long}/2 条；${longOK ? "达标" : [mv.value < 4 ? "总数不足4条" : "", long < 2 ? "指定视频不足2条" : ""].filter(Boolean).join("、") + "，本项扣10分"}。指定视频包含在总数内，不重复相加。`, false, mv.missing);
  add("memberShorts", shortOK ? 10 : 0, `选手＋教练 YT Shorts ${ms.value}/8 条，其中指定 Shorts ${short}/4 条（要求指定内容4条＋其他内容4条）；${shortOK ? "达标" : [ms.value < 8 ? "总数不足8条" : "", short < 4 ? "指定Shorts不足4条" : ""].filter(Boolean).join("、") + "，本项扣10分"}。指定内容包含在总数内，不重复相加。不计官方账号或TT。`, false, ms.missing);
  const streams = total(all, "youtubeStreamCount");
  add("streams", streams.value >= 20 ? 0 : -10, `全队 YouTube 直播 ${streams.value}/20 次${streams.value < 20 ? "，扣10分" : "，不扣分"}；默认已保留存档。YouTube板块最低0分。`, false, streams.missing);
  add("ttAccounts", 5, "默认已开设TikTok账号；账号覆盖情况由人工复核。", true);
  const teamKey = (value: string) => value.trim().toUpperCase();
  const ttIssues = context.tiktokIssues.filter((issue) => issue.month === context.month && teamKey(issue.team) === teamKey(team.short_name) && !issue.metric);
  const tt = context.tiktokRows.filter((row) => row.month === context.month && teamKey(row.teamShortName) === teamKey(team.short_name));
  const validTT = tt.filter((row) => !ttIssues.some((issue) => !issue.account || [row.accountName, row.link].map(teamKey).includes(teamKey(issue.account))));
  const ttPosts = validTT.reduce((sum, row) => sum + (count(row.postCount) ?? 0), 0);
  add("ttPosts", ttPosts >= 5 ? 10 : 0, `TT官方＋成员已确认投稿 ${ttPosts}/5 条${ttPosts < 5 ? "，本项未得10分" : "，达标"}；仅TikTok，不合并YT Shorts。`, false, !tt.length || !!ttIssues.length || validTT.some((row) => count(row.postCount) === null));
  add("xProfile", 0, "默认简介格式统一，不扣分；不统一时人工扣5分。", true);
  const tweets = total(official, "xTweetCount");
  add("xPosts", tweets.value >= 15 ? 10 : 0, `官方X投稿 ${tweets.value}/15 条${tweets.value < 15 ? "，未达标扣10分" : "，达标"}；默认符合图片、文字、标签要求。不考核170条或400万曝光。`, false, tweets.missing);
  add("xReposts", 0, "默认已按要求引用／转发，不扣分；未完成时人工扣10分。", true);
  const groups = Object.fromEntries((Object.keys(operatingGroups) as OperatingGroup[]).map((key) => {
    const raw = items.filter((item) => operatingFields[item.key].group === key).reduce((sum, item) => sum + item.score, key === "x" ? 5 : 0);
    return [key, Math.max(0, Math.min(operatingGroups[key].max, raw))];
  })) as Record<OperatingGroup, number>;
  const score = hasSubmittedData ? Object.values(groups).reduce((sum, value) => sum + value, 0) : null;
  const deductions = hasSubmittedData ? items.filter((item) => item.score < operatingFields[item.key].max).map((item) =>
    `${operatingFields[item.key].label}：扣${operatingFields[item.key].max - item.score}分。${item.adjusted ? `人工复核（自动${item.auto} → ${item.score}）：${inputs.note}` : item.reason}`) : [];
  return { teamId: team.id, name: team.name, shortName: team.short_name, month: context.month, hasSubmittedData,
    submissionStatus: submission?.status ?? "not_submitted", items, groups, total: score,
    grade: score === null ? null : operatingGrade(score), note: inputs.note, deductions };
}
