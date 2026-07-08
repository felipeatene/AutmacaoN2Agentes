# Lino

**Lino** é o filtro N1 inteligente da sustentação de TI: intercepta chamados no ServiceNow, classifica,
enriquece e entrega à fila N2 um ticket já tratado — reduzindo MTTR e ruído operacional.

Integrações oficiais **Machine-to-Machine (M2M)**:

- **ServiceNow** — Table API REST com OAuth 2.0 ou Basic Auth (perfis READ/WRITE)
- **Microsoft Teams** — mensagens proativas via Bot Framework (`TEAMS_APP_ID` / `TEAMS_APP_PASSWORD`)

> Autenticação por sessão de navegador, scraping de cookies e emulação de SSO estão **proibidos**
> (diretriz de segurança corporativa). Ver [`.cursor/rules/security-auth.mdc`](.cursor/rules/security-auth.mdc).

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [`docs/lino/ESPECIFICACAO.md`](docs/lino/ESPECIFICACAO.md) | Identidade, capacidades, fluxo de decisão, memória, contratos |
| [`docs/lino/ARQUITETURA.md`](docs/lino/ARQUITETURA.md) | Mapeamento Lino → módulos em `src/` |
| [`docs/lino/GLOSSARIO.md`](docs/lino/GLOSSARIO.md) | Termos e definições |
| [`docs/lino/BACKLOG.md`](docs/lino/BACKLOG.md) | Épicos, histórias e proposta de pastas |
| [`docs/DEPLOY-AZURE-DEVOPS.md`](docs/DEPLOY-AZURE-DEVOPS.md) | Exportar para Azure DevOps e solicitar credenciais M2M |
| [`constitution.md`](constitution.md) | Regras imutáveis: Fail Fast, Idempotência, Human-in-the-Loop |
| [`spec.md`](spec.md) | Requisitos funcionais (speckit) |

---

## Pré-requisitos

- **Node.js** >= 18 LTS
- Credenciais M2M ServiceNow (READ + WRITE) com acesso a `incident`, `label`, `label_entry`, `sys_user_group`
- Bot registrado no Azure AD com permissão de mensagem proativa no Teams

## Instalação

```bash
npm install
cp .env.example .env
# Preencher .env com credenciais M2M (solicitar via Service Labs — ver docs/DEPLOY-AZURE-DEVOPS.md)
npm start
```

## Testes

```bash
npm test
```

## Variáveis de ambiente principais

| Grupo | Variáveis | Uso |
|-------|-----------|-----|
| ServiceNow READ | `SNOW_READ_*` ou legado `SNOW_CLIENT_ID` / `SNOW_USERNAME` | Polling e consultas |
| ServiceNow WRITE | `SNOW_WRITE_*` | `work_note`, tags (`label_entry`), roteamento |
| Teams | `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`, `TEAMS_TENANT_ID` | Contato proativo 1:1 |
| Agente | `POLL_INTERVAL_MS`, `LOG_LEVEL` | Ciclo de polling (padrão: 2 min) |

Lista completa em [`.env.example`](.env.example).

## Estrutura do projeto

```
├── docs/lino/           # Visão de produto do Lino
├── src/
│   ├── index.js         # Ciclo de polling
│   ├── orchestrator.js  # Decisão: SOP → classificar → contato proativo
│   ├── snow/            # Integração ServiceNow M2M
│   ├── teams/           # Bot Framework + Adaptive Cards
│   ├── sop/             # Execução de SOPs aprovados
│   └── utils/           # Config e logger
├── config/snow/         # Manifests, queries e endpoints
├── sops/                # SOPs aprovados (resolução automática)
├── .cursor/skills/      # Skills Cursor para operações N2
└── tests/
```

## Publicação atual

- **Git remoto:** `origin` → `https://github.com/felipeatene/AutmacaoN2Agentes.git`
- **CI/CD:** pipeline ainda não configurado neste repositório (ver `azure-pipelines.yml` e guia DevOps)

---

## Princípios operacionais

1. **Falha Rápida** — erros 401/403/rede suspendem o ciclo imediatamente
2. **Idempotência** — consultar estado antes de escrever; tags via `label_entry`; `execution_id` em toda `work_note`
3. **Human-in-the-Loop** — produção só via SOPs aprovados; sem SOP, classificar/rotear/pedir contexto
