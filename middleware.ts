import { NextResponse, type NextRequest } from "next/server";
import {
  adminSessionCookieName,
  verifyAdminSessionToken,
} from "@/lib/admin-auth-core";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAdminLoginPath(pathname)) {
    return NextResponse.next();
  }

  const session = await verifyAdminSessionToken(
    request.cookies.get(adminSessionCookieName)?.value
  );

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

function isAdminLoginPath(pathname: string) {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}
