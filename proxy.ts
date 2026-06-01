import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

// In-memory rate limiting (single-server; resets on restart)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string, isAuthApiRoute: boolean): boolean {
  const max = isAuthApiRoute ? 20 : 300
  const windowMs = isAuthApiRoute ? 15 * 60 * 1000 : 60 * 1000
  const key = `${ip}:${isAuthApiRoute ? "auth" : "api"}`
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  if (entry.count >= max) return true

  entry.count++
  return false
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith("/api")
  const isNextRoute = pathname.startsWith("/_next")
  const isPublicFile =
    pathname === "/favicon.ico" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".gif") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".map")

  if (isNextRoute || isPublicFile) {
    return NextResponse.next()
  }

  // Rate limiting apenas em rotas de API
  if (isApiRoute) {
    const ip = getClientIp(request)
    const isAuthApiRoute = pathname.startsWith("/api/auth")
    if (isRateLimited(ip, isAuthApiRoute)) {
      return NextResponse.json(
        { error: "Muitas requisições. Tente novamente em alguns instantes." },
        { status: 429 }
      )
    }
  }

  if (isApiRoute) {
    return NextResponse.next()
  }

  return updateSession(request)
}

export const config = {
  matcher: ["/:path*"],
}
