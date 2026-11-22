import { NextRequest, NextResponse } from "next/server";

// Kept in sync with SESSION_COOKIE in src/server/session.ts. This only checks cookie presence.
const SESSION_COOKIE = "ota_admin_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|svg|jpg|jpeg|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const signedIn = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (!signedIn && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (signedIn && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
