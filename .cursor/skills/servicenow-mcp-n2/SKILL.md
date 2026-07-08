---
name: servicenow-mcp-n2
description: >
  Workflows N2 para ServiceNow via MCP — polling Guepardo, manifests Postman,
  dual auth read/write, resolução de filas e ferramentas MCP servicenow-read/write.
  Usar ao integrar ou depurar o agente N2 com ServiceNow.
version: 1.0.0
requires:
  env:
    - SNOW_INSTANCE_URL
    - SNOW_READ_USERNAME
    - SNOW_WRITE_USERNAME
  bins: []
actions:
  - read
  - write
---

# Skill: ServiceNow MCP — Lino (Filtro N1)

## Objetivo

Guiar o uso do ServiceNow no contexto do agente N2: manifests gerados do Postman,
queries de polling, perfis de autenticação separados e ferramentas MCP.

## Manifests (config/snow/)

| Arquivo | Propósito |
|---------|-----------|
| `instance.json` | URL base e nome da instância (ex: ibmlocaliza) |
| `tables.manifest.json` | Índice de tabelas importadas do Postman |
| `queries/n2-poll.json` | Query de polling do agente |
| `queries/guepardo-abertos.json` | Query Guepardo original |
| `endpoints/{table}.json` | Endpoints por tabela |

## Regenerar manifests

```bash
npm run snow:import-postman -- "caminho/ServiceNow Schema Mapper.postman_collection.json"
```

## Resolver filas de atribuição

```bash
npm run snow:queues
```

Variáveis: `SNOW_MONITOR_USER`, `SNOW_QUEUE_FILTER_MODE` (user|explicit|both|none), `SNOW_EXTRA_ASSIGNMENT_GROUPS`.

## MCP Servers

- **servicenow-read** — consultas (polling, metadados, grupos)
- **servicenow-write** — PATCH/POST (work notes, roteamento, tags)

Configuração em `.cursor/mcp.json` com placeholders `${env:SNOW_READ_*}` e `${env:SNOW_WRITE_*}`.

## Query N2 Poll

Base Guepardo + `assigned_to=EMPTY` + `sys_updated_on>javascript:gs.minutesAgo(2)` + `assignment_groupIN` das filas resolvidas.

## Referência

Ver `reference.md` nesta pasta para detalhes de endpoints e campos.
