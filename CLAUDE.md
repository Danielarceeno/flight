# CLAUDE.md

Guia rápido para quem (ou qual IA) for retomar este projeto depois. Não repete o que já está no `README.md` (configuração de secrets, cota, como testar localmente) — vá lá para isso.

## O que é

Monitor de preços de passagem GRU → BKK, focado na Qatar Airways (e na Decolar como vendedora), rodando sozinho via GitHub Actions 3x/dia. Node.js puro, ESM, zero framework. Única dependência de runtime: `nodemailer`.

## Arquitetura (fluxo de dados)

```
config.js (rota/env) ─┐
                       ▼
run.js: runOnce() ──▶ fetchPrices.js ──▶ serpapi.js (chamadas HTTP + parsing)
   │                       │
   │                       └─▶ fetchPrices retorna { qatar, sellers, overall, insights, deepError }
   │
   ├─▶ buildEntry() monta a entrada do histórico (best = menor preço entre Qatar + vendedores)
   ├─▶ alert.js: decide() decide se envia e-mail e por quê (puro, testável sem I/O)
   ├─▶ email.js: buildEmail() + sendEmail() (nodemailer)
   └─▶ history.js: loadHistory/saveHistory em data/history.json

chart.js: lê data/history.json e gera docs/index.html (página estática, sem deps,
          publicável via GitHub Pages). Roda como step separado no workflow.
```

Tudo que decide *se* e *o que* alertar (`alert.js`) é puro — recebe histórico + entrada nova, devolve um objeto `{ alert, kind, ... }`. Isso é o que torna os testes de `tests/alert.test.js` rápidos e sem mocks de rede.

## Módulos (responsabilidade de cada um)

| Arquivo | Responsabilidade |
|---|---|
| `src/config.js` | Lê rota e settings do `process.env`, com defaults. Fonte única da verdade pra qualquer variável de ambiente. |
| `src/serpapi.js` | Cliente HTTP mínimo da SerpApi (`engine=google_flights`) + parsers puros (`cheapestOption`, `cheapestOverall`, `describe`, `sellersFrom`, `operatedBy`). Detecta erro de cota (`isQuotaError`) e nunca deixa a API key vazar numa mensagem de erro. |
| `src/fetchPrices.js` | Orquestra 1 ou 3 chamadas à SerpApi (`deep: true` = manhã) e devolve preço da Qatar, vendedores e o menor preço geral (`overall`, sem busca extra). |
| `src/history.js` | Lê/grava `data/history.json`, com `HISTORY_LIMIT` (1000 entradas) e helpers (`validEntries`, `stats`). |
| `src/alert.js` | `decide()` — única função que decide enviar e-mail ou não. Puro, sem I/O. |
| `src/email.js` | Monta assunto/texto/HTML do e-mail (`buildEmail`) e envia via SMTP (`sendEmail`). |
| `src/util.js` | `brl()` e `esc()` compartilhados entre `email.js` e `chart.js`. |
| `src/chart.js` | `buildChartHtml()` (puro, testável) + CLI que lê o histórico e escreve `docs/index.html`. |
| `src/run.js` | Orquestrador: `runOnce()` (testável, recebe tudo por injeção) e `main()` (CLI real, com `DRY_RUN`). |

## Decisões importantes (porquês que não estão óbvios no código)

- **`decide()` compara com a leitura anterior, não com o mínimo, para o alerta de "queda"** — mas qualquer preço abaixo do mínimo histórico sempre dispara via `new-low`, independente do `%`/`R$` de queda. Ver tabela no README.
- **Entradas com `sendError` não contam como "leitura válida" pra decisão** (`alert.js` filtra `!e.sendError`) — se o e-mail falhou, a próxima coleta reavalia do zero, pra não "perder" um alerta por falha de SMTP.
- **`operatedBy` tem dois critérios**: prefixo do `flight_number` OU nome em `AIRLINE_NAMES[code]` batendo com o campo `airline` da perna — isso cobre codeshares onde o número do voo não começa com `QR` mas a operação é da Qatar.
- **`cheapestOverall` não custa busca extra** — usa a mesma resposta já buscada (`first`), só sem o filtro de companhia. É só contexto no e-mail.
- **O gráfico (`chart.js`) é standalone, sem libs externas** (SVG desenhado via JS vanilla) de propósito: GitHub Pages serve arquivo estático, sem build step, sem dependência de CDN caindo.
- **O commit do histórico/gráfico no workflow usa `if: always()`** — mesmo se a coleta falhar, o histórico (que já registra o erro) e o gráfico são salvos, pra não perder visibilidade de falhas.

## Testes

- `tests/*.test.js` com `node --test` (sem framework externo). `tests/helpers.js` tem os fakes (`fakeFetch`, `entry`) e as fixtures ficam em `tests/fixtures/*.json` (respostas reais da SerpApi, capturadas/simuladas).
- `tests/regression.test.js` é separado de propósito: fixa o comportamento ponta a ponta (fixture → entrada → decisão → e-mail/gráfico) com valores exatos esperados. Se um teste de regressão quebrar, é sinal de que uma fixture ou uma lógica central mudou — confira se é intencional antes de atualizar o valor esperado.
- Rodar tudo: `npm test`. Um módulo específico: `node --test tests/serpapi.test.js`.

## Estado atual / pendências conhecidas

- Repositório git **ainda não inicializado** neste diretório local (ver guia de deploy abaixo).
- `docs/index.html` existe mas está vazio (0 leituras) até a primeira coleta real rodar.
- Nenhuma chamada real à SerpApi foi feita ainda neste projeto — a validação final é a primeira execução via `workflow_dispatch` (ver README, seção de configuração).
- Limitações conhecidas (já documentadas no README): Decolar só aparece se o Google Flights listar; GitHub Actions pode atrasar execuções agendadas.
