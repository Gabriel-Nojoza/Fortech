"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, ChevronDown, ChevronRight } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type Props = {
  reports: { id: string; name: string }[]
}

export function SidebarReports({ reports }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(true)

  if (reports.length === 0) return null

  return (
    <SidebarGroup>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2 py-1 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
      >
        <span>Painéis</span>
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>

      {open && (
        <SidebarGroupContent>
          <SidebarMenu>
            {reports.map((report) => (
              <SidebarMenuItem key={report.id}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === `/reports/${report.id}`}
                  tooltip={report.name}
                >
                  <Link href={`/reports/${report.id}`}>
                    <LayoutDashboard className="size-4 shrink-0" />
                    <span className="truncate">{report.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
