const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
const PAGE_SIZE = 20
const PAGE_TOKEN_DELAY_MS = 1500
const MAX_PAGES = 3 // 3 x 20 = 60, teto da Places API para Text Search

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "nextPageToken",
].join(",")

const SOCIAL_ONLY_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "wa.me",
  "whatsapp.com",
  "linktr.ee",
  "bio.link",
  "ifood.com.br",
  "anota.ai",
]

export type LeadClassification = "SEM SITE" | "SO REDE SOCIAL" | "TEM SITE"

export type GooglePlaceLead = {
  id: string
  nome: string
  classificacao: LeadClassification
  site: string | null
  telefone: string | null
  endereco: string | null
  avaliacao: number | null
  num_avaliacoes: number | null
  link_maps: string | null
}

type GooglePlaceRaw = {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  rating?: number
  userRatingCount?: number
  businessStatus?: string
}

type GooglePlacesSearchResponse = {
  places?: GooglePlaceRaw[]
  nextPageToken?: string
}

export class GooglePlacesApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "GooglePlacesApiError"
    this.status = status
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function classifyWebsite(websiteUri: string | null | undefined): LeadClassification {
  const trimmed = websiteUri?.trim()
  if (!trimmed) return "SEM SITE"

  let hostname = ""
  try {
    hostname = new URL(trimmed).hostname.toLowerCase()
  } catch {
    hostname = trimmed.toLowerCase()
  }

  const isSocialOnly = SOCIAL_ONLY_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  )

  return isSocialOnly ? "SO REDE SOCIAL" : "TEM SITE"
}

const CLASSIFICATION_PRIORITY: Record<LeadClassification, number> = {
  "SEM SITE": 0,
  "SO REDE SOCIAL": 1,
  "TEM SITE": 2,
}

export function sortLeadsByClassification<T extends { classificacao: LeadClassification }>(
  leads: T[]
): T[] {
  return [...leads].sort(
    (a, b) => CLASSIFICATION_PRIORITY[a.classificacao] - CLASSIFICATION_PRIORITY[b.classificacao]
  )
}

function mapPlaceToLead(place: GooglePlaceRaw): GooglePlaceLead {
  return {
    id: place.id,
    nome: place.displayName?.text?.trim() || "(sem nome)",
    classificacao: classifyWebsite(place.websiteUri),
    site: place.websiteUri?.trim() || null,
    telefone: place.nationalPhoneNumber?.trim() || null,
    endereco: place.formattedAddress?.trim() || null,
    avaliacao: typeof place.rating === "number" ? place.rating : null,
    num_avaliacoes: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    link_maps: place.googleMapsUri?.trim() || null,
  }
}

async function fetchPlacesPage(
  apiKey: string,
  textQuery: string,
  pageToken?: string
): Promise<GooglePlacesSearchResponse> {
  const response = await fetch(PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    }),
  })

  if (!response.ok) {
    const raw = await response.text().catch(() => "")
    let message = raw
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } }
      message = parsed?.error?.message || raw
    } catch {
      // raw ja e a melhor mensagem disponivel
    }

    throw new GooglePlacesApiError(
      response.status,
      message?.trim() || `Google Places API retornou ${response.status}`
    )
  }

  return response.json()
}

export async function searchGooglePlacesLeads(input: {
  nicho: string
  cidade: string
  max: number
}): Promise<GooglePlaceLead[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) {
    throw new GooglePlacesApiError(
      500,
      "GOOGLE_MAPS_API_KEY nao configurada no servidor."
    )
  }

  const textQuery = `${input.nicho} em ${input.cidade}`
  const results: GooglePlaceLead[] = []
  let pageToken: string | undefined
  let page = 0

  do {
    const data = await fetchPlacesPage(apiKey, textQuery, pageToken)
    const places = data.places ?? []

    for (const place of places) {
      if (results.length >= input.max) break
      results.push(mapPlaceToLead(place))
    }

    pageToken = data.nextPageToken
    page++

    if (pageToken && results.length < input.max && page < MAX_PAGES) {
      // O nextPageToken da Places API (New) so fica valido apos um pequeno atraso.
      await sleep(PAGE_TOKEN_DELAY_MS)
    } else {
      pageToken = undefined
    }
  } while (pageToken && results.length < input.max)

  return sortLeadsByClassification(results)
}
