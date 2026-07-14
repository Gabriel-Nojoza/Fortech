# `GET /api/bot/context`

Endpoint único que devolve toda a configuração do Bot WhatsApp de uma empresa, para o fluxo master do n8n consumir em **uma única chamada HTTP**. O n8n nunca consulta o banco de dados diretamente — toda leitura fica na API da plataforma.

## Autenticação e identificação da empresa

O endpoint aceita duas formas de autenticação, resolvidas em `lib/n8n-auth.ts` (`resolveRequestCompanyContext`):

### 1. Callback Secret por empresa (uso normal)

```
GET /api/bot/context
x-callback-secret: <callback_secret da empresa>
```

O secret é comparado contra o `callback_secret` salvo em `company_settings` (chave `n8n`) de cada empresa. Quem bater, define a empresa. Cada empresa deve ter um secret **único** (ver aviso de segurança abaixo).

O secret pode vir por:
- Header `x-callback-secret: <secret>`
- Header `Authorization: Bearer <secret>`
- Query param `?secret=<secret>`

### 2. Secret da plataforma + identificação por sessão do WhatsApp (uso do fluxo master)

Como o fluxo master do n8n é **um só para todas as empresas**, ele não sabe de antemão qual `callback_secret` usar antes de saber de qual empresa é a mensagem. Para esse caso:

```
GET /api/bot/context?session=empresa_c94580a94d09435292357f5ba062af3c
x-callback-secret: <PLATFORM_SCHEDULER_SECRET>
```

Quando o secret enviado é igual ao `PLATFORM_SCHEDULER_SECRET` (variável de ambiente do servidor), a plataforma identifica a empresa pelo **nome da sessão do WAHA** — o mesmo valor que a WAHA já manda no payload do webhook de mensagem recebida (campo `session`). A plataforma consulta a tabela `waha_sessions` (`session_name` → `company_id`) e resolve a empresa automaticamente.

O nome da sessão pode vir por:
- Body JSON: `{ "session": "empresa_xxx" }` ou `{ "session_name": "empresa_xxx" }`
- Query param: `?session=empresa_xxx` ou `?session_name=empresa_xxx`

Isso é o mesmo mecanismo já usado por `/api/dispatch`, `/api/bot/send` e `/api/webhook/n8n-callback` (não foi criado nada novo em termos de padrão de autenticação, só estendido para reconhecer sessão do WAHA).

⚠️ **Importante**: cada empresa precisa ter um `callback_secret` diferente. Se duas empresas usarem o mesmo valor, a busca retorna a primeira que bater, misturando empresas.

## Resposta (200)

```json
{
  "version": 1,
  "generated_at": "2026-07-13T21:40:00.000Z",
  "company_id": "c94580a9-4d09-4352-9235-7f5ba062af3c",
  "module_enabled": true,
  "is_enabled": true,
  "welcome_message": "Olá {{nome}}\n\nBem-vindo à empresa.\nEscolha uma opção.\n\n1️⃣ Comercial\n2️⃣ Financeiro\n3️⃣ Suporte\n4️⃣ Falar com atendente",
  "business_hours": {
    "is_open_now": true,
    "today": "monday",
    "closed_message": "No momento estamos fora do horário de atendimento...",
    "hours": {
      "monday": { "enabled": true, "open": "08:00", "close": "18:00" },
      "tuesday": { "enabled": true, "open": "08:00", "close": "18:00" },
      "wednesday": { "enabled": true, "open": "08:00", "close": "18:00" },
      "thursday": { "enabled": true, "open": "08:00", "close": "18:00" },
      "friday": { "enabled": true, "open": "08:00", "close": "18:00" },
      "saturday": { "enabled": false, "open": "08:00", "close": "18:00" },
      "sunday": { "enabled": false, "open": "08:00", "close": "18:00" }
    }
  },
  "ai": {
    "provider": "openai",
    "api_key": "sk-...",
    "model": "gpt-4o-mini",
    "system_prompt": "Você é um assistente de atendimento da empresa...",
    "temperature": 0.7,
    "max_tokens": 512
  },
  "agents": {
    "distribution": "round_robin",
    "list": [
      {
        "id": "uuid",
        "company_id": "uuid",
        "name": "João",
        "phone": "5511999999999",
        "department": "Comercial",
        "priority": 1,
        "is_active": true,
        "created_at": "...",
        "updated_at": "..."
      }
    ]
  },
  "keywords": [
    { "id": "uuid", "company_id": "uuid", "trigger": "preco", "response": "Tabela de preços: ...", "is_active": true }
  ],
  "quick_replies": [
    {
      "id": "uuid",
      "name": "Boas-vindas",
      "message": "Olá! Como posso ajudar?",
      "buttons": ["Sim", "Não"],
      "list_items": [],
      "file_url": null,
      "image_url": null,
      "audio_url": null,
      "video_url": null,
      "is_active": true
    }
  ],
  "transfer_targets": [
    { "id": "uuid", "name": "Suporte Nível 2", "type": "department", "target_value": "Suporte", "is_active": true }
  ],
  "products": [
    { "id": "uuid", "name": "Produto X", "price": 99.9, "description": "...", "category": "...", "stock": 10, "image_url": null, "is_active": true }
  ]
}
```

### Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `version` | number | Versão do formato do payload. Incrementa só quando há mudança que quebra compatibilidade (campo removido/renomeado). Adição de campo novo **não** exige incrementar. |
| `generated_at` | string (ISO) | Momento em que esse snapshot foi montado. |
| `company_id` | string (uuid) | Empresa identificada. |
| `module_enabled` | boolean | Se o módulo Bot WhatsApp está habilitado para essa empresa (toggle do admin). Se `false`, o fluxo master deve encerrar sem processar. |
| `is_enabled` | boolean | Se o bot está ligado (toggle em Configurações do bot, dentro do módulo). Se `false`, só encaminhar para atendente humano. |
| `welcome_message` | string | Mensagem inicial configurada. |
| `business_hours.is_open_now` | boolean | Já calculado no servidor (fuso horário da empresa). O n8n não precisa calcular data/hora. |
| `business_hours.today` | string | Dia da semana atual (`monday`...`sunday`), no fuso da empresa. |
| `business_hours.closed_message` | string | Mensagem a enviar quando `is_open_now` for `false`. |
| `business_hours.hours` | object | Horário configurado para cada dia da semana. |
| `ai` | object | Configuração de IA (`provider`: `none`\|`openai`\|`gemini`\|`ollama`\|`claude`). Se `provider` for `"none"`, IA está desativada. |
| `agents.distribution` | string | Estratégia de distribuição de atendentes (`round_robin`\|`random`\|`least_queue`). |
| `agents.list` | array | Atendentes ativos, ordenados por prioridade. |
| `keywords` | array | Palavras-chave/gatilhos ativos. |
| `quick_replies` | array | Respostas rápidas ativas. |
| `transfer_targets` | array | Destinos de transferência ativos. |
| `products` | array | Catálogo de produtos ativos. |

### Erros

| Status | Quando |
|---|---|
| 401 | `{"error": "Callback secret invalido"}` — secret ausente/errado, ou sessão informada não encontrada. |
| 500 | `{"error": "..."}` — falha inesperada (ex.: erro de banco). |

## Uso no n8n (fluxo master)

Um único node **HTTP Request** logo após o Webhook que recebe o evento do WAHA:

- Method: `GET`
- URL: `https://seu-app.com/api/bot/context`
- Query Params: `session` = `{{$json.session}}` (campo que a WAHA já manda no payload do webhook)
- Header: `x-callback-secret` = o `PLATFORM_SCHEDULER_SECRET` configurado no servidor

A resposta alimenta os nodes seguintes (Switch por `module_enabled`/`is_enabled`/`business_hours.is_open_now`, IA usando `ai.*`, resposta usando `keywords`/`quick_replies`, etc.) sem nenhuma outra consulta ao banco.
