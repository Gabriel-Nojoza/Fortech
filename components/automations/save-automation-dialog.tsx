"use client"

import { useEffect, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { Save, Loader2, Search, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { CronBuilder } from "@/components/schedules/cron-builder"
import { toast } from "sonner"
import type { Contact, WhatsAppBotInstance } from "@/lib/types"
import { isValidCronValue } from "@/lib/schedule-cron"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface EditingAutomation {
  id: string
  name: string
  cron_expression: string | null
  export_format: string
  message_template: string
  contact_ids: string[]
  bot_instance_id?: string | null
}

interface SaveAutomationDialogProps {
  botInstances: WhatsAppBotInstance[]
  onSave: (data: {
    name: string
    cron_expression: string | null
    export_format: string
    message_template: string
    contact_ids: string[]
    is_active: boolean
    bot_instance_id: string | null
  }) => Promise<void>
  disabled?: boolean
  editingAutomation?: EditingAutomation | null
  onCancelEdit?: () => void
}

export function SaveAutomationDialog({
  botInstances,
  onSave,
  disabled,
  editingAutomation,
  onCancelEdit,
}: SaveAutomationDialogProps) {
  const defaultMessage = "Segue os dados da automacao {name} em anexo."
  const defaultCron = "0 8 * * 1-5"
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [cron, setCron] = useState(defaultCron)
  const [enableSchedule, setEnableSchedule] = useState(false)
  const [exportFormat, setExportFormat] = useState("csv")
  const [message, setMessage] = useState(defaultMessage)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [contactSearch, setContactSearch] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [syncingContacts, setSyncingContacts] = useState(false)
  const [botInstanceId, setBotInstanceId] = useState<string>("")

  const defaultInstance = botInstances.find((i) => i.is_default) ?? botInstances[0]

  useEffect(() => {
    if (open && !botInstanceId && defaultInstance) {
      setBotInstanceId(defaultInstance.id)
    }
  }, [open, botInstanceId, defaultInstance])

  const contactsKey = botInstanceId ? `/api/contacts?bot_instance_id=${botInstanceId}` : "/api/contacts"
  const { data: rawContacts } = useSWR<Contact[]>(open ? contactsKey : null, fetcher)
  const allContacts: Contact[] = Array.isArray(rawContacts) ? rawContacts : []
  const activeContacts = allContacts.filter((c) => c.is_active)
  const filteredContacts = activeContacts.filter((c) => {
    const q = contactSearch.trim().toLowerCase()
    if (!q) return true
    return c.name?.toLowerCase().includes(q) || (c.phone ?? "").includes(q)
  })

  useEffect(() => {
    if (open && editingAutomation) {
      setName(editingAutomation.name)
      setExportFormat(editingAutomation.export_format || "csv")
      setMessage(editingAutomation.message_template || defaultMessage)
      setSelectedContacts(editingAutomation.contact_ids || [])
      if (editingAutomation.bot_instance_id) setBotInstanceId(editingAutomation.bot_instance_id)
      if (editingAutomation.cron_expression) {
        setEnableSchedule(true)
        setCron(editingAutomation.cron_expression)
      } else {
        setEnableSchedule(false)
        setCron(defaultCron)
      }
    }
  }, [open, editingAutomation])

  const resetForm = () => {
    setName("")
    setCron(defaultCron)
    setEnableSchedule(false)
    setExportFormat("csv")
    setMessage(defaultMessage)
    setSelectedContacts([])
    setContactSearch("")
    setIsActive(true)
    setBotInstanceId(defaultInstance?.id ?? "")
  }

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const handleSyncContacts = async () => {
    if (!botInstanceId) {
      toast.error("Selecione o WhatsApp antes de sincronizar.")
      return
    }
    setSyncingContacts(true)
    try {
      const res = await fetch("/api/contacts/sync-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_instance_id: botInstanceId }),
      })
      if (!res.ok) throw new Error()
      await globalMutate(contactsKey)
      toast.success("Contatos sincronizados!")
    } catch {
      toast.error("Erro ao sincronizar. Verifique se o WhatsApp esta conectado.")
    } finally {
      setSyncingContacts(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome para a automacao")
      return
    }
    if (enableSchedule && (!cron.trim() || !isValidCronValue(cron))) {
      toast.error("Defina uma frequencia valida para o agendamento")
      return
    }
    if (enableSchedule && activeContacts.length > 0 && selectedContacts.length === 0) {
      toast.error("Selecione ao menos 1 contato para o envio automatico")
      return
    }
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        cron_expression: enableSchedule ? cron.trim() : null,
        export_format: exportFormat,
        message_template: message,
        contact_ids: selectedContacts,
        is_active: isActive,
        bot_instance_id: botInstanceId || null,
      })
      setOpen(false)
      resetForm()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar automacao")
    } finally {
      setSaving(false)
    }
  }

  const isEditing = !!editingAutomation

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen && !saving) resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={disabled}>
          <Save className="size-3" />
          {isEditing ? "Editar Automacao" : "Salvar Automacao"}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEditing ? "Editar Automacao" : "Salvar Automacao"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize os dados da automacao selecionada."
              : "Salve esta query como automacao para executar sob demanda ou agendar."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2 pr-1">
          <div className="space-y-2">
            <Label htmlFor="auto-name">Nome da automacao</Label>
            <Input
              id="auto-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Vendas por regiao - Semanal"
            />
          </div>

          {botInstances.length > 0 && (
            <div className="space-y-2">
              <Label>WhatsApp de Envio</Label>
              <Select value={botInstanceId} onValueChange={(v) => { setBotInstanceId(v); setSelectedContacts([]) }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar WhatsApp" />
                </SelectTrigger>
                <SelectContent>
                  {botInstances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Formato de exportacao</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="table">Tabela (texto)</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <CronBuilder value={cron} onChange={setCron} />
            <div className="flex items-center gap-2 px-1 pt-1">
              <Switch
                id="enable-schedule"
                checked={enableSchedule}
                onCheckedChange={(checked) => {
                  setEnableSchedule(checked)
                  if (checked && !cron.trim()) setCron(defaultCron)
                }}
              />
              <Label htmlFor="enable-schedule" className="cursor-pointer text-sm">
                Agendar execucao automatica
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mensagem do disparo</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Use {name} para o nome da automacao"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Contatos ({selectedContacts.length} selecionado{selectedContacts.length !== 1 ? "s" : ""})
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={syncingContacts}
                onClick={handleSyncContacts}
              >
                <RefreshCw className={`size-3 ${syncingContacts ? "animate-spin" : ""}`} />
                Sincronizar do bot
              </Button>
            </div>
            {activeContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum contato ativo. Sincronize ou adicione na pagina de Contatos.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Pesquisar contato ou grupo..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {filteredContacts.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">Nenhum encontrado</p>
                  ) : (
                    filteredContacts.map((contact) => (
                      <label
                        key={contact.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedContacts.includes(contact.id)}
                          onCheckedChange={() => toggleContact(contact.id)}
                        />
                        <span className="truncate text-sm">{contact.name}</span>
                        {contact.type === "group" && (
                          <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">Grupo</Badge>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch id="auto-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="auto-active" className="cursor-pointer">Ativa</Label>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false)
              resetForm()
              if (isEditing) onCancelEdit?.()
            }}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEditing ? "Atualizar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
