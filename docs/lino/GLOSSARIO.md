# Glossário — Agente Lino

> Vocabulário comum para manter consistência de terminologia entre `ESPECIFICACAO.md`,
> `ARQUITETURA.md`, `BACKLOG.md`, a `spec.md` e a `constitution.md`.
> Ordenado alfabeticamente.

---

### AnalysisRecord
Registro estruturado que o Lino grava na **memória de longo prazo** ao final de cada análise. Contém
sintoma normalizado, classificação, cenário, ação, resultado, correlações e `execution_id`. Contrato
definido em `ESPECIFICACAO.md` §6.2.

### Adaptive Card
Cartão interativo do Microsoft Teams (com `Action.Execute`) usado no **contato proativo** para coletar
contexto de forma estruturada. Enviado via Bot Framework (`src/teams/adaptiveCards.js`).

### Bot Framework
Plataforma oficial da Microsoft para bots. É o **único** meio permitido para enviar mensagens proativas
ao Teams (`src/teams/proactive.js`), autenticado por `TEAMS_APP_ID` / `TEAMS_APP_PASSWORD`.

### Classificação
Ato de determinar **categoria, sintoma, criticidade e grupo-alvo** de um chamado a partir do seu
conteúdo. Capacidade C2 do Lino.

### Contexto
Conjunto de informações que tornam um chamado acionável (o que aconteceu, onde, quando, evidências como
prints). Quando o contexto é **insuficiente**, o Lino faz **contato proativo**.

### Contato proativo
Iniciativa do Lino de abrir diálogo com o usuário solicitante para pedir um dado específico que falta,
antes do transbordo. Canal preferencial: Teams 1:1; fallback: `work_note` no chamado. Capacidade C5.

### Correlação (com monitoramento)
Vínculo entre um chamado e um `problem`/incidente-mãe ativo já conhecido — permitindo dizer "já sabemos
que a causa é X". Capacidade C4 (fase 3).

### Criticidade
Grau de severidade/urgência atribuído ao chamado durante a classificação, usado para priorização.

### Enriquecimento
Adição de valor ao chamado antes de entregá-lo à fila N2: tags, resumo da análise, hipótese de causa,
links de correlação e classificação. Capacidade C6.

### `execution_id`
Identificador único de cada execução do Lino, incluído em **toda** operação de escrita (especialmente
`work_notes`) para auditoria e idempotência. Exigido pela Constituição (Pilar 2).

### Falha Rápida e Ruidosa (Fail Fast & Noisy)
Pilar 1 da Constituição: erros críticos (401/403, rede) **suspendem o ciclo imediatamente** e são
logados de forma completa; nunca são mascarados por `try/catch` silenciosos.

### Fila N2
Fila de atendimento humano de segunda linha. Destino final dos chamados após o tratamento do Lino. O
objetivo é que a fila N2 receba chamados **já tratados**.

### Human-in-the-Loop
Pilar 3 da Constituição: ações em produção só ocorrem via SOPs aprovados; sem SOP, o Lino
classifica/roteia/pede contexto, e ações irreversíveis exigem aprovação humana.

### Idempotência
Propriedade de que reexecutar uma operação não duplica efeitos. O Lino consulta o estado antes de
qualquer escrita (fechar, rotear, tag) — Pilar 2 da Constituição.

### IncidentContext
Representação **normalizada e inerte** de um chamado, produzida pela compreensão (C1) e usada como
entrada para a decisão. Contrato em `ESPECIFICACAO.md` §6.1.

### `label_entry`
Tabela de intersecção do ServiceNow usada para aplicar tags de forma correta. O agente **nunca** grava
`sys_tags` diretamente (campo M:N derivado que falha silenciosamente em PUT/PATCH).

### Lino
Nome do agente. Papel: **filtro N1 inteligente** que intercepta, filtra, enriquece e entrega chamados
tratados à fila N2. Não substitui o analista humano.

### M2M (Machine-to-Machine)
Padrão de integração oficial e **obrigatório**: ServiceNow via OAuth 2.0 ou Basic (conta de serviço),
Teams via Bot Framework. Definido em `.cursor/rules/security-auth.mdc`.

### Memória de curto prazo
Estado volátil relativo ao **ciclo de polling atual** (o `IncidentContext` em processamento e
resultados intermediários). Não é persistida.

### Memória de longo prazo
Histórico **persistido** de chamados analisados (`AnalysisRecord`), que permite reconhecer chamados e
sintomas já vistos.

### Memória persistente
Termo guarda-chuva para as três camadas de memória do Lino: curto prazo, longo prazo e base de
recorrências. Diferencial que torna o N1 "inteligente". Ver `ESPECIFICACAO.md` §5.

### MTTR (Mean Time to Resolve)
Tempo médio de resolução de chamados. Reduzi-lo é um objetivo central do Lino.

### N1 (primeira linha)
Camada de triagem/filtragem inicial. No projeto, o **Lino é o N1 automatizado**.

### N2 (segunda linha)
Camada de suporte especializado, tratada por **analistas humanos**. Recebe do Lino chamados já
enriquecidos.

### Polling
Ciclo contínuo (a cada ~2 minutos) em que o Lino consulta a Table API do ServiceNow por incidentes
novos e sem atribuição. Implementado em `src/index.js` + `src/snow/incidents.js`.

### Prompt injection
Tentativa de fazer o agente executar instruções embutidas em campos livres (`description`,
`work_notes`). O Lino trata esses campos **sempre como dado inerte**, nunca como comando.

### Recorrência
Padrão de sintoma que já apareceu antes e cuja causa provável é conhecida. A **análise de recorrência**
compara o sintoma do chamado novo com a base histórica. Ver `ESPECIFICACAO.md` §5.4.

### Roteamento
Atribuição do chamado ao `assignment_group` (fila/grupo de suporte) correto após a classificação.
Implementado via `src/snow/groups.js` e `routeIncident`.

### Service Labs
Provedor/contexto responsável pela emissão das credenciais M2M (conta de serviço ServiceNow, app do
Bot no Azure). Dependência para habilitar as fases do Lino — detalhada no `BACKLOG.md`.

### Sintoma
Manifestação observável do problema relatado (ex.: "VPN erro 809"). O **sintoma normalizado** é a
chave que liga chamados semelhantes na base de recorrências.

### SOP (Standard Operating Procedure)
Procedimento aprovado (em `sops/`) que autoriza uma resolução automática. Sem SOP correspondente, o
Lino nunca resolve/fecha: apenas classifica, enriquece ou transborda.

### Transbordo
Encaminhamento do chamado para atendimento humano (fila N2 ou aprovação via Adaptive Card) quando o
Lino não pode/não deve resolver automaticamente.

### `work_note`
Anotação de trabalho no incidente do ServiceNow. Canal de auditoria e de fallback do contato proativo.
Toda `work_note` do Lino carrega o `execution_id`.
