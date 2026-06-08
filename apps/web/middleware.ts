import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("sara_session")?.value;
  if (!session) return NextResponse.redirect(new URL("/", request.url));

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
      console.error("NEXT_PUBLIC_API_URL is missing");
      return NextResponse.redirect(new URL("/", request.url));
    }

    const response = await fetch(`${apiUrl}/api/auth/me`, {
      headers: { Cookie: `sara_session=${session}` },
      cache: "no-store",
    });

    if (!response.ok) return NextResponse.redirect(new URL("/", request.url));

    const user = await response.json();

    if (!["admin", "super_admin"].includes(user.role)) {
      return NextResponse.redirect(new URL("/chat", request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
