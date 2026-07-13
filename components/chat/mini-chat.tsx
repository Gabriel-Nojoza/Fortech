"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
  role: "user" | "assistant"
  content: string
}

export function MiniChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Olá! Eu sou a SIL, a inteligência analítica da FORTECH.\nPosso ajudar com perguntas sobre seus relatórios, indicadores, datasets e análises do Power BI.\nComo posso te ajudar hoje?",
        },
      ])
    }
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, messages.length])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: "user", content: text }]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido")

      setMessages((prev) => [...prev, { role: "assistant", content: data.message }])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Desculpe, ocorreu um erro: ${err instanceof Error ? err.message : "tente novamente."}`,
        },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Floating icon button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-6 right-6 z-50 p-0 border-none bg-transparent outline-none",
          "transition-transform duration-200 hover:scale-110 active:scale-95",
          isOpen && "scale-95"
        )}
        aria-label="Abrir assistente"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-chat.png"
          alt="Assistente IA"
          style={{ height: 64, width: "auto", display: "block", mixBlendMode: "multiply" }}
        />
      </button>

      {/* Chat panel — always white/light regardless of app theme */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 flex flex-col",
          "w-[340px] sm:w-[380px] h-[500px] max-h-[calc(100vh-120px)]",
          "rounded-2xl overflow-hidden",
          "transition-all duration-300 origin-bottom-right",
          isOpen
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-90 pointer-events-none"
        )}
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-4 shrink-0"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #0c4a6e 100%)" }}
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0 bg-white rounded-xl px-2 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logo-chat.png"
                alt="SIL"
                className="object-contain"
                style={{ height: 32, width: "auto", display: "block" }}
              />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">Assistente IA</p>
              <p className="text-white/70 text-[11px] leading-tight">SIL · Inteligência Analítica</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full p-1.5 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            aria-label="Fechar chat"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3 [&::-webkit-scrollbar]:hidden"
          style={{ background: "#f8fafc", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                  msg.role === "user"
                    ? "rounded-br-sm text-white"
                    : "rounded-bl-sm text-gray-800 border border-gray-100"
                )}
                style={
                  msg.role === "user"
                    ? { background: "linear-gradient(135deg, #0e7490, #0f766e)" }
                    : { background: "#ffffff" }
                }
              >
                <MarkdownText text={msg.content} />
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center">
                  <span className="size-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t bg-white px-3 py-3" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre seus dados..."
              rows={1}
              disabled={loading}
              className={cn(
                "flex-1 resize-none rounded-xl border px-3 py-2 text-sm text-gray-800",
                "placeholder:text-gray-400 focus:outline-none focus:ring-2",
                "max-h-24 overflow-y-auto disabled:opacity-60 bg-gray-50"
              )}
              style={{
                minHeight: "38px",
                borderColor: "#cbd5e1",
                "--tw-ring-color": "#0e7490",
              } as React.CSSProperties}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = Math.min(el.scrollHeight, 96) + "px"
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-xl p-2.5 text-white transition-all disabled:opacity-40 disabled:pointer-events-none hover:opacity-90 active:scale-95"
              style={{ background: "linear-gradient(135deg, #0e7490, #0f766e)" }}
              aria-label="Enviar mensagem"
            >
              <Send className="size-4" />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 text-center">
            Enter para enviar · Shift+Enter para nova linha
          </p>
        </div>
      </div>
    </>
  )
}

function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\n)/g)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={i}>{part.slice(1, -1)}</em>
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code key={i} className="bg-gray-100 rounded px-1 font-mono text-xs">
              {part.slice(1, -1)}
            </code>
          )
        if (part === "\n") return <br key={i} />
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
