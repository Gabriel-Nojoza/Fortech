"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import fortechCover from "@/Fortech.png"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  Eye,
  EyeOff,
  User,
  Shield,
} from "lucide-react"
import { BrandMark } from "@/components/branding/brand-mark"
import { cn } from "@/lib/utils"
import { markTabSessionActive } from "@/lib/supabase/tab-session"

type LoginType = "client" | "admin"

export default function LoginPage() {
  const [loginType, setLoginType] = useState<LoginType>("client")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const blockCtrlZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault()
    }
    window.addEventListener("wheel", blockCtrlZoom, { passive: false })
    return () => window.removeEventListener("wheel", blockCtrlZoom)
  }, [])

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedPassword = password.trim()

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      })

      if (error) {
        if (
          error.message.includes("Invalid login credentials") ||
          error.status === 400
        ) {
          throw new Error("Email ou senha incorretos")
        }
        throw error
      }

      const userRole =
        data.user?.app_metadata?.role || data.user?.user_metadata?.role || "client"

      if (loginType === "admin" && userRole !== "admin") {
        await supabase.auth.signOut()
        throw new Error("Voce nao tem permissao de administrador")
      }

      markTabSessionActive()

      if (loginType === "admin") {
        router.push("/admin")
      } else {
        router.push("/")
      }

      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao entrar")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-slate-950">
      <div className="absolute inset-0 z-0">
        <Image
          src={fortechCover}
          alt=""
          fill
          className="scale-[1.02] object-cover object-center opacity-60"
          priority
          placeholder="blur"
          quality={92}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.34),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.16),transparent_24%),linear-gradient(110deg,rgba(2,6,23,0.98)_0%,rgba(2,6,23,0.95)_30%,rgba(2,6,23,0.8)_58%,rgba(2,6,23,0.58)_100%)]" />
        <div className="absolute left-[-5rem] top-[-5rem] h-56 w-56 rounded-full bg-primary/25 blur-3xl sm:h-72 sm:w-72" />
        <div className="absolute bottom-[-6rem] right-[8%] h-56 w-56 rounded-full bg-sky-400/[0.15] blur-3xl sm:h-80 sm:w-80" />
      </div>

      <div className="fixed inset-0 z-10 flex items-center overflow-y-auto px-5 py-6 sm:px-8 md:px-10 lg:px-14 xl:px-16">
        <div className="w-full max-w-[390px]">
            <div className="mb-5">
              <BrandMark
                subtitle=""
                logoSrc="/brand/fortech-f-transparent.png"
                imageSize={34}
                className="gap-2.5"
                textClassName="text-lg text-white"
              />
            </div>

            <div className="rounded-[22px] border border-white/[0.12] bg-slate-950/[0.72] p-4 shadow-[0_30px_90px_rgba(2,6,23,0.45)] backdrop-blur-2xl sm:p-5">
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setLoginType("client")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-200 transition-all",
                    loginType === "client"
                      ? "border-primary/70 bg-primary/[0.18] text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)]"
                      : "border-white/10 bg-white/5 text-slate-400 hover:border-primary/40 hover:text-white"
                  )}
                >
                  <User className="size-4" />
                  Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setLoginType("admin")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-200 transition-all",
                    loginType === "admin"
                      ? "border-primary/70 bg-primary/[0.18] text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)]"
                      : "border-white/10 bg-white/5 text-slate-400 hover:border-primary/40 hover:text-white"
                  )}
                >
                  <Shield className="size-4" />
                  Admin
                </button>
              </div>

              <div className="mb-4">
                <h2 className="text-base font-semibold text-white sm:text-lg">
                  {loginType === "admin" ? "Acesso Administrativo" : "Entrar na sua conta"}
                </h2>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-slate-200">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 border-white/10 bg-slate-900/70 text-white placeholder:text-slate-500"
                    autoComplete="email"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-200">
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Sua senha"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9 border-white/10 bg-slate-900/70 pr-10 text-white placeholder:text-slate-500"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-white"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-destructive/[0.30] bg-destructive/[0.12] px-3 py-2 text-sm text-red-200">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="h-9 w-full bg-primary text-sm font-medium text-primary-foreground shadow-[0_18px_35px_rgba(37,99,235,0.35)] hover:bg-primary/90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Entrando...
                    </>
                  ) : loginType === "admin" ? (
                    <>
                      <Shield className="mr-2 size-4" />
                      Entrar como Admin
                    </>
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>

            </div>
        </div>
      </div>
    </div>
  )
}
