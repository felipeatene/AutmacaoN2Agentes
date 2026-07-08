# Arquitetura — Agente Lino (Filtro N1 Inteligente)

> Mapeia o conceito do Lino (N1) aos módulos de código **já existentes** em `src/`.
> Este documento é descritivo: não propõe alterações de código nem de autenticação (a arquitetura é
> M2M — ServiceNow via OAuth/Basic, Teams via Bot Framework).

---

## 1. Visão de componentes

O diagrama abaixo mostra o Lino como camada N1 orquestrando os módulos existentes. Cada nó do grupo
"Lino" corresponde a um arquivo real em `src/`.

```mermaid
flowchart TD
    subgraph Externo["Sistemas externos (M2M)"]
        SNOW["ServiceNow (Table API REST)"]
        TEAMS["Microsoft Teams (Bot Framework)"]
        N2["Fila N2 humana"]
    end

    subgraph Lino["Lino - Filtro N1 inteligente"]
        IDX["src/index.js - ciclo de polling e controle"]
        ORQ["src/orchestrator.js - decisao e classificacao"]
        SOP["src/sop/runner.js - execucao de SOPs"]
        subgraph SnowMod["src/snow/ - integracao ServiceNow M2M"]
            SCLI["client.js - auth OAuth/Basic"]
            SINC["incidents.js - poll, work_note, resolve, route"]
            STAG["tags.js - label_entry"]
            SGRP["groups.js - assignment_group"]
            SQRY["queries.js - filtros de fila"]
        end
        subgraph TeamsMod["src/teams/ - contato proativo"]
            TPRO["proactive.js - envio 1:1 com fallback"]
            TCARD["adaptiveCards.js - Adaptive Cards"]
            TCLI["client.js - BotFrameworkAdapter"]
        end
        subgraph Utils["src/utils/"]
            UCFG["config.js - validacao de variaveis"]
            ULOG["logger.js - log estruturado"]
        end
        MEM["Memoria persistente (fases 2-3, ainda nao implementada)"]
    end

    SNOW -->|"GET incidentes novos"| SINC
    IDX -->|"aciona ciclo"| ORQ
    SINC --> IDX
    ORQ -->|"SOP existe"| SOP
    ORQ -->|"classifica e tagueia"| STAG
    ORQ -->|"resolve grupo"| SGRP
    ORQ -->|"falta contexto"| TPRO
    SOP --> SINC
    STAG --> SNOW
    SGRP --> SNOW
    SINC -->|"work_note, resolve, route"| SNOW
    TPRO --> TCARD
    TPRO --> TCLI
    TCLI --> TEAMS
    TPRO -.->|"fallback quando Teams falha"| SINC
    SCLI -.->|"auth M2M para todas as chamadas"| SnowMod
    ORQ -.->|"consulta e grava (futuro)"| MEM
    ORQ -->|"chamado tratado"| N2
    UCFG -.-> IDX
    ULOG -.-> Lino
```

---

## 2. Mapeamento capacidade → módulo

| Capacidade do Lino | Módulo(s) responsável(is) | Papel |
|--------------------|---------------------------|-------|
| Polling / interceptação | `src/index.js`, `src/snow/incidents.js`, `src/snow/queries.js` | Consulta a Table API a cada ciclo e obtém incidentes novos sem atribuição |
| Decisão / classificação | `src/orchestrator.js` | Aplica o fluxo de decisão (SOP → contexto → classificação/roteamento) |
| Integração ServiceNow (M2M) | `src/snow/client.js` + `incidents.js`, `tags.js`, `groups.js` | Autenticação OAuth/Basic e operações de leitura/escrita idempotentes |
| Execução de SOPs | `src/sop/runner.js` | Resolução automática idempotente para chamados cobertos por SOP |
| Contato proativo | `src/teams/proactive.js`, `adaptiveCards.js`, `client.js` | Diálogo 1:1 via Bot Framework, com fallback para `work_note` |
| Configuração / auditoria | `src/utils/config.js`, `src/utils/logger.js` | Validação de variáveis (Falha Rápida) e log estruturado |
| Memória persistente | _(não implementado — fases 2/3)_ | Histórico de análises e base de recorrências (ver ESPECIFICACAO §5) |

---

## 3. Sequência de um ciclo (interceptação → entrega N2)

```mermaid
sequenceDiagram
    participant IDX as index.js (ciclo)
    participant SNOW as ServiceNow (M2M)
    participant ORQ as orchestrator.js
    participant SOP as sop/runner.js
    participant SN as snow/*
    participant TEAMS as teams/proactive.js

    IDX->>SNOW: pollIncidents (GET incidentes novos)
    SNOW-->>IDX: lista de incidentes
    loop para cada incidente
        IDX->>ORQ: processIncident(incident)
        ORQ->>SOP: findMatchingSOP(incident)
        alt SOP encontrado
            SOP->>SN: executa passos idempotentes + resolve
            SN->>SNOW: work_note + incident_state=6
        else sem SOP e contexto suficiente
            ORQ->>SN: applyTags (label_entry) + routeIncident
            SN->>SNOW: tags + assignment_group + work_note
        else sem SOP e contexto insuficiente
            ORQ->>TEAMS: sendProactiveWithFallback (Adaptive Card)
            alt envio Teams ok
                TEAMS->>SNOW: (usuario responde -> work_note)
            else falha Teams (ex 403)
                TEAMS->>SN: fallback work_note
                SN->>SNOW: work_note explicando falha
            end
        end
    end
    Note over ORQ,SNOW: Chamado entregue tratado a fila N2 humana
```

Todo caminho de escrita registra `execution_id` (Pilar 2). Erros 401/403/rede suspendem o ciclo em
`index.js` (Pilar 1).

---

## 4. Fronteira de segurança (M2M)

```mermaid
flowchart LR
    subgraph Permitido["Permitido - M2M oficial"]
        A["ServiceNow: OAuth 2.0 ou Basic (conta de servico)"]
        B["Teams: Bot Framework (TEAMS_APP_ID / TEAMS_APP_PASSWORD)"]
    end
    subgraph Proibido["Proibido - aciona SOC"]
        C["Scraping de cookies / DPAPI"]
        D["Leitura de perfis de navegador"]
        E["Playwright / Selenium / Puppeteer para SSO"]
    end
    A --> OK["Ciclo do Lino"]
    B --> OK
    C -.->|"bloqueado"| X["Falha de conformidade"]
    D -.->|"bloqueado"| X
    E -.->|"bloqueado"| X
```

- A autenticação ServiceNow está centralizada em `src/snow/client.js`; a do Teams em
  `src/teams/client.js` (`BotFrameworkAdapter`).
- As proibições seguem `.cursor/rules/security-auth.mdc`. A camada de memória futura (seção 1) deverá
  usar apenas persistência aprovada (ver trade-offs em `ESPECIFICACAO.md` §5.3), sem novas superfícies
  de credencial não governadas.

---

## 5. Onde a memória persistente se encaixa (futuro)

A memória (fases 2/3) entra como uma dependência **consultada e gravada pelo `orchestrator.js`**, sem
alterar os módulos de integração:

```mermaid
flowchart TD
    ORQ["orchestrator.js"] -->|"1. consulta antes de decidir"| MEM["Camada de memoria"]
    MEM -->|"causa provavel / recorrencia"| ORQ
    ORQ -->|"2. grava AnalysisRecord ao final"| MEM
    MEM --> STORE{"Persistencia (a decidir)"}
    STORE -->|"opcao A"| LOCAL["Arquivo local JSON/SQLite"]
    STORE -->|"opcao B"| TABLE["Tabela custom no ServiceNow"]
    STORE -->|"opcao C"| EXT["Servico externo / vetorial"]
```

A escolha de persistência é uma decisão de backlog (ver `BACKLOG.md`), não uma alteração deste
mapeamento arquitetural.

---

## 6. Documentos relacionados

- [`ESPECIFICACAO.md`](ESPECIFICACAO.md) — identidade, capacidades, fluxo, memória e contratos.
- [`GLOSSARIO.md`](GLOSSARIO.md) — termos técnicos.
- [`BACKLOG.md`](BACKLOG.md) — épicos, histórias e proposta de reorganização de pastas.
- [`../DEPLOY-AZURE-DEVOPS.md`](../DEPLOY-AZURE-DEVOPS.md) — exportação para Azure DevOps e credenciais M2M.
