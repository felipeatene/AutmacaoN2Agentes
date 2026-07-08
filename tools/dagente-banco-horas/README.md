# DaGente Banco de Horas Tool

Tool Python compatível com **LangChain** para consultar o saldo de banco de horas do portal [DaGente](https://dagente.localiza.com) via linguagem natural em um chat com IA.

## Pré-requisitos

- **Python 3.10+**
- Conta corporativa Localiza (Microsoft Entra ID + MFA)
- Credenciais Apigee (`APIGEE_CLIENT_SECRET`) ou token manual temporário

```bash
cd tools/dagente-banco-horas
pip install -e ".[dev]"
```

Dependências principais: `msal`, `requests`, `langchain-core`.

## Ações humanas necessárias

Antes da primeira execução, são necessários passos que **não podem ser automatizados**:

1. **Registrar redirect URI no Azure AD**
   - Solicitar ao time de Identity/Segurança o registro de:
     `http://localhost:8400/auth-callback`
   - No App Registration do DaGente (`dcd4a76f-f189-495f-a6f4-87fb1c63bd76`) ou em um app dedicado para desenvolvimento.

2. **Obter `APIGEE_CLIENT_SECRET`**
   - Solicitar ao time de APIs o client secret do Apigee.
   - Alternativa temporária: capturar token opaco do navegador e definir `APIGEE_MANUAL_TOKEN`.

3. **Login Microsoft na primeira execução**
   - O navegador abrirá para autenticação com e-mail/senha corporativa + MFA.
   - Apenas na primeira vez; depois o refresh token renova automaticamente.

4. **Aceite de consentimento dos scopes**
   - Na primeira autenticação, aceitar as permissões solicitadas pelo app.

## Configuração

```bash
cp .env.example .env
# Editar .env com credenciais reais
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `APIGEE_CLIENT_SECRET` | Preferencial | Secret para client_credentials no Apigee |
| `APIGEE_CLIENT_ID` | Não | Default: `03b27e5b1c9bd889e014043831d17785` |
| `APIGEE_MANUAL_TOKEN` | Fallback | Token opaco capturado do navegador |
| `DAGENTE_REDIRECT_URI` | Não | Default: `http://localhost:8400/auth-callback` |
| `DAGENTE_HTTP_TIMEOUT` | Não | Timeout HTTP em segundos (default: 30) |
| `DAGENTE_DEBUG` | Não | `1` para logs DEBUG |
| `DAGENTE_CACHE_DIR` | Não | Diretório de cache (default: `~/.dagente_cache`) |
| `DAGENTE_USE_KEYRING` | Não | `1` para ler secret do keyring do SO |

## Uso standalone (CLI)

```bash
# Primeiro login (abre navegador + MFA)
dagente-banco-horas login

# Listar contas em cache (multi-usuário)
dagente-banco-horas accounts

# Consultar banco de horas
dagente-banco-horas banco-horas
dagente-banco-horas banco-horas --json
dagente-banco-horas banco-horas --account-hint usuario@localiza.com
```

Equivalente via módulo:

```bash
python -m dagente_banco_horas.cli login
python -m dagente_banco_horas.cli banco-horas --json
```

## Uso como biblioteca

```python
from dagente_banco_horas import DaGenteAuth, parse_banco_horas_response
from dagente_banco_horas.api_client import fetch_banco_horas_raw

auth = DaGenteAuth()
raw = fetch_banco_horas_raw(auth)
result = parse_banco_horas_response(raw)
print(result)
# {'saldo_horas': '12:37', 'sinal': 'positivo', 'data_referencia': '2026-07-08', 'detalhes': {...}}
```

## Integração LangChain

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from dagente_banco_horas import get_banco_horas

llm = ChatOpenAI(model="gpt-4o")
tools = [get_banco_horas]

prompt = ChatPromptTemplate.from_messages([
    ("system", "Você é um assistente RH da Localiza. Responda em português."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

response = executor.invoke({"input": "Quanto tenho de banco de horas?"})
print(response["output"])
```

### Schema OpenAI (sem LangChain decorator)

```python
from dagente_banco_horas import GET_BANCO_HORAS_SCHEMA, get_banco_horas

# Usar GET_BANCO_HORAS_SCHEMA em client.chat.completions.create(tools=[...])
result = get_banco_horas.invoke({})
```

## Fluxo de autenticação

```
Fase A-B  → Login interativo OAuth 2.0 + PKCE (MSAL, abre navegador)
Fase C    → Troca authorization_code por access_token + refresh_token
Fase D    → Token Apigee via client_credentials (ou fallback manual)
Fase E    → GET /rh-portalcolaborador-bff/v1/ponto/banco-horas
Fase F    → Refresh automático quando access_token expira (~1h)
```

## Retorno estruturado

```json
{
  "saldo_horas": "12:37",
  "sinal": "positivo",
  "data_referencia": "2026-07-08",
  "detalhes": { "...payload completo da API..." }
}
```

## Testes

```bash
# Unitários (sem rede)
pytest -m "not integration"

# Integração (requer credenciais e login prévio)
pytest -m integration
```

## Segurança

- **Nunca** commitar `.env`, `~/.dagente_cache/` ou tokens
- Tokens são mascarados em logs (apenas 6 primeiros caracteres)
- Não usar Implicit Flow — apenas Authorization Code + PKCE
- Tokens sempre em headers, nunca em URLs

## Estrutura do pacote

```
src/dagente_banco_horas/
├── auth.py              # DaGenteAuth — Azure AD + Apigee
├── api_client.py        # HTTP com retry e tratamento de erros
├── banco_horas_tool.py  # @tool LangChain get_banco_horas()
├── cli.py               # CLI standalone
├── config.py            # Constantes e env vars
├── logging_utils.py     # Mascaramento de tokens
└── models.py            # BancoHorasResult TypedDict
```
