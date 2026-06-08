import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://sara-ai-wf20.onrender.com";

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("sara_session")?.value;

  // No session → redirect to home
  if (!session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    // Call backend to verify user session
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: {
        Cookie: `sara_session=${session}`,
      },
      cache: "no-store",
    });

    // Invalid session → redirect
    if (!response.ok) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const user = await response.json();

    // Role-based access control
    if (!["admin", "super_admin"].includes(user.role)) {
      return NextResponse.redirect(new URL("/chat", request.url));
    }

    // Allow access
    return NextResponse.next();

  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.redirect(new URL("/", request.url));
  }
}

// Protect admin routes only
export const config = {
  matcher: ["/admin/:path*"],
};
