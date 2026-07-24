import type { LeadClassification } from "@/lib/google-places"

export const LEAD_STATUSES = [
  "Novo",
  "Contatado",
  "Interessado",
  "Sem interesse",
  "Fechado",
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export type LeadListItem = {
  id: string
  nome: string
  classificacao: LeadClassification
  site: string | null
  telefone: string | null
  endereco: string | null
  avaliacao: number | null
  num_avaliacoes: number | null
  link_maps: string | null
  status: string
  nicho: string
  cidade: string
  created_at: string
}

export type LeadMessageTemplate = {
  id: string
  label: string
  content: string
}

// {nome} e substituido pelo nome do lead na hora de aplicar o modelo.
export const LEAD_MESSAGE_TEMPLATES: Record<LeadClassification, LeadMessageTemplate[]> = {
  "SEM SITE": [
    {
      id: "sem-site-direto",
      label: "Direto ao ponto",
      content:
        "Ola! Vi que a {nome} ainda nao tem um site e isso pode estar limitando a chegada de novos clientes. Ajudamos empresas a terem presenca digital e automacao no WhatsApp. Podemos conversar?",
    },
    {
      id: "sem-site-concorrencia",
      label: "Foco na concorrencia",
      content:
        "Oi! Percebi que a {nome} ainda nao tem site. Isso pode fazer clientes procurarem primeiro a concorrencia que aparece no Google. Posso te mostrar em poucos minutos como resolver isso?",
    },
    {
      id: "sem-site-curto",
      label: "Curto e casual",
      content:
        "Ola! Trabalho ajudando negocios como a {nome} a terem presenca online e atendimento automatizado no WhatsApp. Topa bater um papo rapido?",
    },
  ],
  "SO REDE SOCIAL": [
    {
      id: "rede-social-padrao",
      label: "Padrao",
      content:
        "Ola! Vi o perfil da {nome} nas redes sociais. Alem das redes, um site proprio ajuda a passar mais confianca e trazer novos clientes. Podemos conversar sobre isso?",
    },
    {
      id: "rede-social-credibilidade",
      label: "Foco em credibilidade",
      content:
        "Oi! Achei o perfil da {nome} nas redes sociais. Muitos clientes pesquisam no Google antes de comprar, e um site ajuda a passar mais credibilidade nesse momento. Posso te mostrar um exemplo?",
    },
  ],
  "TEM SITE": [
    {
      id: "tem-site-padrao",
      label: "Padrao",
      content:
        "Ola! Vi o site da {nome} e gostaria de apresentar como podemos ajudar a automatizar o atendimento e os relatorios da empresa pelo WhatsApp. Podemos conversar?",
    },
    {
      id: "tem-site-automacao",
      label: "Foco em automacao",
      content:
        "Oi! Conheci a {nome} pelo site de voces. Trabalho com automacao de atendimento e relatorios via WhatsApp, posso mostrar rapidinho como isso pode economizar tempo da equipe?",
    },
  ],
}

export const GENERIC_LEAD_MESSAGE_TEMPLATES: LeadMessageTemplate[] = [
  {
    id: "generico-apresentacao",
    label: "Apresentacao geral",
    content:
      "Ola! Tudo bem? Gostaria de apresentar uma solucao que pode ajudar a {nome} a automatizar o atendimento e os relatorios pelo WhatsApp.",
  },
  {
    id: "generico-curto",
    label: "Curto e generico",
    content:
      "Oi! Vi a {nome} por aqui e queria bater um papo rapido sobre uma solucao de automacao para WhatsApp que pode ajudar o negocio de voces. Topa?",
  },
]

export function applyLeadMessageTemplate(content: string, nome: string) {
  return content.replaceAll("{nome}", nome)
}
