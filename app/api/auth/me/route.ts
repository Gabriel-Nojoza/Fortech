import { NextResponse } from "next/server"
import { getRequestContext } from "@/lib/tenant"

export async function GET() {
  try {
    const context = await getRequestContext()
    return NextResponse.json({
      role: context.role,
      isAdmin: context.role === "admin",
      isPlatformAdmin: context.isPlatformAdmin,
      companyId: context.companyId,
    })
  } catch {
    return NextResponse.json({
      role: "client",
      isAdmin: false,
      isPlatformAdmin: false,
      companyId: null,
    })
  }
}
