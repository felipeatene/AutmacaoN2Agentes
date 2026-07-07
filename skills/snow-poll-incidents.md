---
name: snow-poll-incidents
description: >
  Consulta a API Table do ServiceNow para buscar incidentes ativos, sem atribuição,
  atualizados nos últimos 2 minutos. Retorna lista de tickets para processamento
  pelo orquestrador. Usar quando o ciclo de polling principal for iniciado.
version: 1.0.0
requires:
  env:
    - SNOW_INSTANCE_URL
    - SNOW_USERNAME
    - SNOW_PASSWORD
  bins: []
actions:
  - read
---

# Skill: Polling de Incidentes ServiceNow

## Objetivo

Consulta cirúrgica à Table API do ServiceNow para recuperar somente os tickets que
requerem ação imediata, minimizando uso de rate limit.

## Query Utilizada

```
GET /api/now/table/incident
  ?sysparm_query=active=true^assigned_to=EMPTY^sys_updated_on>javascript:gs.minutesAgo(2)
  &sysparm_fields=sys_id,number,short_description,description,state,...
  &sysparm_limit=50
  &sysparm_display_value=false
```

## Critérios de Filtragem

| Filtro                  | Valor                          | Motivo                                      |
|-------------------------|--------------------------------|---------------------------------------------|
| `active`                | `true`                         | Ignorar tickets fechados/cancelados         |
| `assigned_to`           | `EMPTY`                        | Apenas tickets sem analista responsável     |
| `sys_updated_on`        | `> gs.minutesAgo(2)`           | Janela de 2 min para evitar reprocessamento |

## Idempotência

Esta skill é **read-only**. Nenhuma alteração é feita no ServiceNow durante o polling.

## Tratamento de Erros

- `429 Too Many Requests`: Backoff exponencial (até 3 retentativas).
- `401/403`: Falha rápida — ciclo suspenso imediatamente.
- Erro de rede: Falha rápida — ciclo suspenso imediatamente.
