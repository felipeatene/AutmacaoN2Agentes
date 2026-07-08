---
name: teams-fallback-worknotes
description: >
  Registra uma work_note no ticket ServiceNow quando o envio de mensagem proativa
  via Microsoft Teams falha (ex: 403 ForbiddenOperationException). Garante continuidade
  do ciclo de polling sem interrupção. Usar automaticamente como fallback do teams-proactive-message.
version: 1.0.0
requires:
  env:
    - SNOW_INSTANCE_URL
    - SNOW_USERNAME
    - SNOW_PASSWORD
  bins: []
actions:
  - write
---

# Skill: Fallback para Work Notes ServiceNow

## Objetivo

Garantir que a falha de comunicação via Teams não resulte em perda silenciosa de
informação. O analista humano encontrará a work_note e saberá que deve contatar
o usuário diretamente.

## Quando é Acionada

Esta skill é acionada **automaticamente** quando `teams-proactive-message` falha com:

| Código HTTP | Causa Comum                         |
|-------------|--------------------------------------|
| 403         | ForbiddenOperationException (Teams)  |
| 401         | Token expirado ou inválido           |
| 404         | Usuário não encontrado no tenant     |
| 500+        | Erro interno do servidor Teams       |
| Timeout     | Teams indisponível                   |

## Operação Realizada

```http
PATCH /api/now/table/incident/{sys_id}
{
  "work_notes": "[execution_id:<uuid>] [AGENTE N2] Não foi possível enviar
  notificação via Microsoft Teams. Erro: <mensagem>. Por favor, um analista
  deve contatar o usuário diretamente."
}
```

## Garantias

- **Não interrompe o ciclo de polling**: Falhas de fallback são logadas, não relançadas.
- **Idempotência**: O `execution_id` na work_note previne duplicatas.
- **Auditabilidade**: Erro original registrado nos logs internos com timestamp completo.

## O que NÃO faz

- Não tenta reenviar o Teams card automaticamente.
- Não escala para outro canal sem confirmação humana.
- Não mascara o erro original — sempre registrado nos logs.
