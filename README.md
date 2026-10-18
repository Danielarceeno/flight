# Monitor de passagens GRU → BKK (Qatar Airways + Decolar)

Roda sozinho no GitHub Actions (grátis), 3x ao dia (08h, 14h e 20h de Brasília), sem depender do seu computador ou do Chrome. Envia e-mail quando o preço cai e um resumo diário de manhã.

- Rota padrão: GRU → BKK, ida 11/04/2027, volta 02/05/2027, ida e volta, 1 adulto, em R$.
- **Qatar Airways:** menor preço do Google Flights filtrado só para a Qatar (via SerpApi).
- **Decolar e outros vendedores:** de manhã, o monitor abre as "opções de reserva" do voo mais barato da Qatar e lê quem vende e por quanto. Se a Decolar aparecer, o preço dela entra na comparação. Se não aparecer, o e-mail avisa.
- **Contexto de outras companhias:** o e-mail também mostra o menor preço da busca entre *qualquer* companhia (não só Qatar), quando ele for mais barato — sem gastar busca extra.

## Quando você recebe e-mail
| Situação | E-mail |
|---|---|
| Primeira coleta | Confirmação "Monitor ativo" (prova que o e-mail funciona) |
| Novo menor preço registrado | Alerta |
| Queda ≥ 5% **e** ≥ R$ 50 vs. coleta anterior | Alerta |
| Toda manhã (se ativado) | Resumo do dia |
| 3 falhas de coleta seguidas | Aviso de problema (uma vez) |

> **Como "queda ≥5% e ≥R$50" interage com "novo menor preço":** a queda é comparada só com a **leitura anterior**, não com o mínimo histórico. Então uma queda pequena a partir de um preço que já estava alto não necessariamente dispara alerta — mas qualquer preço abaixo do mínimo histórico sempre dispara (`new-low`), mesmo que a queda vs. a leitura anterior tenha sido de 1%. Ou seja: `new-low` garante que você nunca perde um recorde; `drop` pega quedas bruscas mesmo sem bater recorde.

## Gráfico de histórico (GitHub Pages)
Toda coleta também gera `docs/index.html`: uma página estática (sem dependências externas) com o preço mais barato ao longo do tempo. Para publicá-la:
1. No repositório, vá em *Settings → Pages*.
2. Em *Source*, escolha **Deploy from a branch**, branch `main`, pasta **/docs**.
3. Salve. A URL (algo como `https://seu-usuario.github.io/seu-repo/`) aparece na mesma tela em alguns minutos.

O workflow já commita `docs/index.html` a cada execução (`npm run chart` localmente gera a mesma página a partir de `data/history.json`).

## Configuração (uma vez, ~10 min)
1. **SerpApi:** crie conta em serpapi.com e copie a API key (o plano grátis tem cota mensal limitada; veja abaixo).
2. **E-mail (SMTP):** para Gmail, ative a verificação em duas etapas e crie uma *senha de app* em myaccount.google.com/apppasswords.
3. Crie um repositório **privado** no GitHub e envie esta pasta.
4. Em *Settings → Secrets and variables → Actions → Secrets*, crie:

| Secret | Valor |
|---|---|
| `SERPAPI_KEY` | sua chave do SerpApi |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | seu Gmail |
| `SMTP_PASS` | a senha de app (16 letras) |
| `EMAIL_TO` | e-mail que recebe os alertas |
| `EMAIL_FROM` | opcional (padrão: `SMTP_USER`) |

5. Aba *Actions* → "Monitor GRU → BKK" → **Run workflow** para testar. Você deve receber o e-mail "Monitor ativo".

### Variáveis opcionais (aba *Variables*)
`OUTBOUND_DATE`, `RETURN_DATE`, `ALERT_DROP_PCT` (padrão 5), `ALERT_MIN_DROP` (padrão 50), `SEND_DAILY_DIGEST` (`false` desliga o resumo diário).

## Cota do SerpApi
- Coleta de tarde e noite: 1 busca. Coleta da manhã: 3 buscas (preço + vendedores).
- Total: 5 buscas/dia ≈ 150/mês. Confira a cota do seu plano em serpapi.com; se for menor, use `DEEP_CHECK_ALWAYS` desligado (padrão) e considere `SEND_DAILY_DIGEST=false`, ou reduza para 2 coletas/dia editando os `cron` em `.github/workflows/monitor.yml`.

## Testar localmente
```
npm install
npm test                         # testes com dados simulados
SERPAPI_KEY=... DRY_RUN=1 npm start   # busca real, grava o e-mail em out/last-email.html sem enviar
```

## Limitações conhecidas
- Os testes usam respostas simuladas no formato documentado do SerpApi; a primeira execução real é a validação final. Se algum campo vier diferente, o monitor registra o erro no histórico e te avisa após 3 falhas.
- A Decolar só aparece se o Google Flights a listar como vendedora naquele voo.
- O GitHub pode atrasar execuções agendadas em alguns minutos nos horários de pico.
- Os links do e-mail levam à busca no Google Flights e às páginas iniciais da Qatar e da Decolar.
