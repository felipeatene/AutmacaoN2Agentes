Documento de Design de Software (SDD): Automação Agentiva para Sustentação de Produtos de TI via Cursor e ServiceNow
Introdução e Paradigma de Arquitetura Cognitiva
A sustentação de produtos de Tecnologia da Informação (TI) em ecossistemas corporativos de alta complexidade tem dependido, historicamente, de processos de triagem manuais, investigação repetitiva e orquestração humana. O fluxo tradicional, no qual analistas monitorizam continuamente filas de chamados, analisam dados preliminares muitas vezes incompletos e procuram ativamente o utilizador para obter esclarecimentos, apresenta estrangulamentos sistémicos de eficiência. O tempo médio de resposta (MTTR - Mean Time To Resolve) é frequentemente inflacionado pela inatividade na fila de incidentes não atribuídos e pela ausência de contexto semântico nas descrições fornecidas pelos utilizadores finais. Para mitigar estes desafios estruturais, a adoção de agentes autônomos baseados em Inteligência Artificial (IA) apresenta-se não apenas como uma ferramenta de automação, mas como uma alteração profunda no paradigma da gestão de serviços de TI (ITSM).   

A idealização e elaboração detalhada deste projeto propõe a implementação de uma arquitetura de automação via Interface de Linha de Comando (CLI), intrinsecamente integrada ao ambiente de desenvolvimento Cursor. Este sistema é alimentado por capacidades de agentes de IA orquestrados através de "Skills" (habilidades modulares). A arquitetura estabelece um ciclo de monitorização contínua e determinística, consultando a plataforma ServiceNow a intervalos rigorosos de dois minutos para capturar incidentes ativos e não atribuídos. Após a captura de um incidente, o agente autónomo analisa o contexto textual, avalia as dependências e, com base em árvores de decisão algorítmicas, realiza uma de três ações operacionais primárias.   

A primeira ação consiste na resolução direta do incidente, baseada em procedimentos operacionais padrão (SOPs) previamente mapeados e autorizados para execução autónoma. A segunda ação foca-se na classificação e no tagueamento estruturado do chamado, garantindo um encaminhamento preciso para a equipa especialista adequada através da manipulação avançada de bases de dados relacionais. A terceira, e possivelmente a mais inovadora, envolve a comunicação proativa com o utilizador relator através do Microsoft Teams. Esta comunicação utiliza Cartões Adaptativos (Adaptive Cards) dinâmicos para extrair contexto adicional estruturado antes que um analista humano assuma a responsabilidade técnica do caso.   

A construção de uma infraestrutura de tal magnitude e autonomia exige um abandono das práticas empíricas de engenharia de prompts. Em substituição, o desenvolvimento basear-se-á fortemente no paradigma de Desenvolvimento Orientado a Especificações (Spec-Driven Development - SDD) através do ecossistema Spec-kit. O presente documento detalha exaustivamente a topologia do sistema, as especificações de integração entre o Cursor CLI, ServiceNow e Microsoft Teams, as melhores práticas de construção de skills em plataformas como OpenClaw e ClawHub, e a infraestrutura de segurança e governança estritamente necessária para operar agentes autônomos com privilégios de escrita em ambientes de produção.   

O Paradigma de Desenvolvimento Orientado a Especificações (Spec-Driven Development)
A implementação de sistemas de software orquestrados por IA generativa introduz um nível de não determinismo que torna as abordagens tradicionais de engenharia (como o desenvolvimento iterativo de tentativa e erro) altamente suscetíveis a desvios arquiteturais, vulgarmente conhecidos como "alucinações estruturais". O Spec-Driven Development (SDD) inverte a lógica do desenvolvimento assistido por IA: em vez de iterar diretamente sobre o código-fonte, a metodologia obriga à formalização exaustiva de uma especificação antes da escrita de qualquer lógica executável. O GitHub Spec-kit consolida esta prática ao fornecer um conjunto robusto de ferramentas CLI que geram um ecossistema de documentos interligados em formato Markdown, servindo como a "fonte da verdade" perpétua para o agente de IA.   

A filosofia central do SDD postula que a manutenção de software num mundo dominado por IA significa evoluir especificações, movendo a lingua franca do desenvolvimento para um nível mais elevado de abstração conceitual, onde o código final é tratado meramente como a implementação da "última milha".   

A Constituição do Projeto (constitution.md)
O alicerce processual e comportamental do Spec-kit é a constituição do projeto (constitution.md). Este artefato, residente no diretório .specify/memory/ do repositório, atua como o banco de memória imutável do sistema. A constituição define os princípios inegociáveis de engenharia, governança arquitetural, regras de formatação e limites de atuação que guiarão todas as interações do agente no ambiente Cursor durante as fases de especificação, planeamento e implementação.   

Para este projeto de automação de sustentação de TI, a constituição estabelece um conjunto estrito de regras sobre como o agente CLI deve interagir com as APIs externas (ServiceNow e Microsoft Graph API) e como deve gerir a persistência e a privacidade dos dados operacionais. Os princípios fundamentais codificados na constituição incluem imperativos técnicos rigorosos. O sistema deve operar sob a premissa de "Falha Rápida e Ruidosa" (Fail Fast, Never Silently): o agente é estritamente proibido de mascarar exceções de rede ou erros de limitação de taxa (Rate Limit) da API do ServiceNow. Se uma operação falhar, o agente deve registar a falha de forma explícita e suspender o ciclo de monitorização, em vez de assumir valores predefinidos que possam corromper o estado do incidente.   

A constituição também impõe a "Idempotência Operacional Absoluta". Todas as skills que modificam o estado (como a adição de tags de classificação ou a resolução automatizada de incidentes) devem consultar previamente o estado atual da base de dados do ServiceNow para evitar a duplicação de registos relacionais ou a criação de ciclos de mensagens infinitos no Microsoft Teams. Adicionalmente, estabelecem-se protocolos de "Isolamento de Execução". O agente a operar no Cursor CLI não possui permissão para modificar o ambiente de produção através de fluxos de decisão dinâmicos não aprovados; apenas os procedimentos operacionais (SOPs) com um mapeamento prévio de 100% de precisão podem ser executados autonomamente, exigindo aprovação (Human-in-the-Loop) para casos marginais ou ambíguos.   

O Ciclo de Vida dos Artefatos SDD e a Orquestração CLI
A metodologia SDD, quando orquestrada através do CLI do Cursor, divide-se em quatro fases conceptuais distintas. Cada fase é mapeada em comandos /speckit.* e resulta em artefactos Markdown específicos que se tornam o input semântico obrigatório para a fase seguinte. A progressão linear destes comandos garante que a IA não sofra de degradação de contexto ao longo do desenvolvimento de funcionalidades complexas.   

Comando Spec-kit CLI	Artefacto Gerado	Propósito Arquitetural e Contexto de Execução
/speckit.specify	spec.md	
Define o âmbito, o "O quê" e o "Porquê". Especifica as histórias de utilizador priorizadas, os requisitos funcionais (e.g., o polling a cada 2 minutos) e os critérios de aceitação testáveis, sem se comprometer com linguagens de programação ou pacotes.

/speckit.plan	plan.md	
Define a estratégia técnica e o "Como". Estabelece a arquitetura de integração, as escolhas de API (REST vs. GraphQL no ServiceNow), a gestão de dependências (Node.js, Axios, MSAL) e o desenho do modelo de dados em formato de árvore de diretórios.

/speckit.tasks	tasks.md	
Traduz o plano de engenharia numa estrutura analítica de trabalho (WBS) rigorosa. Cada tarefa documentada deve ser atómica e passível de execução autónoma pelo agente do Cursor, garantindo rastreabilidade durante a fase de programação.

/speckit.implement	Código-Fonte	
Fase de geração de código onde o agente consome ativamente todos os documentos de memória gerados anteriormente para produzir os scripts CLI, os blocos de configuração e os ficheiros SKILL.md, sempre sob o escrutínio contínuo da constituição.

  
A sustentabilidade a longo prazo de um projeto SDD requer a adoção de um modelo de "Living Spec" (Especificação Viva). O ecossistema documenta que, quando a lógica de negócio subjacente necessita de alterações (por exemplo, a adição de uma nova fila de triagem de incidentes ou a integração com um novo motor de busca de documentação), o engenheiro humano não deve alterar o código-fonte gerado. Em vez disso, o processo exige a invocação de /speckit.clarify para atualizar o spec.md. Esta alteração despoleta uma cascata iterativa onde o agente reverifica o plan.md e reescreve o tasks.md em conformidade, assegurando que não ocorre o fenómeno de "débito técnico de contexto", onde o código diverge irremediavelmente da documentação arquitetural. Adicionalmente, o sistema suporta hooks de extensão (configurados em .specify/extensions.yml), permitindo que as fases de planeamento despoletem auditorias automáticas de qualidade ou sub-agentes de pesquisa paralela para resolver bloqueios técnicos antes de prosseguir.   

Arquitetura, Engenharia e Anatomia de 'Skills' de Agentes
A capacidade operacional do agente dentro da Interface de Linha de Comando (CLI) do Cursor, especialmente em contextos de orquestração complexa (Agentic Computing), não emerge de prompts estáticos inseridos pelo utilizador. Em vez disso, o sistema dependerá da construção meticulosa de skills (habilidades modulares). O formato padrão e interoperável para estas habilidades evoluiu substancialmente no seio de ecossistemas abertos de agentes (como o OpenClaw, Codex, Claude Code e ClawHub), consolidando-se na especificação unificada SKILL.md. Uma skill transcende a definição clássica de um script utilitário; trata-se de um encapsulamento declarativo de instruções de raciocínio lógico, ferramentas do sistema permitidas, metadados de dependência de infraestrutura e prompts de ativação comportamental.   

Estrutura e Parseamento do Ficheiro SKILL.md
Uma skill eficaz e segura deve ser obrigatoriamente estruturada com metadados Frontmatter no formato YAML (concebido para parseamento de máquina, validação de segurança e injeção de dependências) seguido por corpo de texto em Markdown (destinado à compreensão e execução pelo Large Language Model - LLM). No ambiente do Cursor, bem como noutros motores compatíveis com a norma, estas skills residirão sob uma estrutura de diretórios baseada no princípio da Divulgação Progressiva (Progressive Disclosure) no espaço de trabalho, tipicamente em .cursor/skills/<nome-da-skill>/SKILL.md ou ~/.openclaw/skills/.   

A arquitetura YAML dita as regras de engajamento do agente e assegura que a habilidade não seja ativada caso os pré-requisitos ambientais falhem. O design do Frontmatter para as habilidades principais deste projeto inclui validações rigorosas.

Campo YAML (Frontmatter)	Tipo de Dado	Propósito Arquitetural e Comportamental na Sustentação TI
name	String	
Identificador único da skill (e.g., servicenow-queue-monitor). Determina a sintaxe de comando manual (e.g., /skill servicenow-queue-monitor) e a sua indexação interna.

description	String	
Extremamente crítico; limitado a 1024 carateres. Define não apenas o que a skill opera, mas especifica as condições sob as quais o LLM deve acioná-la de forma autónoma durante uma conversação semântica.

metadata.openclaw.requires.env	Array de Strings	
Lista estrita de variáveis de ambiente obrigatórias (e.g., SNOW_INSTANCE_URL, SNOW_OAUTH_CLIENT_ID, MS_GRAPH_TENANT_ID). O agente ignora a ativação da skill se estas variáveis estiverem ausentes no hospedeiro, prevenindo falhas de execução e alucinações de credenciais.

metadata.openclaw.requires.bins	Array de Strings	
Binários do sistema operativo exigidos para a execução (e.g., curl, node, gh). Garante que a infraestrutura local (ou o contentor Sandbox) suporta os processos adjacentes que a skill pretende despachar.

metadata.openclaw.always	Booleano	
Quando definido como true, a habilidade é injetada permanentemente no contexto do agente, ignorando portões de elegibilidade dinâmicos. Deve ser usado com extrema precaução para evitar a inflação do consumo de tokens.

  
A mecânica de precedência de carregamento destas skills assegura que as definições de projeto local sobreponham as globais. Por exemplo, uma skill alojada em <workspace>/skills/ possuirá primazia de execução sobre uma homónima localizada globalmente em ~/.openclaw/skills/ (Managed Skills) ou nas incluídas de fábrica (Bundled Skills). Esta arquitetura em camadas permite que uma equipa corporativa defina skills genéricas de acesso ao ServiceNow a nível global, enquanto projetos individuais instanciam substituições (overrides) para manipular filas de incidentes específicas.   

Análise Prática e Referencial: A Skill servicenow-docs
A investigação requisitou uma análise minuciosa da referência comunitária https://clawhub.ai/thesethrose/skills/servicenow-docs, criada pelo arquiteto Seth Rose e publicada no repositório de agentes ClawHub. Embora o acesso direto a repositórios de metadados específicos possa ser bloqueado intermitentemente por firewalls ou políticas de remoção, a engenharia reversa das discussões comunitárias, dos diários de atualização (changelogs) e dos metadados expostos no mercado fornece uma compreensão cristalina da sua relevância arquitetural.   

A skill servicenow-docs foi desenhada para atuar como uma ponte epistemológica (um motor de Retrieval-Augmented Generation - RAG) para o agente de IA. Em vez de se limitar a realizar operações de leitura e escrita (CRUD) na base de dados do ServiceNow, esta skill pesquisa ativamente a documentação oficial da plataforma (através do domínio docs.servicenow.com utilizando o indexador Zoomin) e a documentação avançada para programadores em developer.servicenow.com. A mestria desta abordagem de design reside no seu particionamento de responsabilidades: o autor publicou no mercado uma skill inteiramente separada denominada servicenow-agent (destinada a modificar registos de incidentes) e a isolou da servicenow-docs (destinada puramente à pesquisa de conhecimento e APIs).   

Para o projeto de sustentação de TI que estamos a construir, a lição extraída é inestimável e traduz-se em dois princípios fundamentais de engenharia de skills:

Separação de Preocupações (Separation of Concerns): A automação não deve possuir uma skill monolítica "Gerir ServiceNow". Tal prática incharia a janela de contexto do LLM com instruções irrelevantes, diminuindo a precisão analítica. A arquitetura exigirá a criação modular de servicenow-poll-incidents (para polling a cada 2 minutos), servicenow-tag-incident (focada unicamente na classificação semântica) e servicenow-knowledge-retrieval (para ler artigos da Base de Conhecimento interna antes de redigir respostas aos utilizadores).   

Autocorreção Dinâmica Baseada em Documentação: Se a API do ServiceNow reportar um erro devido a uma migração de versão interna (e.g., da versão Washington DC para Xanadu) que altere o esquema de dados, o agente tem a capacidade de recorrer à skill de documentação para pesquisar a anomalia em tempo real (via RAG), ler os manuais do programador atualizados e reajustar o seu próprio payload HTTP dinamicamente, garantindo uma resiliência sistémica ímpar.   

O mercado de skills (ClawHub) demonstra que as abstrações de maior sucesso, como a tavily-web-search (pesquisa estruturada sem interfaces visuais) ou a github (interação avançada via CLI nativa gh), partilham esta mesma modularidade, delegando as operações a ferramentas de terminal comprovadas em vez de forçar o LLM a gerar scripts Python frágeis em tempo real. O nosso projeto integrará padrões semelhantes, usando curl e SDKs robustos pré-compilados geridos pelo CLI do Cursor.   

Boas Práticas e a Prevenção do Caos Comportamental
A construção de skills em Markdown introduz desafios arquiteturais altamente específicos. Modelos de IA podem divergir dos seus objetivos primários (um fenómeno conhecido como Agent Drift) ou encurralar-se em loops infinitos (onde uma ferramenta chama outra de forma circular perante um erro persistente). A mitigação destes cenários exige a redação de diretrizes explícitas e definitivas na secção de regras do SKILL.md:   

Proibição Absoluta de "Guesses" (Achismos): A instrução Markdown deve conter cláusulas de barreira estritas. O guia de desenvolvimento de skills prescreve sintaxes como: "If no commits/incidents are found, say so — don't make things up" (Se nenhum incidente for encontrado na pesquisa, declare isso explicitamente — não invente dados sintéticos para satisfazer o fluxo).   

Limitação e Paginação de Escopo de Retorno: A skill que consulta o ServiceNow deve obrigar a uma filtragem draconiana do retorno da API REST para evitar a saturação do limite de tokens de contexto da janela do Cursor. O uso do parâmetro sysparm_limit=10 e a restrição de extração de colunas via sysparm_fields (retornando estritamente os campos sys_id, number, short_description, caller_id e sys_updated_on) são mandatórios, impedindo que centenas de campos não utilizados inundem a memória de curto prazo da IA.   

Sanitização da Interface de Saída: O agente deve ser instruído a formatar os resultados do relatório numa estrutura de dados limpa ou numa interface concisa, evitando que a sua própria narração interna ("Thinking about the next steps...", comum em modelos de raciocínio profundo) seja encaminhada para a resposta de visualização final que o analista de TI irá ler.   

Orquestração, Consulta e Integração Avançada com ServiceNow
O ServiceNow, operando como a espinha dorsal (Source of Truth) corporativa para ITSM, exige que a interação via agentes de IA seja realizada através de manipulações precisas da sua Table API baseada em REST, prestando particular atenção às idiossincrasias do esquema relacional de bases de dados da plataforma. O sucesso desta automação reside na precisão com que o agente formula os pedidos de rede e gere os estados dos incidentes.   

Polling Contínuo de Incidentes Não Atribuídos (Ciclo de 2 Minutos)
A interface do agente (potenciada por um daemon local, cron job ou um event loop assíncrono em Node.js gerido pelo ambiente do projeto Cursor) será configurada para disparar autonomamente a skill de monitorização de filas a intervalos estritos de dois minutos.   

O endpoint de consulta acede à Table API direcionada à tabela primária incident. Para assegurar a máxima eficiência computacional e garantir que o agente não consome largura de banda a avaliar chamados irrelevantes ou já atribuídos a especialistas (evitando conflitos de concorrência e race conditions), o payload da requisição (URL Query String) utilizará a gramática de filtragem nativa do ServiceNow (sysparm_query) de forma altamente otimizada:   

GET /api/now/table/incident?sysparm_query=assigned_toISEMPTY^active=true^sys_updated_on>javascript:gs.minutesAgo(2)&sysparm_limit=20&sysparm_fields=sys_id,number,short_description,caller_id

Esta construção lógica, que combina assigned_toISEMPTY com o estado active=true e restringe a janela temporal de atualização aos últimos 120 segundos através da função interna javascript:gs.minutesAgo(2), confina perfeitamente o espetro de visão do agente exclusivamente aos novos eventos pendentes de triagem ou a incidentes cuja inatividade exige uma reavaliação de estado.   

O Paradoxo do Tagueamento e a Estrutura M:N (sys_tags)
Uma das exigências funcionais imperativas estipuladas no briefing do projeto é a classificação orgânica dos incidentes através da aplicação de tags estruturadas. No entanto, esta operação esbarra num obstáculo técnico profundo e frequentemente não documentado na arquitetura de superfície da plataforma, o qual derruba inúmeras integrações ingénuas: o campo sys_tags (visível nas grelhas da interface de utilizador do incidente) não é um campo físico armazenado diretamente na tabela incident. Tratando-se de um campo não persistente (derivado e calculado a partir de um relacionamento Muitos-para-Muitos), o serializador nativo da API REST não o processa em operações diretas de alteração de estado da linha.   

Se o agente CLI tentar executar ingenuamente uma requisição genérica de PUT ou PATCH diretamente no URI da tabela incident para atualizar o atributo sys_tags, a operação falhará silenciosamente, reportando uma resposta HTTP 200/201 (indicando sucesso), mas sem criar a relação efetiva no sistema, não procedendo inclusivamente à atualização da data e hora de modificação do próprio incidente (sys_updated_on).   

A solução arquitetural definitiva, que deve ser exaustivamente codificada nos documentos SDD (plan.md e tasks.md) para instruir a escrita da skill servicenow-tag-incident, envolve a manipulação direta e explícita da tabela de intersecção oculta label_entry (ou a chamada alternativa via data_table.do com o utilitário GlideLabelUtil):   

O procedimento do agente subdivide-se nas seguintes operações em rede:

Resolução Criptográfica (Obtenção do Sys ID da Tag): O agente consulta primeiro a tabela de dicionário label para recuperar o sys_id correspondente à tag de classificação semântica que a análise LLM determinou (e.g., procurar pela tag "Falha_Seguranca_Rede").   

Criação do Vínculo Relacional (Label Entry): O agente executa um método HTTP POST para o endpoint relacional /api/now/table/label_entry.   

Estrutura de Payload Mandatória (POST):

JSON
{
  "label": "4f1094ff13162600973e70d66144b033",
  "table": "incident",
  "table_key": "0d97240e13aca600973e70d66144b03f",
  "title": "Incident - INC0010018"
}
Nesta estrutura, o campo label recebe o identificador da tag, e o table_key recebe o identificador único (sys_id) do incidente original.   

Esta especificidade sublinha de forma incontestável a importância crítica da metodologia Spec-kit: se o LLM generativo do Cursor fosse instruído de forma lata (apenas através de um prompt indicando "adicione uma tag ao incidente via API"), a probabilidade de falha algorítmica ou código erróneo seria quase garantida. Ao forçar a formalização no plan.md, a inteligência coletiva documentada previne que a automação gaste horas em processos de depuração improdutivos.   

Resolução Direta de Incidentes e Atualizações Autónomas
Quando a avaliação semântica e contextual da descrição e dos metadados do incidente corresponder, com um limiar de confiança excecionalmente alto, a um Procedimento Operacional Padrão (SOP) previamente documentado nas bases de conhecimento do agente, o sistema acionará automaticamente a contingência de resolução.   

Este fluxo envolverá um encadeamento transacional de chamadas à API:

Executar um PATCH na Table API correspondente ao URI /api/now/table/incident/<sys_id>.   

Atualizar o campo assigned_to assumindo a propriedade do incidente, preenchendo-o com o Sys ID do próprio utilizador de integração API (Service Account) associado ao agente.   

Modificar o state do incidente para um código que traduza o estado Resolved (Resolvido).

Fornecer anotações compreensivas no close_notes e definir o close_code. A formatação deve refletir claramente a natureza robótica da intervenção, como por exemplo: "Resolvido autonomamente pelo Sistema de IA Integrado (Cursor). Acionada a contingência padrão de reinício do serviço X. Parâmetros de diagnóstico anexados.".   

Comunicação Proativa e Integração Estruturada via Microsoft Teams
Um dos vetores de valor mais significativos deste projeto de sustentação consiste na sua capacidade de interromper o ciclo vicioso de escalada prematura para analistas de Nível 2 e Nível 3, atuando na completude das informações antes de qualquer intervenção humana. Frequentemente, os chamados submetidos carecem de informações básicas ("O sistema caiu", "Não consigo aceder ao portal"). O agente, equipado com capacidades de leitura semântica, identificará prontamente a ausência de campos críticos de depuração e, sem intervenção manual, iniciará um processo de investigação (outreach) direto com o utilizador via Microsoft Teams.   

O Paradigma Complexo de Mensagens Proativas
O desenvolvimento convencional de bots no ecossistema Teams assume, em larga escala, um fluxo puramente reativo: o utilizador envia uma mensagem inicial para o bot, estabelecendo um contexto, e o bot responde no âmbito desse mesmo ciclo. O caso de uso exigido por este projeto inverte o fluxo; requer a implementação de Mensagens Proativas (Proactive Messaging). Para que o agente (despachando operações a partir da CLI) envie uma notificação de forma autónoma a um utilizador que não solicitou contacto direto anterior, o sistema necessita orquestrar uma lógica de roteamento intrincada através do Microsoft Bot Framework SDK (utilizando implementações em Node.js).   

Para consumar o envio, o agente deve recuperar previamente a chave de roteamento fundamental (a conversationReference) de uma base de dados interna, ou, na sua ausência, ser capaz de criar dinamicamente e de raiz uma nova sessão de conversação um-para-um (1:1) utilizando o identificador de utilizador aadObjectId (ID extraído do Microsoft Entra ID / Azure AD), o tenantId e o serviceUrl. O fluxo técnico envolve invocar a rotina nativa CreateConversationAsync() (ou o seu equivalente assíncrono em JavaScript) no escopo de aplicação pessoal.   

Uma regra de negócio vital, que deve estar obrigatoriamente declarada no constitution.md, é a gestão graciosa de falhas de entrega. Se as permissões do bot no tenant corporativo não permitirem envios proativos cruzados (cross-tenant sideloading) ou se o bot não estiver instalado, a API do Graph responderá com um código 403 ForbiddenOperationException (ou o sub-código MessageWritesBlocked). A automação deve possuir rotinas de resiliência que capturem imediatamente a exceção e executem um fallback (e.g., adicionar um comentário à fila de diário work_notes do ServiceNow solicitando detalhes por via eletrónica tradicional), garantindo que os Acordos de Nível de Serviço (SLA) não são corrompidos por falhas de integração chat-bot.   

Cartões Adaptativos Dinâmicos (Adaptive Cards) e Tempos de Resposta
A recolha de dados por parte do utilizador não deve, sob qualquer justificação arquitetural, ser feita através de mensagens de texto não estruturado (plain text). Respostas em texto livre encorajam a ambiguidade e forçam o processamento pesado e dispendioso por parte do LLM para a extração de entidades. Como solução técnica otimizada, o sistema integrará Adaptive Cards (Cartões Adaptativos). Estes artefactos renderizam interfaces ricas, nativas e responsivas diretamente na janela do cliente Teams, sendo alimentados por pacotes de dados puramente declarativos em JSON.   

Os Adaptive Cards oferecem a capacidade de incorporar formulários leves e interativos na interface do chat (e.g., listas suspensas que obrigam à seleção do ambiente de falha, botões de ação binária, ou matrizes de preenchimento para registos de erro).   

Características críticas e restrições obrigatórias no design da integração de Cartões Adaptativos para este projeto de sustentação:

Implementação de Ação Universal (Action.Execute): O desenvolvimento moderno no Teams pretere o antigo comando Action.Submit. Em sua substituição, o projeto deve arquitetar os formulários em torno do comando Action.Execute. Esta ação consolida a submissão de dados e suporta nativamente um modelo de requisição-resposta síncrono e bidirecional muito mais robusto, comunicando de forma integrada com a skill de processamento na CLI.   

Propriedade de Atualização Automática Dinâmica (Auto-Refresh): A natureza de um incidente de TI é intrinsecamente transitória. Para evitar a dessincronização visual onde um utilizador submete informações num cartão sobre um incidente que já foi fechado por um colega noutro departamento, a arquitetura deve utilizar vistas baseadas no utilizador (user-specific views) associadas à propriedade de refresh ativada para instâncias em conversas partilhadas (aplicável em grupos com limite máximo de 60 utilizadores suportados pela funcionalidade).   

O Desafio do Timeout (504 Gateway Timeout) em Processos de IA Longos: Um dos desafios técnicos mais nevrálgicos aquando da receção do payload via Action.Execute é o limite temporal. O serviço do Teams Bot Framework exige o retorno de uma resposta HTTP de confirmação (invoke response) no prazo crítico de 10 a 15 segundos no máximo. Processos complexos baseados em IA que envolvem a recolha da resposta do utilizador, a inferência por um modelo LLM externo, e uma eventual chamada secundária de alteração de estado no ServiceNow excederão rotineiramente este limite. Se o agente da CLI retiver a thread para executar o pensamento e bloqueios de I/O, o utilizador verá a falha genérica na interface ("Something went wrong. Please try again"). O documento de engenharia do projeto (tasks.md) dita impreterivelmente que o microsserviço de interceção web deve retornar imediatamente um código HTTP 200 OK (desbloqueando a interface do utilizador) e delegar a inferência pesada num processamento background assíncrono. A confirmação final deve ser posteriormente expedida recorrendo a uma atualização reativa da atividade (updateActivity) ou à emissão de uma nova mensagem proativa.   

Tipo de Ação Teams	Suporte Adaptativo	Comportamento e Aplicação no Projeto
Action.Submit	Descontinuado / Legado	
Envia dados ao bot, contudo lida precariamente com caixas de diálogo dinâmicas; não recomendado.

Action.Execute	Suportado (Universal)	
Submete dados, permite gatilhos de atualização automática de cartão (Auto-Refresh) e adapta-se a modelos assíncronos.

imBack	Suportado	
Injeta o texto simulando que o utilizador digitou a mensagem. Útil para respostas de um clique de concordância rápida.

  
Segurança, Governança e a Prevenção da Exploração de Agentes
Ao deslocar a responsabilidade de orquestração empresarial e resolução de infraestrutura de sistemas determinísticos monolíticos (como MuleSoft ou n8n, onde as rotas são estaticamente configuradas) para um ecossistema fluido de Interfaces de Linha de Comando (CLI) operadas de forma heurística por Agentes LLM (via Cursor), as organizações expandem maciçamente a sua superfície de ataque. Agentes que possuem credenciais, manipulam ficheiros em disco, orquestram o terminal e abrem instâncias de navegadores representam alvos de altíssimo valor na cadeia de ameaças.   

O Vetor de Ataque SKILL.md e o Risco de Injeção de Markdown
Historicamente, nas operações de TI e DevOps, os ficheiros Markdown (.md) eram tratados exclusivamente como dados de texto plano inertes, imunes à injeção de código executável que flagela scripts de linguagem. Contudo, na era das skills formatadas de agentes integradas em plataformas como o OpenClaw e o Cursor, o conteúdo do SKILL.md ascendeu à categoria de um próprio plano interpretativo de execução.   

Isto significa, sem margem para erro analítico, que um ficheiro mal estruturado, intercetado por atores maliciosos ou descarregado de um repositório comunitário comprometido (como o ClawHub) pode induzir, por manipulação de prompt inerente (Prompt Injection), o agente a evadir as suas restrições operacionais. Investigações recentes de cibersegurança nos mercados de IA revelaram que as habilidades mais descarregadas têm funcionado, por vezes, como veículos avançados de distribuição de malware (Infostealers). Agentes maliciosos encodificam cargas destrutivas nos blocos de instrução em Markdown, induzindo o agente local a invocar o terminal, exfiltrar sessões ativas de browser (cookies de sessão Cloud), despejar variáveis de ambiente que contenham chaves de API secretas corporativas e roubar configurações de SSH, transferindo todo o espólio silenciosamente para nós de rede de comando e controlo externos. Se o agente na CLI tiver privilégios de administrador de rede e utilizar uma skill corrompida importada de fontes de terceiros, a cascata de comprometimento corporativo é severa e de contenção morosa.   

Controlos de Mitigação Arquitetural Exigidos
Para garantir a operação estanque e segura do projeto de automação de sustentação de produtos de TI, a adoção imediata das seguintes políticas, a implementar no plan.md e a ratificar na constitution.md, é inegociável:   

Sandboxing e Acesso Restrito Baseado em Função: A CLI operada pelo Cursor deve ser hospedada num ambiente fortemente contido, seja este um contentor Docker dedicado, um servidor virtual sem estado persistente ou instâncias isoladas através da tecnologia NanoClaw, que assegura o particionamento isolado da execução e auditoria integral da memória. Paralelamente, o agente deve conectar-se à API do ServiceNow utilizando exclusivamente uma conta técnica restrita aos princípios do privilégio mínimo (Least Privilege); a conta apenas terá permissão de leitura sobre a tabela de incidentes em filas restritas e de modificação de estado de campos estritamente definidos através de Listas de Controlo de Acesso (ACLs) do ServiceNow.   

Princípio de Confiança Zero para Execução de CLI (Zero-Trust Exec): O agente não deve operar num paradigma de autonomia irrestrita de leitura/escrita na máquina hospedeira ("Run Everything"). Todas as alterações automáticas nos ficheiros SKILL.md ou nos hooks de ciclo de vida (hooks.json) e todas as aprovações de invocação de binários (Exec approvals) através de ferramentas do tipo shell (bash ou zsh) devem estar configuradas em modo de aprovação explícita (Ask Every Time), ou rigorosamente filtradas através de listas brancas (allowlists), garantindo que comandos perigosos sejam barrados liminarmente e requeiram validação humana.   

Gating Rigoroso e Prevenção de Código Hardcoded: Nenhum script gerado ou descarregado associado ao agente terá autorização para conectar-se de forma estática às instâncias corporativas do ServiceNow ou Microsoft Teams. A estrutura arquitetural exigirá declarações mandatórias de requires.env dentro do frontmatter YAML da skill. As chaves reais de elevado privilégio (e.g., SNOW_REST_API_KEY, tokens MSAL Microsoft) estarão confinadas nos cofres de gestão de segredos (secrets managers) nativos do Sistema Operativo ou num servidor de configuração encriptado. O provisionamento aos processos em tempo de execução previne falhas críticas de segurança, como gravações acidentais (hardcoding) em mensagens de diário que um LLM pudesse alucinar.   

Scanners de Segurança e Telemetria Antecipada: Antes da importação sistemática de qualquer pacote ou skill baseada na comunidade (incluindo repositórios respeitados no ClawHub que facilitem a RAG), o código-fonte deve estar integrado numa conduta (pipeline) de testes. O sistema deve acoplar a análise reputacional de serviços como o VirusTotal (agora nativo no mercado ClawHub) a verificadores rigorosos em tempo real de infraestrutura LLM (tais como ferramentas open-source do tipo Snyk Skill Security Scanner ou ClawVet). Estes subprogramas executam múltiplas passagens estáticas em código puro, em busca ativa por vetores escondidos de injeção de prompts, lógicas suspeitas de exfiltração remota, esquemas de typosquatting na alocação das bibliotecas NPM e vulnerabilidades RCE (Remote Code Execution) incorporadas de forma enganadora nas declarações Markdown.   

Conclusão e Perspetivas Operacionais
A idealização e subsequente estruturação formal de um projeto de automação direcionado para a sustentação crítica de produtos de TI transcende a elaboração utilitária de simples scripts reativos, consolidando-se como a implementação fundamental de uma verdadeira arquitetura cognitiva escalável de operações unificadas. O paradigma técnico desenhado e orquestrado interliga, com precisão cirúrgica, o planeamento determinístico rigoroso imposto pelas metodologias contemporâneas do Spec-kit (assente primordialmente num modelo governativo que exige constituições imutáveis de projeto, delimitação hermética das fases em memórias textuais distintas e tarefas processáveis independentes), em consonância com as formidáveis e exponenciais capacidades de execução de agentes autónomos através da CLI do Cursor, profundamente nutridas e expandidas pelo ecossistema universal de Skills declarativas de metadados rígidos (inspirados e padronizados pelos ambientes integrados como o ClawHub).   

O êxito operacional pragmático deste colossal motor autónomo não repousa na simples geração estocástica de texto, mas antes na capacidade programática de compreender as nuances arquiteturais idiossincráticas dos ambientes empresariais complexos. A compreensão estrutural avançada de que a manipulação de filas no ServiceNow obriga incontornavelmente ao uso de filtros codificados por via de sysparm_query conjugado com funções temporais (sys_updated_on>javascript:gs.minutesAgo()) para otimizar os ciclos de varrimento de memória (polling sem exaustão dos limiares de taxa), e que a atribuição de tags operacionais não é uma manipulação genérica de campos superficiais das tabelas, mas antes o preenchimento vetorial preciso na tabela adjunta de relacionamento label_entry (em oposição às chamadas ingénuas destinadas falhamente aos metadados agregados sys_tags), representa a fronteira arquitetural que delimita a taxa de mortalidade esmagadora da maioria dos projetos conceptuais baseados em IA.   

De forma simbiótica, a extensão tecnológica de triagem interativa na plataforma Microsoft Teams impõe metodologias proativas e estritamente contidas (via o método revolucionário de submissão Action.Execute associado inerentemente aos Adaptive Cards flexíveis, limitados no seu contexto estático assíncrono para colmatar perfeitamente as barreiras das expirações transacionais Gateway Timeout). Esta integração não mitiga apenas a omissão crónica de dados qualitativos ou de clareza informacional no suporte ao utilizador baseada nos canais reativos convencionais, mas consagra igualmente uma alteração tectónica da experiência laboral; convertendo engarrafamentos de suporte morosos que estagnariam dias sem resposta em avaliações fluídas, padronizadas, semânticas, sem atrito e liquidadas em questão de segundos.   

Em última instância, desde que devidamente salvaguardado por mecanismos coercivos imponentes ao nível da rede que isolem rigorosamente falhas e imponham políticas imperativas baseadas no modelo (incluindo controlos inquebráveis sobre binários dependentes, barreiras estatais rigorosas de credenciais seguras e defesas profundas preventivas ativas para esterilizar as complexidades e artimanhas ocultas nos metadados executáveis injetados no formato Markdown), este agente de terminal inteligente atuará não como um auxiliar invisível de processos ou de mera catalogação de filas mortas, mas, com a totalidade da sua conceção orgânica, como um efetivo parceiro de escalada de primeiro plano. Deste modo, devolve-se às equipas humanas de desenvolvimento o ativo mais inestimável em ecossistemas empresariais — a alocação de tempo cognitivo qualificado virada para a refatoração, engenharia de confiabilidade do site (SRE) e inovação contínua do produto base e sistemas associados.   


SDD+MCP
Abre em uma nova janela

support.servicenow.com
The unassigned incidents are displayed in Assigned Incidents Applet on Mobile Agent App
Abre em uma nova janela

servicenow.com
API to use for getting open tickets of any configuration item - ServiceNow
Abre em uma nova janela

servicenow.com
Create Incident with new tag or tags using the API - ServiceNow Community
Abre em uma nova janela

learn.microsoft.com
Teams Adaptive Card Views - Code Samples - Microsoft Learn
Abre em uma nova janela

learn.microsoft.com
Adaptive Cards Overview - Microsoft Learn
Abre em uma nova janela

learn.microsoft.com
Add card actions in a bot - Teams - Microsoft Learn
Abre em uma nova janela

matsen.fhcrc.org
Spec-Driven Development with spec-kit - Matsen Group
Abre em uma nova janela

github.github.com
Spec Kit Documentation - GitHub Pages
Abre em uma nova janela

innfactory.ai
The OpenClaw Ecosystem 2026: NVIDIA NemoClaw, NanoClaw, ClawHub & The IT Leader's Guide - innFactory AI Consulting
Abre em uma nova janela

bibek-poudel.medium.com
The SKILL.md Pattern: How to Write AI Agent Skills That Actually Work | by Bibek Poudel
Abre em uma nova janela

1password.com
From magic to malware: How OpenClaw's agent skills become an attack surface | 1Password
Abre em uma nova janela

github.blog
Spec-driven development with AI: Get started with a new open source toolkit - The GitHub Blog
Abre em uma nova janela

martinfowler.com
Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl - Martin Fowler
Abre em uma nova janela

github.com
GitHub - github/spec-kit: Toolkit to help you get started with Spec-Driven Development
Abre em uma nova janela

github.com
spec-kit/templates/commands/constitution.md at main - GitHub
Abre em uma nova janela

github.com
Constitution template should be in .specify/templates/ to prevent overwrites during reinitialization · Issue #1541 · github/spec-kit
Abre em uma nova janela

servicenow.com
Create an incident record - ServiceNow
Abre em uma nova janela

learn.microsoft.com
Send proactive messages - Teams | Microsoft Learn
Abre em uma nova janela

servicenow.com
Adding Tags to an Issues Does Not Update sys_updated_on - ServiceNow
Abre em uma nova janela

lumadock.com
How to build custom OpenClaw skills with SKILL.md - LumaDock
Abre em uma nova janela

github.com
plan-template.md - github/spec-kit
Abre em uma nova janela

github.com
spec-kit/templates/commands/plan.md at main - GitHub
Abre em uma nova janela

github.com
spec-kit/docs/guides/evolving-specs.md at main - GitHub
Abre em uma nova janela

github.com
spec-kit/templates/commands/plan.md at main - GitHub
Abre em uma nova janela

kimi.com
How to Use Skills in Cursor: A Practical Guide - Kimi AI
Abre em uma nova janela

findskill.ai
OpenClaw Skills: The Complete Guide to Installing, Building, and Securing Custom Skills
Abre em uma nova janela

datacamp.com
The Top 100+ Agent Skills For OpenClaw, Codex and Claude | DataCamp
Abre em uma nova janela

github.com
skill-format.md - openclaw/clawhub - GitHub
Abre em uma nova janela

docs.openclaw.ai
Skills - OpenClaw Docs
Abre em uma nova janela

docs.openclaw.ai
Creating skills - OpenClaw Docs
Abre em uma nova janela

docs.openclaw.ai
Skill format - OpenClaw Docs
Abre em uma nova janela

answeroverflow.com
Thanks mate! My biggest blocker is handoffs between agents Doesn't work on telegram I guess it w - Friends of the Crustacean
Abre em uma nova janela

clawhub.ai
Abre em uma nova janela

aiskill.market
Documentation & Writing - AI Skill Market
Abre em uma nova janela

github.com
awesome-openclaw-skills/README.md at main - GitHub
Abre em uma nova janela

servicenow.com
API da tabela - ServiceNow
Abre em uma nova janela

clawhub.ai
ClawHub
Abre em uma nova janela

datacamp.com
Melhores skills do ClawHub: guia completo - DataCamp
Abre em uma nova janela

servicenow.com
Tokyo_Student_Resource.docx - ServiceNow
Abre em uma nova janela

servicenow.com
Table API - ServiceNow
Abre em uma nova janela

servicenow.com
Not geeting sys_tags field value through Rest API Explorer - ServiceNow
Abre em uma nova janela

stackoverflow.com
Service Now add tag to incident through rest api - Stack Overflow
Abre em uma nova janela

servicenow.com
Add tags to incident from Rest Api - ServiceNow Community
Abre em uma nova janela

help.upguard.com
ServiceNow Incident Integration - Advanced Features - UpGuard
Abre em uma nova janela

receiptroller.co
Proactive Messaging｜Mastering Microsoft Teams Bots 4.2
Abre em uma nova janela

learn.microsoft.com
Teams Developer Documentation Tutorials - Microsoft Learn
Abre em uma nova janela

github.com
Unauthorized Exception when sending Pro-active Messages / Welcome Card · Issue #1808 · OfficeDev/Microsoft-Teams-Samples - GitHub
Abre em uma nova janela

adaptivecards.io
Adaptive Cards
Abre em uma nova janela

learn.microsoft.com
Implementing User-Specific Dynamic Adaptive Cards with Auto-Refresh and Microsoft 365 Copilot Integration for Personalized Task Management
Abre em uma nova janela

learn.microsoft.com
Teams app ：adaptive card showing a message "Something went wrong. Please try again"
Abre em uma nova janela

cursor.com
Subagents, Skills, and Image Generation - Cursor
Abre em uma nova janela

github.com
AIPMAndy/awesome-openclaw-skills-CN - GitHub
Abre em uma nova janela

cursor.com
Cursor Marketplace | Cursor Plugins
Abre em uma nova janela
