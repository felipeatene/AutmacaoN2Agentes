# AutmacaoN2Agentes

Agente autônomo de IA para sustentação de produtos de TI, integrando **ServiceNow** e **Microsoft Teams** via Spec-Driven Development (SDD).

---

## Visão Geral

Este sistema implementa um motor de automação agentiva que opera em ciclo contínuo a cada 2 minutos, consultando o ServiceNow e executando uma de três ações:

| Ação | Descrição |
|------|-----------|
| **Resolução Direta** | Executa SOPs aprovados automaticamente para tickets conhecidos |
| **Classificação e Roteamento** | Taggeia e roteia tickets para equipes especialistas via `label_entry` |
| **Comunicação Proativa** | Envia Adaptive Cards no Teams para coletar contexto antes do transbordo |

---

## Documentação SDD

| Arquivo | Propósito |
|---------|-----------|
| [`constitution.md`](constitution.md) | Regras imutáveis: Fail Fast, Idempotência, Isolamento de Execução |
| [`spec.md`](spec.md) | O "quê" e o "porquê" — requisitos funcionais e critérios de aceitação |
| [`plan.md`](plan.md) | O "como" — arquitetura, APIs, modelo de dados, decisões técnicas |
| [`tasks.md`](tasks.md) | WBS de tarefas atômicas para implementação |

---

## Pré-requisitos

- **Node.js** >= 18 LTS
- Instância **ServiceNow** com permissão para `incident`, `label`, `label_entry`
- **Bot Framework** registrado no Azure AD com permissão para envio proativo no Teams

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais reais

# 3. Iniciar o agente
npm start
```

## Testes

```bash
npm test
```

24 testes cobrindo: carregamento de skills, cliente ServiceNow (autenticação, fail-fast, rate-limit), adaptive cards (Action.Execute), e lógica de orquestração.

---

## Arquitetura de Segurança

- **Zero credenciais em logs**: Variáveis de ambiente nunca são impressas.
- **Fail Fast & Noisy**: Erros de autenticação suspendem o ciclo imediatamente.
- **Idempotência**: Toda escrita verifica o estado atual antes de executar.
- **Anti-Prompt Injection**: Conteúdo de tickets nunca é executado como código/instrução.
- **Skills validadas**: YAML frontmatter com `requires.env` e `requires.bins` como portões de segurança.
- **label_entry**: Tags aplicadas via tabela de intersecção, evitando falha silenciosa do campo `sys_tags`.

## Estrutura do Projeto

```
├── constitution.md          # Regras imutáveis do sistema
├── spec.md                  # Requisitos e critérios de aceitação
├── plan.md                  # Arquitetura técnica
├── tasks.md                 # WBS de tarefas atômicas
├── src/
│   ├── index.js             # Loop principal (polling a cada 2 min)
│   ├── orchestrator.js      # Fluxo de decisão do agente
│   ├── skillLoader.js       # Carregador/validador de SKILL.md
│   ├── snow/
│   │   ├── client.js        # Cliente HTTP ServiceNow (OAuth2 + Basic)
│   │   ├── incidents.js     # Operações de incidentes
│   │   └── tags.js          # Tags via label_entry (não sys_tags)
│   ├── teams/
│   │   ├── client.js        # Bot Framework adapter
│   │   ├── adaptiveCards.js # Templates com Action.Execute
│   │   └── proactive.js     # Envio proativo + fallback work_notes
│   ├── sop/
│   │   └── runner.js        # Executor de SOPs
│   └── utils/
│       ├── config.js        # Validação de env vars
│       └── logger.js        # Logger JSON estruturado
├── skills/                  # SKILL.md com YAML frontmatter
├── sops/                    # SOPs em JSON (password-reset, vpn, software)
└── tests/                   # 24 testes automatizados
```
