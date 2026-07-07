# Especificação do Sistema — Automação Agentiva para Sustentação de Produtos de TI

> Gerado via `/speckit.specify`  
> Versão: 1.0.0 | Data: 2026-07-07  
> **Regra**: Alterações de escopo devem ser feitas via `/speckit.clarify`, forçando reescrita em cascata de `plan.md` e `tasks.md`.

---

## 1. Contexto e Problema

A gestão tradicional de serviços de TI (ITSM) sofre com:

- **Triagens manuais** que consomem tempo de analistas N2 com tarefas repetitivas.
- **Dados incompletos** em tickets criados por usuários finais sem contexto técnico adequado.
- **Alto MTTR** (Mean Time to Resolve) causado por filas de espera e roteamento incorreto.

### Solução Proposta

Um agente autônomo de IA que opera em ciclo contínuo, consultando o ServiceNow a cada 2 minutos e executando uma das três ações definidas abaixo.

---

## 2. Escopo Funcional

### RF-01: Ciclo de Polling Contínuo

- O agente **deve** consultar a Table API do ServiceNow (`/api/now/table/incident`) a cada 2 minutos.
- A query **deve** filtrar: `active=true^assigned_to=NULL^sys_updated_on>javascript:gs.minutesAgo(2)`.
- O ciclo **não deve** ser bloqueante; falhas devem ser registradas e o ciclo suspenso (Pilar 1).

### RF-02: Resolução Direta via SOP

- Para tickets que correspondam a um SOP cadastrado em `sops/`, o agente **deve**:
  1. Executar os passos do SOP automaticamente.
  2. Registrar as ações em `work_notes` com `execution_id`.
  3. Fechar o ticket com `incident_state=6` e `close_code` correspondente.

### RF-03: Classificação e Roteamento Inteligente

- Para tickets sem SOP correspondente, o agente **deve**:
  1. Analisar `short_description` e `description` para determinar categoria e grupo de suporte.
  2. Aplicar tags via tabela `label_entry` (nunca via `sys_tags` diretamente).
  3. Atribuir o ticket ao grupo de suporte correto via campo `assignment_group`.
  4. Registrar o roteamento em `work_notes`.

### RF-04: Comunicação Proativa via MS Teams

- Quando informações adicionais forem necessárias antes do transbordo, o agente **deve**:
  1. Identificar o `aadObjectId` do usuário solicitante no ServiceNow.
  2. Iniciar conversa 1:1 proativa via Bot Framework SDK.
  3. Enviar um Adaptive Card com `Action.Execute` para coleta estruturada de contexto.
  4. Persistir as respostas do usuário como `work_notes` no ticket.

### RF-05: Fallback para Work Notes

- Se o envio via Teams falhar (ex.: `403 ForbiddenOperationException`), o agente **deve**:
  1. Registrar o erro completo nos logs internos.
  2. Adicionar um comentário em `work_notes` do ticket explicando a falha.
  3. Continuar o ciclo sem interrupção para os demais tickets.

### RF-06: Human-in-the-Loop

- Para ações irreversíveis sem SOP correspondente, o agente **deve**:
  1. Enviar Adaptive Card ao analista N2 de plantão pedindo aprovação.
  2. Aguardar resposta antes de executar qualquer alteração.
  3. Registrar aprovação/rejeição em `work_notes`.

---

## 3. Requisitos Não-Funcionais

| ID     | Requisito                                  | Critério de Aceitação                                     |
|--------|--------------------------------------------|-----------------------------------------------------------|
| RNF-01 | Latência de ciclo                          | Ciclo completo em < 30 segundos para até 50 tickets       |
| RNF-02 | Resiliência                                | Backoff exponencial em rate limit; máximo 3 retentativas  |
| RNF-03 | Auditabilidade                             | Toda ação registrada com timestamp + execution_id         |
| RNF-04 | Segurança                                  | Zero credenciais em logs ou código-fonte                  |
| RNF-05 | Idempotência                               | Re-execução do ciclo não duplica ações já realizadas      |
| RNF-06 | Portabilidade                              | Executável via `node src/index.js` sem dependências CLI   |

---

## 4. Critérios de Aceitação Globais

- [ ] O agente inicia e valida todas as variáveis de ambiente listadas na `constitution.md`.
- [ ] Tickets novos sem atribuição são processados dentro de 2 minutos da criação.
- [ ] Tags são aplicadas com sucesso via `label_entry` sem duplicatas.
- [ ] Adaptive Cards são renderizados no Teams com `Action.Execute` funcional.
- [ ] Erros de API resultam em logs detalhados e suspensão correta do ciclo.
- [ ] SOPs são validados antes de qualquer execução automatizada.
- [ ] Human-in-the-Loop bloqueia ações irreversíveis sem aprovação prévia.

---

## 5. Fora do Escopo (v1.0)

- Treinamento de modelos de ML proprietários.
- Integração com sistemas ITSM além do ServiceNow.
- Interface web de gerenciamento do agente.
- Multi-tenancy (suporte a múltiplas organizações simultaneamente).
