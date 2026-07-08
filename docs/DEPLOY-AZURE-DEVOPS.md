# Deploy e exportação — Lino no Azure DevOps

Guia passo a passo para publicar o repositório no Azure DevOps, configurar CI e solicitar credenciais
M2M junto às equipes de governança (Service Labs, Operações de Cloud).

---

## 1. Estado atual do repositório

| Item | Valor |
|------|-------|
| Remoto Git atual | `https://github.com/felipeatene/AutmacaoN2Agentes.git` |
| CI/CD configurado | Não (skeleton em `azure-pipelines.yml` na raiz) |
| Nome do produto | **Lino** (`package.json`: `@localiza/lino`) |
| Pasta física local | `AutmacaoN2Agentes` (renomear no disco é opcional) |

---

## 2. Exportar para Azure DevOps

### 2.1 Criar o projeto e repositório

1. Acesse o Azure DevOps da organização (ex.: `https://dev.azure.com/<org>`).
2. Crie um **projeto** (sugestão: `Lino` ou `Sustentacao-TI`).
3. Em **Repos → Import repository**, importe do GitHub:
   - URL: `https://github.com/felipeatene/AutmacaoN2Agentes.git`
   - Autentique com PAT ou credencial autorizada.
4. Alternativa: espelhar com `git push` após adicionar o remote DevOps:

```bash
git remote add azure https://dev.azure.com/<org>/<projeto>/_git/lino
git push azure main
```

> Não altere o remote `origin` existente sem alinhamento com o time. O espelhamento pode manter
> GitHub e DevOps em paralelo.

### 2.2 Verificar `.gitignore`

Antes do primeiro push, confirme que **não** serão versionados:

- `.env`, `.env.local`, `.env.*.local`
- `.snow_n2/` (cache de sessão legado)
- `node_modules/`
- Coleções Postman com credenciais

O `.gitignore` na raiz já cobre esses itens.

### 2.3 Habilitar pipeline

1. Em **Pipelines → New pipeline**, selecione o repositório `lino`.
2. Escolha **Existing Azure Pipelines YAML file**.
3. Selecione `/azure-pipelines.yml` na branch `main`.
4. Salve e execute. O pipeline roda `npm ci` + `npm test` em PRs e pushes na `main`.

### 2.4 Variáveis secretas no DevOps

**Nunca** commitar credenciais. Configure em **Pipelines → Library → Variable groups** ou
**Pipeline variables** (marcadas como secret):

| Variável | Uso |
|----------|-----|
| `SNOW_READ_CLIENT_ID` / `SNOW_READ_CLIENT_SECRET` | Polling (se testes de integração no CI) |
| `SNOW_WRITE_CLIENT_ID` / `SNOW_WRITE_CLIENT_SECRET` | Escrita (somente em pipeline de deploy) |
| `TEAMS_APP_ID` / `TEAMS_APP_PASSWORD` | Bot Framework |

Para o CI inicial, apenas `npm test` (testes unitários com mocks) — **sem** credenciais reais.

---

## 3. Solicitar credenciais M2M

### 3.1 ServiceNow (READ + WRITE)

**Quem solicitar:** Service Labs + administrador ServiceNow (instância `ibmlocaliza`).

**O que pedir:**

| Perfil | Escopo | Tabelas / operações |
|--------|--------|---------------------|
| **READ** | Polling e consultas | `incident` (GET), `sys_user_group`, `sys_user` |
| **WRITE** | Enriquecimento N1 | `incident` (PATCH: `work_notes`, `assignment_group`, `state`), `label`, `label_entry` (POST) |

**Modos de autenticação aceitos:**

- OAuth 2.0 (Client ID + Client Secret) — preferencial para apps externos
- Basic Auth (conta de serviço dedicada) — alternativa aprovada

**Modelo de solicitação (copiar/adaptar):**

```
Assunto: Credenciais M2M — Projeto Lino (Filtro N1 ITSM)

Descrição:
O Lino é um agente autônomo de triagem N1 que integra com ServiceNow via Table API REST (M2M).
Não utiliza sessão de navegador nem cookies.

Perfis necessários:
1. READ — polling de incidentes não atribuídos (a cada 2 min)
2. WRITE — work_notes, tags via label_entry, roteamento assignment_group

Instância: ibmlocaliza.service-now.com
Runtime: Node.js >= 18, fora do Power Platform
Contato técnico: [Felipe/Joel]
Documentação: docs/lino/ESPECIFICACAO.md
```

**Variáveis resultantes no `.env`:**

```
SNOW_READ_CLIENT_ID=...
SNOW_READ_CLIENT_SECRET=...
SNOW_WRITE_CLIENT_ID=...
SNOW_WRITE_CLIENT_SECRET=...
# ou equivalentes Basic: SNOW_READ_USERNAME/PASSWORD, SNOW_WRITE_USERNAME/PASSWORD
```

### 3.2 Microsoft Teams (Bot Framework)

**Quem solicitar:** Service Labs (registro de app no Azure AD / Microsoft Entra).

**O que pedir:**

1. **App registration** no tenant corporativo com Bot Framework habilitado.
2. **App ID** (`TEAMS_APP_ID`) e **client secret** (`TEAMS_APP_PASSWORD`).
3. Permissão para **mensagens proativas 1:1** com usuários do tenant.
4. Instalação do bot no escopo necessário (Teams admin center).

**Referência Microsoft:** [Send proactive messages](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/send-proactive-messages)

**Variáveis resultantes:**

```
TEAMS_APP_ID=...
TEAMS_APP_PASSWORD=...
TEAMS_TENANT_ID=3737367d-87d3-46ca-b00f-21b50c428b5e
TEAMS_SERVICE_URL=https://smba.trafficmanager.net/br/
```

### 3.3 Apigee / gateway corporativo (se aplicável)

Se a API ServiceNow ou um endpoint intermediário passar pelo **Apigee** (Operações de Cloud):

1. Solicitar **consumer** / `client_id` + `client_secret` no portal Apigee.
2. Registrar o produto/API conforme padrão Localiza.
3. Ajustar `SNOW_INSTANCE_URL` ou headers conforme documentação do gateway.

Consultar o time de **Operações de Cloud** para confirmar se o Lino precisa de consumer Apigee ou
acessa a instância ServiceNow diretamente na rede.

### 3.4 Mapa de responsáveis (referência corporativa)

| Necessidade | Equipe | Entregável |
|-------------|--------|------------|
| App registration Azure (Bot Teams) | Service Labs | `TEAMS_APP_ID`, secret |
| Conta de serviço ServiceNow | Service Labs + SN Admin | OAuth ou Basic READ/WRITE |
| Consumer API / Apigee | Operações de Cloud | `client_id` / `client_secret` (se gateway) |
| Repositório + pipeline | Plataforma / DevOps | Projeto Azure DevOps, CI verde |
| Validação de segurança | SOC / Segurança | Aprovação M2M (sem browser auth) |

---

## 4. Validar integração após provisionamento

```bash
# 1. Configurar .env local (nunca commitar)
cp .env.example .env

# 2. Testes unitários
npm test

# 3. Smoke manual (com credenciais reais)
npm run snow:queues          # resolve grupos de atribuição
npm start                    # ciclo de polling — verificar logs sem 401/403
```

**Em caso de 401/403:** interromper o ciclo (Fail Fast). Contatar Felipe/Joel para rotação de
credenciais. **Não** tentar login por navegador ou extração de cookies.

---

## 5. Checklist de prontidão DevOps

- [ ] Repositório importado ou espelhado no Azure DevOps
- [ ] `.gitignore` validado (sem `.env` no histórico)
- [ ] Pipeline `azure-pipelines.yml` executando `npm test` com sucesso
- [ ] Credenciais M2M ServiceNow READ/WRITE provisionadas
- [ ] Bot Teams registrado com mensagem proativa
- [ ] Variáveis secretas no DevOps Library (se pipeline de deploy)
- [ ] Smoke test manual documentado em work note de teste
- [ ] Runbook de rotação de credenciais (épico E0-H5 no BACKLOG)

---

## 6. Documentos relacionados

- [`lino/BACKLOG.md`](lino/BACKLOG.md) — épicos E0 (credenciais) e E4 (DevOps)
- [`lino/ESPECIFICACAO.md`](lino/ESPECIFICACAO.md) — visão de produto e segurança M2M
- [`.cursor/rules/security-auth.mdc`](../.cursor/rules/security-auth.mdc) — diretriz obrigatória
- [`../.env.example`](../.env.example) — template de variáveis
