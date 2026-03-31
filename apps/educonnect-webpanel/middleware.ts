import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Middleware — server-side auth guard.
 *
 * Checks for the `educonnect-auth` cookie (set by Zustand persist) to determine
 * if the user is authenticated. Redirects unauthenticated users to /login.
 *
 * This is a defense-in-depth layer on top of the client-side RouteGuard.
 * The actual token verification happens on the backend for every API call.
 */

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/forgot-password', '/pricing', '/test-login', '/test-bare'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

// Static assets & API routes that should always pass through
function isAssetOrApi(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')  // static files like .css, .js, .png
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets & API routes
  if (isAssetOrApi(pathname)) {
    return NextResponse.next();
  }

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Check for auth cookie (Zustand persists as "educonnect-auth" in localStorage,
  // but Next.js middleware can't read localStorage. We check for the Firebase
  // auth session cookie instead.)
  // Strategy: Check for the __session cookie or the presence of a token cookie
  const authCookie =
    request.cookies.get('__session') ??
    request.cookies.get('educonnect-token');

  if (!authCookie?.value) {
    // No auth cookie — redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
