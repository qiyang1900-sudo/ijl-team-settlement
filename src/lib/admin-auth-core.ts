export const adminSessionCookieName = "admin_session";
export const adminSessionMaxAgeSeconds = 60 * 60 * 24 * 30;

type AdminSessionPayload = {
  role: "admin";
  expiresAt: number;
};

export function verifyAdminPassword(password: unknown) {
  return String(password || "") === getAdminPassword();
}

export async function createAdminSessionToken(now = Date.now()) {
  const payload: AdminSessionPayload = {
    role: "admin",
    expiresAt: now + adminSessionMaxAgeSeconds * 1000,
  };
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await createSignature(encodedPayload);

  if (!timingSafeStringEqual(expectedSignature, signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecodeText(encodedPayload)) as Partial<AdminSessionPayload>;

    if (payload.role !== "admin" || typeof payload.expiresAt !== "number") {
      return null;
    }

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return payload as AdminSessionPayload;
  } catch {
    return null;
  }
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "1900";
}

function getAdminSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.TEAM_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "local-admin-session-secret"
  );
}

async function createSignature(encodedPayload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAdminSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncodeText(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeText(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(paddedBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function timingSafeStringEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
