---
name: snow-apply-tag
description: >
  Aplica uma ou mais tags a um incidente ServiceNow usando a tabela de intersecção
  label_entry. NUNCA usa o campo sys_tags diretamente (campo M:N derivado que falha
  silenciosamente em requisições PUT/PATCH). Usar para tagueamento durante classificação.
version: 1.0.0
requires:
  env:
    - SNOW_INSTANCE_URL
    - SNOW_USERNAME
    - SNOW_PASSWORD
  bins: []
actions:
  - read
  - write
---

# Skill: Aplicação de Tags via label_entry

## Objetivo

Aplicar tags a incidentes de forma confiável usando a tabela de intersecção correta,
evitando a armadilha do campo `sys_tags` derivado.

## Por que NÃO usar sys_tags

O campo `sys_tags` exibido na interface do ServiceNow é um campo M:N **derivado**.
Atualizações diretas via `PUT/PATCH` na tabela `incident` **falham silenciosamente**
— a API retorna 200 OK, mas a tag não é aplicada.

## Processo Correto (3 Etapas)

### Etapa 1 — Buscar sys_id da label

```http
GET /api/now/table/label
  ?sysparm_query=name=<nome_da_tag>
  &sysparm_fields=sys_id,name
  &sysparm_limit=1
```

### Etapa 2 — Verificar idempotência

```http
GET /api/now/table/label_entry
  ?sysparm_query=table=incident^table_key=<incident_sys_id>^label=<label_sys_id>
  &sysparm_fields=sys_id
  &sysparm_limit=1
```

Se retornar resultado → tag já aplicada → operação cancelada (idempotência).

### Etapa 3 — Inserir nova entrada (se não existir)

```http
POST /api/now/table/label_entry
{
  "table": "incident",
  "table_key": "<incident_sys_id>",
  "label": "<label_sys_id>"
}
```

## Retorno

- `true` → Tag aplicada com sucesso.
- `false` → Tag já existia (idempotência) ou label não encontrada.
- `throw` → Erro irrecuperável (registrado e relançado).
