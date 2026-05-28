import "server-only";

import { cookies } from "next/headers";
import {
  adminSessionCookieName,
  adminSessionMaxAgeSeconds,
  createAdminSessionToken,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "@/lib/admin-auth-core";

export { verifyAdminPassword };

export async function setAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set(adminSessionCookieName, await createAdminSessionToken(), {
    httpOnly: true,
    maxAge: adminSessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  return verifyAdminSessionToken(token);
}
