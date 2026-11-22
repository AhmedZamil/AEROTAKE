import { NextRequest, NextResponse } from "next/server";

/**
 * Google Identity Services only accepts http://localhost:PORT (and real https hosts) as JS origins.
 * Opening the storefront as http://[::]:3001 or http://127.0.0.1:3001 yields Error 400: invalid_request.
 *
 * Only redirect top-level HTML navigations — never /api/* or asset requests. A 308 on POST /api/search
 * aborts or strips the body and makes Search look broken.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/videos/") ||
    pathname.startsWith("/images/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // RSC / prefetch / XHR should keep the current host; only send the browser document to localhost.
  const accept = request.headers.get("accept") ?? "";
  const dest = request.headers.get("sec-fetch-dest") ?? "";
  const isDocument =
    dest === "document" || (accept.includes("text/html") && !accept.includes("text/x-component"));
  if (!isDocument) return NextResponse.next();

  const host = request.headers.get("host") ?? "";
  const loopback =
    host.startsWith("[::]") ||
    host.startsWith("[::1]") ||
    host === "127.0.0.1" ||
    host.startsWith("127.0.0.1:");
  if (!loopback) return NextResponse.next();

  const port = host.match(/:(\d+)$/)?.[1] ?? "";
  const url = request.nextUrl.clone();
  url.hostname = "localhost";
  url.port = port;
  url.protocol = "http:";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
