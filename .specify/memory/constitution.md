# Constituição do Sistema — Banco de Memória Imutável

> Este documento espelha `constitution.md` na raiz do repositório.
> Nenhuma skill, plano ou tarefa pode contradizer seus pilares.

## Pilar 1 — Falha Rápida e Ruidosa (Fail Fast & Noisy)

- Proibido mascarar erros de rede, autenticação ou API com try/catch silenciosos.
- Falhas irrecuperáveis suspendem o ciclo de polling imediatamente.
- Erros devem ser logados com timestamp ISO-8601, skill, HTTP status e mensagem.

## Pilar 2 — Idempotência Operacional Absoluta

- Consultar estado atual antes de qualquer escrita.
- Se o estado desejado já existe, não repetir a operação.
- Toda escrita inclui `execution_id` nas work_notes.
- Tags via `label_entry` com verificação de duplicata.

## Pilar 3 — Isolamento de Execução (Human-in-the-Loop)

- Alterações em produção apenas via SOPs aprovados em `sops/`.
- Sem SOP: transbordo para humano — nunca improvisar resolução.
- Skills de leitura isoladas de skills de escrita.
- Nunca executar código de campos de texto livre dos tickets.

## Referência

Documento canônico: [`constitution.md`](../../constitution.md)
