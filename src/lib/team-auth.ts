import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const sessionCookieName = "team_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

const teamPasswordHashes: Record<string, string> = {
  AXIZ: "pbkdf2_sha256$120000$be9948f8a823d316bb2335ebcbcebdc5$6e09f23043b4ad9e6851454f716bd765936a14ef672d3c07e70a156f43b629db",
  AWG: "pbkdf2_sha256$120000$ab34ceb3b813c1f2501fe781e178077d$f3761a16df84951e436e8085342846b14f78ae4bf025b0bc246153801f992126",
  DFM: "pbkdf2_sha256$120000$37973161e62a7b0e6744d2620841e8eb$36dfd8b8fdc92159b0df32bfa8fcff37a812d84136411d2ce64f735c577b406f",
  FL: "pbkdf2_sha256$120000$8ad85de5696757f4ea0f75628ae623cc$c6965007765dacca8f70281e153ac4713ffd748e631436ab1592d94cf049035a",
  QTD: "pbkdf2_sha256$120000$48d15544a857bfa77410175670247b1d$a8e458b2f11fcf87675f7f30da6928fe6963398347abb0a7614725a8b1764f40",
  RC: "pbkdf2_sha256$120000$0a54fdafd987ff983cf35f0e158ea1fb$4bf5ea53af256f2cfc9ab8613d9efe3f1a3c7139b7f502ec67971c48c1f2a6cc",
  SZ: "pbkdf2_sha256$120000$3694d523e50c81604cade9d0e92cde3e$fc00733364362dea0eb41c3b6dd7e19dcad4229fb90c833481c6a01f05ff4902",
  ZETA: "pbkdf2_sha256$120000$7b25672e3d6edd986bc2155f02b418f9$90e8dcbb785f78a493b33670a7505322b2c1109a9e686effc9a74ad9074054cc",
};

type TeamSessionPayload = {
  teamId: string;
  teamShortName: string;
  expiresAt: number;
};

export function verifyTeamPassword(shortName: unknown, password: unknown) {
  const teamKey = normalizeTeamShortName(shortName);
  const storedHash = teamPasswordHashes[teamKey];

  if (!storedHash || typeof password !== "string") {
    return false;
  }

  const [, iterationsText, salt, expectedHash] = storedHash.split("$");
  const iterations = Number(iterationsText);

  if (!Number.isFinite(iterations) || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, iterations, 32, "sha256")
    .toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export async function setTeamSession({
  teamId,
  teamShortName,
}: {
  teamId: string;
  teamShortName: string;
}) {
  const payload: TeamSessionPayload = {
    teamId,
    teamShortName: normalizeTeamShortName(teamShortName),
    expiresAt: Date.now() + sessionMaxAgeSeconds * 1000,
  };
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, signPayload(payload), {
    httpOnly: true,
    maxAge: sessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getTeamSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const payload = verifySignedPayload(token);

  if (!payload || payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

export async function requireTeamAccess(teamId: string) {
  const session = await getTeamSession();

  if (session?.teamId === teamId) {
    return session;
  }

  redirect(`/team/login?teamId=${encodeURIComponent(teamId)}&error=login_required`);
}

function normalizeTeamShortName(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function signPayload(payload: TeamSessionPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload(token: string): TeamSessionPayload | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createSignature(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<TeamSessionPayload>;

    if (
      typeof payload.teamId !== "string" ||
      typeof payload.teamShortName !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }

    return payload as TeamSessionPayload;
  } catch {
    return null;
  }
}

function createSignature(encodedPayload: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function getSessionSecret() {
  return (
    process.env.TEAM_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "local-team-session-secret"
  );
}
