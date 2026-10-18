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
| `extension/` | Extensão Chrome (Manifest V3) independente do monitor: só abre o painel do GitHub Pages em nova aba ao clicar no ícone. Ver seção própria abaixo. |

## Decisões importantes (porquês que não estão óbvios no código)

- **`decide()` compara com a leitura anterior, não com o mínimo, para o alerta de "queda"** — mas qualquer preço abaixo do mínimo histórico sempre dispara via `new-low`, independente do `%`/`R$` de queda. Ver tabela no README.
- **Entradas com `sendError` não contam como "leitura válida" pra decisão** (`alert.js` filtra `!e.sendError`) — se o e-mail falhou, a próxima coleta reavalia do zero, pra não "perder" um alerta por falha de SMTP.
- **`operatedBy` tem dois critérios**: prefixo do `flight_number` OU nome em `AIRLINE_NAMES[code]` batendo com o campo `airline` da perna — isso cobre codeshares onde o número do voo não começa com `QR` mas a operação é da Qatar.
- **`cheapestOverall` não custa busca extra** — usa a mesma resposta já buscada (`first`), só sem o filtro de companhia. É só contexto no e-mail.
- **O gráfico (`chart.js`) é standalone, sem libs externas** (SVG desenhado via JS vanilla) de propósito: GitHub Pages serve arquivo estático, sem build step, sem dependência de CDN caindo.
- **O commit do histórico/gráfico no workflow usa `if: always()`** — mesmo se a coleta falhar, o histórico (que já registra o erro) e o gráfico são salvos, pra não perder visibilidade de falhas.

## Extensão do Chrome (`extension/`)

Atalho de 1 clique pro painel publicado — não tem relação funcional com o monitor em si, só aponta pra URL fixa dele.

- `manifest.json` — Manifest V3, sem `permissions` (não lê nem modifica abas existentes, só cria uma nova).
- `background.js` — service worker com `chrome.action.onClicked` → `chrome.tabs.create({ url: MONITOR_URL })`. `MONITOR_URL` está hardcoded como `https://danielarceeno.github.io/flight/`; se o usuário/repo do GitHub Pages mudar, é só editar essa constante.
- `icons/*.png` — gerados por `generate-icons.js` (PNG escrito à mão via `node:zlib`, zero dependência de imagem/canvas). Rodar de novo com `node extension/generate-icons.js` se quiser trocar o desenho do ícone.
- Instalação é sempre manual (carregar sem compactação em `chrome://extensions`) — não existe forma de automatizar isso, pois é uma página interna do Chrome fora do alcance de automação de browser.

## Testes

- `tests/*.test.js` com `node --test` (sem framework externo). `tests/helpers.js` tem os fakes (`fakeFetch`, `entry`) e as fixtures ficam em `tests/fixtures/*.json` (respostas reais da SerpApi, capturadas/simuladas).
- `tests/regression.test.js` é separado de propósito: fixa o comportamento ponta a ponta (fixture → entrada → decisão → e-mail/gráfico) com valores exatos esperados. Se um teste de regressão quebrar, é sinal de que uma fixture ou uma lógica central mudou — confira se é intencional antes de atualizar o valor esperado.
- Rodar tudo: `npm test`. Um módulo específico: `node --test tests/serpapi.test.js`.

## Estado atual / pendências conhecidas

- **Em produção.** Repositório: `https://github.com/Danielarceeno/flight` (**público** — necessário pra GitHub Pages gratuito; secrets continuam protegidos normalmente, só o código/histórico/gráfico ficam visíveis). Painel ao vivo: `https://danielarceeno.github.io/flight/`.
- Workflow (`monitor.yml`) validado rodando de verdade (`workflow_dispatch`) com os 6 secrets configurados; primeiras coletas reais já acharam preços via Expedia/Qatar e geraram alertas corretamente. O cron 3x/dia (08h/14h/20h BRT) está ativo.
- **Pendência de segurança:** a senha de app do Gmail usada em `SMTP_PASS` foi colada em uma conversa de chat durante a configuração inicial. Recomendado revogar essa senha específica em `myaccount.google.com/apppasswords`, gerar uma nova e atualizar só o secret `SMTP_PASS` no GitHub — ainda não foi feito.
- Extensão Chrome (`extension/`) criada e documentada acima; instalação local é manual (ver README ou instruções passadas na conversa de criação).
- Limitações conhecidas (já documentadas no README): Decolar só aparece se o Google Flights listar; GitHub Actions pode atrasar execuções agendadas.
