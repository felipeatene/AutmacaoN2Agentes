---
name: teams-proactive-message
description: >
  Inicia uma conversa 1:1 proativa no Microsoft Teams com o usuário solicitante
  para coletar contexto adicional antes do transbordo para analista humano.
  Envia Adaptive Card com Action.Execute. Usar quando o ticket não tem contexto
  suficiente para roteamento automático e o aadObjectId do usuário está disponível.
version: 1.0.0
requires:
  env:
    - TEAMS_APP_ID
    - TEAMS_APP_PASSWORD
    - TEAMS_TENANT_ID
    - TEAMS_SERVICE_URL
  bins: []
actions:
  - notify
---

# Skill: Mensagem Proativa via Microsoft Teams

## Objetivo

Contatar proativamente o usuário solicitante via Teams para coletar informações
estruturadas antes do transbordo para analista N2.

## Fluxo de Execução

1. Obter `aadObjectId` do usuário a partir do campo `u_aad_object_id` do ticket.
2. Construir referência de conversa 1:1 para o Bot Framework.
3. Criar nova conversa via `adapter.createConversation()`.
4. Enviar Adaptive Card com campos estruturados e `Action.Execute`.

## Por que Action.Execute (não Action.Submit)

| Feature                    | Action.Execute          | Action.Submit (descontinuado) |
|----------------------------|-------------------------|-------------------------------|
| Resposta síncrona          | ✅ Suportado             | ❌ Não suportado               |
| Atualização do card        | ✅ Suportado             | ❌ Não suportado               |
| Universal Actions          | ✅ Sim                   | ❌ Não                         |
| Suporte futuro             | ✅ Ativo                 | ❌ Descontinuado               |

## Adaptive Card (Estrutura)

```json
{
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    { "type": "TextBlock", "text": "Solicitação de Suporte — INC0001234" },
    { "type": "Input.Text", "id": "additionalContext", "isMultiline": true },
    { "type": "Input.ChoiceSet", "id": "urgency", "choices": [...] }
  ],
  "actions": [
    {
      "type": "Action.Execute",
      "verb": "submitContext",
      "data": { "incidentSysId": "...", "action": "provideContext" }
    }
  ]
}
```

## Fallback

Se o envio falhar (qualquer erro), a skill `teams-fallback-worknotes` é acionada
automaticamente. O ciclo de polling **não** é interrompido.
