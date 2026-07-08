# Plano Técnico — Automação Agentiva para Sustentação de Produtos de TI

> Gerado via `/speckit.plan`  
> Derivado de: `spec.md` v1.0.0 | `constitution.md`  
> **Regra**: Este documento não pode ser alterado sem atualização prévia de `spec.md` via `/speckit.clarify`.

---

## 1. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENTE PRINCIPAL                          │
│                         src/index.js                             │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────┐  │
│  │  Skill Loader   │    │  Polling Loop     │    │  Config    │  │
│  │ src/skillLoader │    │  (2 min ciclo)    │    │  Validator │  │
│  └────────┬────────┘    └────────┬─────────┘    └────────────┘  │
│           │                      │                               │
│  ┌────────▼──────────────────────▼──────────────────────────┐   │
│  │                    ORQUESTRADOR                           │   │
│  │                 src/orchestrator.js                       │   │
│  └──────┬──────────────┬───────────────────┬────────────────┘   │
│         │              │                   │                      │
│  ┌──────▼──────┐ ┌─────▼──────┐ ┌─────────▼────────┐           │
│  │  ServiceNow │ │   Teams    │ │   SOP Executor    │           │
│  │   Client    │ │   Client   │ │  src/sop/runner   │           │
│  │ src/snow/   │ │ src/teams/ │ └──────────────────┘           │
│  └─────────────┘ └────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológica

| Componente          | Tecnologia                           | Justificativa                                    |
|---------------------|--------------------------------------|--------------------------------------------------|
| Runtime             | Node.js ≥ 18 LTS                     | Suporte nativo a ESM, async/await, fetch API     |
| Bot Framework       | `botbuilder` ^4.x                    | SDK oficial Microsoft para Teams proativo        |
| YAML Parser         | `js-yaml` ^4.x                       | Parse de frontmatter em SKILL.md                 |
| HTTP Client         | Node.js `fetch` nativo               | Sem dependência extra; disponível no Node 18+    |
| Variáveis de Env    | `dotenv` ^16.x                       | Carregamento de `.env` em desenvolvimento        |
| Logger              | Módulo customizado `src/utils/logger`| Formato estruturado JSON, sem libs externas      |
| Testes              | Node.js `node:test` + `assert`       | Nativo, sem dependência extra                    |

---

## 3. Modelo de Dados

### 3.1 Ticket Processado (Objeto Interno)

```js
{
  sys_id: string,           // ID único ServiceNow
  number: string,           // Número INC0001234
  short_description: string,
  description: string,
  state: number,            // 1=New, 2=In Progress, 6=Resolved
  assigned_to: string|null,
  assignment_group: string|null,
  caller_id: {
    sys_id: string,
    aad_object_id: string   // Mapeado de u_aad_object_id
  },
  sys_updated_on: string,   // ISO-8601
  execution_id: string|null // Gerado pelo agente na primeira ação
}
```

### 3.2 Skill (YAML Frontmatter)

```yaml
name: string                # Identificador único
description: string         # Gatilho semântico (< 1024 chars)
version: string             # SemVer
requires:
  env: string[]             # Variáveis de ambiente obrigatórias
  bins: string[]            # Binários necessários no PATH
actions:
  - read                    # Ações permitidas: read | write | notify
  - write
```

### 3.3 SOP (Standard Operating Procedure)

```js
{
  id: string,               // Identificador único do SOP
  name: string,             // Nome legível
  triggers: string[],       // Palavras-chave que ativam o SOP
  category: string,         // Categoria do ticket
  steps: [
    {
      action: string,       // Tipo: "set_field" | "add_note" | "close"
      field: string,        // Campo alvo (se set_field)
      value: any            // Valor a definir
    }
  ],
  close_code: string        // Código de fechamento ServiceNow
}
```

---

## 4. Fluxo de Decisão do Agente

```
POLL ServiceNow
     │
     ▼
Para cada ticket:
     │
     ├── Verificar idempotência (já processado neste ciclo?)
     │        └── Sim → Skip
     │
     ├── Buscar SOP correspondente
     │        ├── Encontrado → Executar SOP (RF-02)
     │        │
     │        └── Não encontrado →
     │                 ├── Classificar + Rotear (RF-03)
     │                 │
     │                 └── Informações insuficientes?
     │                          ├── Sim → Enviar Adaptive Card Teams (RF-04)
     │                          │           └── Falha Teams → Fallback work_notes (RF-05)
     │                          └── Não → Human-in-the-Loop (RF-06)
```

---

## 5. Integração ServiceNow

### 5.1 Autenticação

- **Modo produção**: OAuth 2.0 (Client Credentials Flow) com `SNOW_CLIENT_ID` + `SNOW_CLIENT_SECRET`.
- **Modo fallback**: Basic Auth com `SNOW_USERNAME` + `SNOW_PASSWORD` (se OAuth indisponível).
- Token OAuth armazenado em memória com renovação automática antes da expiração.

### 5.2 Query de Polling Otimizada

```
GET /api/now/table/incident
  ?sysparm_query=active%3Dtrue%5Eassigned_to%3DEMPTY%5Esys_updated_on%3Ejavascript%3Ags.minutesAgo(2)
  &sysparm_fields=sys_id,number,short_description,description,state,caller_id,assignment_group,sys_updated_on
  &sysparm_limit=50
  &sysparm_display_value=false
```

### 5.3 Aplicação de Tags (label_entry)

**NÃO usar**: `PATCH /api/now/table/incident/{sys_id}` com `sys_tags` (falha silenciosa em campo M:N derivado).

**Usar**:
1. `GET /api/now/table/label` — buscar `sys_id` da label pelo nome.
2. `GET /api/now/table/label_entry?sysparm_query=table=incident^table_key={incident_sys_id}^label={label_sys_id}` — verificar se já existe.
3. Se não existir: `POST /api/now/table/label_entry` com `{ table: "incident", table_key: incident_sys_id, label: label_sys_id }`.

---

## 6. Integração Microsoft Teams

### 6.1 Mensagem Proativa

```js
// Criar referência de conversa 1:1
const conversationRef = {
  bot: { id: BOT_APP_ID, name: "N2 Agent" },
  user: { id: userAadObjectId, aadObjectId: userAadObjectId },
  channelId: "msteams",
  serviceUrl: TEAMS_SERVICE_URL
};

// Iniciar conversa via Bot Framework
adapter.createConversation(conversationRef, async (context) => {
  await context.sendActivity({ attachments: [adaptiveCard] });
});
```

### 6.2 Adaptive Card (Action.Execute)

```json
{
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [...],
  "actions": [
    {
      "type": "Action.Execute",
      "title": "Enviar",
      "verb": "submitContext",
      "data": { "incidentSysId": "{{sys_id}}" }
    }
  ]
}
```

**Razão**: `Action.Execute` (Universal Actions) suporta resposta síncrona e atualização do card, ao contrário do descontinuado `Action.Submit`.

---

## 7. Estrutura de Diretórios

```
lino/
├── constitution.md          # Regras imutáveis do sistema
├── spec.md                  # Requisitos e critérios de aceitação
├── plan.md                  # Este arquivo: arquitetura técnica
├── tasks.md                 # WBS de tarefas atômicas
├── package.json             # Dependências Node.js
├── .env.example             # Template de variáveis de ambiente
├── .gitignore               # Exclusões de versionamento
├── src/
│   ├── index.js             # Ponto de entrada principal
│   ├── orchestrator.js      # Orquestrador de decisões
│   ├── skillLoader.js       # Carregador e validador de skills
│   ├── snow/
│   │   ├── client.js        # Cliente HTTP ServiceNow
│   │   ├── incidents.js     # Operações de incidentes
│   │   └── tags.js          # Gerenciamento de tags via label_entry
│   ├── teams/
│   │   ├── client.js        # Cliente Bot Framework Teams
│   │   ├── adaptiveCards.js # Templates de Adaptive Cards
│   │   └── proactive.js     # Envio proativo de mensagens
│   ├── sop/
│   │   └── runner.js        # Executor de SOPs
│   └── utils/
│       ├── config.js        # Validação de configuração
│       └── logger.js        # Logger estruturado
├── skills/
│   ├── snow-poll-incidents.md    # SKILL: Polling de incidentes
│   ├── snow-resolve-incident.md  # SKILL: Resolução via SOP
│   ├── snow-classify-route.md    # SKILL: Classificação e roteamento
│   ├── snow-apply-tag.md         # SKILL: Aplicação de tags
│   ├── teams-proactive-message.md# SKILL: Mensagem proativa Teams
│   └── teams-fallback-worknotes.md # SKILL: Fallback work_notes
├── sops/
│   ├── password-reset.json       # SOP: Reset de senha
│   ├── vpn-connectivity.json     # SOP: Problemas de VPN
│   └── software-install.json     # SOP: Instalação de software
└── tests/
    ├── skillLoader.test.js
    ├── snow-client.test.js
    └── orchestrator.test.js
```

---

## 8. Decisões de Design Críticas

| Decisão                               | Alternativa Rejeitada           | Justificativa                                                    |
|---------------------------------------|---------------------------------|------------------------------------------------------------------|
| `label_entry` para tags               | `sys_tags` via PATCH            | `sys_tags` é campo M:N derivado; falha silenciosamente           |
| `Action.Execute` no Adaptive Card     | `Action.Submit`                 | `Action.Submit` está descontinuado; sem suporte a resposta sync  |
| Polling a cada 2 min com query cirúrgica | Webhook ServiceNow           | Webhooks requerem endpoint público; polling é mais simples/seguro|
| Fail-fast sem retry em erros 4xx      | Retry genérico                  | Erros 4xx são determinísticos; retry desperdiça rate limit quota  |
| Skills em SKILL.md com YAML frontmatter | Prompts soltos em variáveis  | Validação estruturada, separação leitura/escrita, auditável       |
