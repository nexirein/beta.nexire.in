/**
 * middleware.ts (root)
 * Next.js middleware for route protection.
 *
 * Public routes: /, /login, /signup, /share/*, /auth/*
 * Protected routes: everything under /projects, /search, /contacts, etc.
 * Unauthenticated users → redirect to /login
 * Authenticated users on /login → redirect to /projects
 */

import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that do NOT require authentication
const PUBLIC_ROUTES = ["/login", "/signup", "/share", "/auth", "/waitlist"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Authenticated user on login/signup or root → redirect to /search
  if (user && (pathname === "/login" || pathname === "/signup" || pathname === "/")) {
    return NextResponse.redirect(new URL("/search", request.url));
  }

  // Unauthenticated user on protected route or root → redirect to /login
  if (!user && (!isPublicRoute(pathname) || pathname === "/")) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
