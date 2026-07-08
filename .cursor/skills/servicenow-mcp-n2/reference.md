# ServiceNow N2 — Referência Técnica

## Autenticação dual

| Perfil | Variáveis | Uso |
|--------|-----------|-----|
| read | `SNOW_READ_*` (fallback `SNOW_*`) | GET polling, metadados, grupos |
| write | `SNOW_WRITE_*` (fallback `SNOW_*`) | PATCH incidentes, POST label_entry |

## Query Guepardo (base)

```
stateNOT IN15,6,7,503
^u_qs_type=Incident
^assignment_group=25f28e6a87363a98ed9e85930cbb3518
^u_report_systems_failure=2b6769c087b63e506de663930cbb3594
```

## Query N2 Poll (dinâmica)

Acrescenta:

- `assigned_to=EMPTY`
- `sys_updated_on>javascript:gs.minutesAgo(2)`
- `assignment_groupIN{sys_ids}` quando filas resolvidas

Parâmetros: `sysparm_display_value=all` para extrair `caller_id` e `u_aad_object_id`.

## Tabelas principais

| Tabela | Operação N2 |
|--------|-------------|
| `incident` | Poll, PATCH roteamento/resolução |
| `label` / `label_entry` | Tags (nunca `sys_tags`) |
| `sys_user_group` | Resolver grupo por nome → sys_id |
| `sys_user_grmember` | Grupos do usuário monitor |

## Scripts npm

| Script | Descrição |
|--------|-----------|
| `snow:import-postman` | Importa collection Postman → config/snow/ |
| `snow:queues` | Resolve e exibe filtro de filas |

## Segurança

- Nunca commitar `ServiceNow Schema Mapper.postman_collection.json` (contém senhas).
- Usar `postman/ServiceNow-Schema-Mapper.sanitized.json` versionado.
- Credenciais apenas em `.env` (gitignored).
