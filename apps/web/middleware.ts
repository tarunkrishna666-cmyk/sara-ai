import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://sara-ai-wf20.onrender.com";

export async function middleware(request: NextRequest) {
  // 1. Check for the session token in the cookies
  const sessionToken = request.cookies.get("sara_session")?.value;

  // No session token -> immediately redirect to landing page
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    // 2. Call your FastAPI backend to verify the session
    // We send a standard GET request with the Authorization Bearer header
    const response = await fetch(`${API_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    // If backend rejects the token (401, 400, etc.), redirect to home
    if (!response.ok) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const user = await response.json();

    // 3. Role-Based Access Control
    // If the user is not an admin, redirect them to the user chat screen
    if (!user || !["admin", "super_admin"].includes(user?.role)) {
      return NextResponse.redirect(new URL("/chat", request.url));
    }

    // Access granted! Proceed to the requested admin page.
    return NextResponse.next();

  } catch (error) {
    console.error("Middleware verification network error:", error);
    // On unexpected network/server crash, fail-safe by redirecting to home
    return NextResponse.redirect(new URL("/", request.url));
  }
}

// Strictly run this middleware ONLY on admin routes
export const config = {
  matcher: ["/admin/:path*"],
};
