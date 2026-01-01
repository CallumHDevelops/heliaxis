import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;
  
  // Check if the request is coming from the subcontract subdomain
  const isSubcontractDomain = hostname.includes('subcontract.heliaxis.co.uk') || 
                               hostname.includes('subcontract.localhost'); // For local testing
  
  // If on subcontract domain
  if (isSubcontractDomain) {
    // Redirect /subcontractor-form to root (keeps URL clean)
    if (pathname === '/subcontractor-form') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      console.log(`↩️  Redirecting ${hostname}/subcontractor-form → /`);
      return NextResponse.redirect(url);
    }
    
    // Rewrite root to the subcontractor-form page
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/subcontractor-form';
      console.log(`🔄 Rewriting ${hostname}/ → /subcontractor-form`);
      return NextResponse.rewrite(url);
    }
  } else {
    // On main domain (heliaxis.co.uk) - BLOCK access to /subcontractor-form
    if (pathname === '/subcontractor-form') {
      console.log(`🚫 Blocking access to /subcontractor-form on ${hostname}`);
      
      // Redirect to main site with a message
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('message', 'form-access-denied');
      
      return NextResponse.redirect(url);
    }
  }
  
  // For all other requests, continue normally
  return NextResponse.next();
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (api/*)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|woff|woff2|ttf|otf)$).*)',
  ],
};

