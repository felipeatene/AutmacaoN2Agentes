# Tarefas Atômicas — WBS (Work Breakdown Structure)

> Gerado via `/speckit.tasks`  
> Derivado de: `plan.md` v1.0.0  
> **Regra**: Cada tarefa é atômica, testável e independente. Alterações de escopo invalidam este documento.

---

## Fase 0 — Fundação do Projeto

| ID    | Tarefa                                     | Artefato                    | Critério de Conclusão                                    |
|-------|--------------------------------------------|-----------------------------|----------------------------------------------------------|
| T-001 | Criar estrutura de diretórios              | `src/`, `skills/`, `sops/`, `tests/` | Diretórios existem no repositório                |
| T-002 | Configurar `package.json`                  | `package.json`              | `npm install` executa sem erros                          |
| T-003 | Criar `.env.example`                       | `.env.example`              | Todas as variáveis da `constitution.md` documentadas     |
| T-004 | Criar `.gitignore`                         | `.gitignore`                | `node_modules/`, `.env` e `*.log` ignorados              |

---

## Fase 1 — Utilitários e Infraestrutura

| ID    | Tarefa                                     | Artefato                    | Critério de Conclusão                                    |
|-------|--------------------------------------------|-----------------------------|----------------------------------------------------------|
| T-101 | Implementar logger estruturado JSON        | `src/utils/logger.js`       | Logs com timestamp ISO-8601, nível, skill e mensagem     |
| T-102 | Implementar validador de configuração      | `src/utils/config.js`       | Aborta inicialização se variável obrigatória ausente     |
| T-103 | Implementar carregador de skills           | `src/skillLoader.js`        | Valida YAML frontmatter; rejeita skills sem `requires`   |
| T-104 | Implementar executor de SOPs               | `src/sop/runner.js`         | Executa passos de SOP; verifica idempotência             |

---

## Fase 2 — Integração ServiceNow

| ID    | Tarefa                                     | Artefato                    | Critério de Conclusão                                    |
|-------|--------------------------------------------|-----------------------------|----------------------------------------------------------|
| T-201 | Implementar cliente HTTP ServiceNow        | `src/snow/client.js`        | OAuth2 + Basic fallback; renova token antes da expiração |
| T-202 | Implementar polling de incidentes          | `src/snow/incidents.js`     | Query cirúrgica; retorna lista tipada de tickets         |
| T-203 | Implementar operações de escrita (PATCH)   | `src/snow/incidents.js`     | Verifica estado antes de escrever (idempotência)         |
| T-204 | Implementar gerenciamento de tags          | `src/snow/tags.js`          | Usa `label_entry`; verifica duplicatas antes de inserir  |

---

## Fase 3 — Integração Microsoft Teams

| ID    | Tarefa                                     | Artefato                    | Critério de Conclusão                                    |
|-------|--------------------------------------------|-----------------------------|----------------------------------------------------------|
| T-301 | Implementar cliente Bot Framework          | `src/teams/client.js`       | Inicializa adapter com credenciais; cria sessão 1:1      |
| T-302 | Implementar templates de Adaptive Cards    | `src/teams/adaptiveCards.js`| Cards com `Action.Execute`; sem `Action.Submit`          |
| T-303 | Implementar envio proativo                 | `src/teams/proactive.js`    | Envia card por `aadObjectId`; captura resposta           |
| T-304 | Implementar fallback para work_notes       | `src/teams/proactive.js`    | Em erro 403/4xx, registra no ServiceNow e continua ciclo |

---

## Fase 4 — Orquestração e Skills

| ID    | Tarefa                                     | Artefato                    | Critério de Conclusão                                    |
|-------|--------------------------------------------|-----------------------------|----------------------------------------------------------|
| T-401 | Criar SKILL: snow-poll-incidents           | `skills/snow-poll-incidents.md`    | YAML válido; `requires.env` correto               |
| T-402 | Criar SKILL: snow-resolve-incident         | `skills/snow-resolve-incident.md`  | YAML válido; ação restrita a `write`              |
| T-403 | Criar SKILL: snow-classify-route           | `skills/snow-classify-route.md`    | YAML válido; aplica tag + grupo                   |
| T-404 | Criar SKILL: snow-apply-tag                | `skills/snow-apply-tag.md`         | YAML válido; usa `label_entry`                    |
| T-405 | Criar SKILL: teams-proactive-message       | `skills/teams-proactive-message.md`| YAML válido; `Action.Execute` documentado         |
| T-406 | Criar SKILL: teams-fallback-worknotes      | `skills/teams-fallback-worknotes.md`| YAML válido; não interrompe ciclo               |
| T-407 | Implementar orquestrador de decisões       | `src/orchestrator.js`       | Fluxo de decisão conforme `plan.md` seção 4        |
| T-408 | Implementar loop principal                 | `src/index.js`              | Inicia, valida env, e executa ciclo a cada 2 min  |

---

## Fase 5 — SOPs Exemplo

| ID    | Tarefa                                     | Artefato                    | Critério de Conclusão                                    |
|-------|--------------------------------------------|-----------------------------|----------------------------------------------------------|
| T-501 | Criar SOP: Reset de Senha                  | `sops/password-reset.json`  | JSON válido; gatilhos de palavras-chave definidos        |
| T-502 | Criar SOP: VPN Connectivity                | `sops/vpn-connectivity.json`| JSON válido; passos de diagnóstico documentados          |
| T-503 | Criar SOP: Instalação de Software          | `sops/software-install.json`| JSON válido; requer aprovação humana                     |

---

## Fase 6 — Testes

| ID    | Tarefa                                     | Artefato                    | Critério de Conclusão                                    |
|-------|--------------------------------------------|-----------------------------|----------------------------------------------------------|
| T-601 | Testes do carregador de skills             | `tests/skillLoader.test.js` | Valida YAML válido/inválido; verifica `requires`         |
| T-602 | Testes do cliente ServiceNow               | `tests/snow-client.test.js` | Mock de respostas HTTP; testa OAuth e Basic fallback     |
| T-603 | Testes do orquestrador                     | `tests/orchestrator.test.js`| Testa fluxo de decisão com mocks de cliente              |

---

## Status de Execução

```
Fase 0: [ ] T-001  [ ] T-002  [ ] T-003  [ ] T-004
Fase 1: [ ] T-101  [ ] T-102  [ ] T-103  [ ] T-104
Fase 2: [ ] T-201  [ ] T-202  [ ] T-203  [ ] T-204
Fase 3: [ ] T-301  [ ] T-302  [ ] T-303  [ ] T-304
Fase 4: [ ] T-401  [ ] T-402  [ ] T-403  [ ] T-404
        [ ] T-405  [ ] T-406  [ ] T-407  [ ] T-408
Fase 5: [ ] T-501  [ ] T-502  [ ] T-503
Fase 6: [ ] T-601  [ ] T-602  [ ] T-603
```
