import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getWhatsAppProviderLabel,
  type WhatsAppProvider,
} from "@/lib/whatsapp-provider"

type ProviderModeCardProps = {
  activeProvider: WhatsAppProvider
  requiredProvider: WhatsAppProvider
  description: string
}

export function ProviderModeCard({
  activeProvider,
  requiredProvider,
  description,
}: ProviderModeCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Canal indisponivel neste cliente</span>
          <Badge variant="secondary">{getWhatsAppProviderLabel(activeProvider)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{description}</p>
        <p>
          Esta empresa esta usando <strong>{getWhatsAppProviderLabel(activeProvider)}</strong>.
          Para liberar esta tela, o administrador precisa trocar o canal para{" "}
          <strong>{getWhatsAppProviderLabel(requiredProvider)}</strong> no cadastro da empresa.
        </p>
      </CardContent>
    </Card>
  )
}
