# Wiki Opportunities Mapper — Nuvemshop

Mapeia oportunidades de menção da **Nuvemshop/Tiendanube** em artigos da Wikipédia (PT/ES/EN), gerando um feed CSV/JSON pronto para validação humana. **Não publica nada na Wikipédia.**

## Componentes

| Arquivo | O que faz |
|---|---|
| `wiki_opportunities.py` | Script Python que consome a API do MediaWiki + Claude e gera CSV/JSON |
| `index.html` | Painel web para o time revisar as oportunidades (sem dependências) |
| `DEPLOY.md` | Como publicar o painel HTML (Vercel, Netlify, GitHub Pages, S3) |
| `requirements.txt` | Dependências Python |

## Como funciona

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────┐
│  MediaWiki API  │ →  │  Filtro & Score  │ →  │   Claude API     │ →  │  CSV + JSON  │
│ (categorias +   │    │ (sem marca,      │    │ (sugestão de     │    │              │
│  busca + page-  │    │  com concorrente,│    │  parágrafo +     │    │      ↓       │
│  views)         │    │  score ≥ MIN)    │    │  ref formatada)  │    │  Painel HTML │
└─────────────────┘    └──────────────────┘    └──────────────────┘    └──────────────┘
```

## Setup

```bash
pip install anthropic requests
export ANTHROPIC_API_KEY="sk-ant-..."
python wiki_opportunities.py
```

Saída: `oportunidades_wiki_YYYYMMDD_HHMM.csv` no diretório atual.

## Configuração

Tudo fica no topo do `wiki_opportunities.py`:

| Variável | O que ajustar |
|---|---|
| `LANGUAGE_TARGETS` | Categorias e termos de busca por idioma |
| `BRAND_ALIASES` | Variações do nome da marca pra detectar se já é citada |
| `COMPETITORS` | Concorrentes — sinaliza relevância contextual |
| `NUVEMSHOP_FACTS` | **Editar antes de rodar**: fatos com fonte secundária real |
| `MIN_SCORE` | Threshold de prioridade |
| `MAX_OPORTUNIDADES_LLM` | Quantas top-N vão pra geração com Claude (controla custo) |

## Lógica de scoring

```
score = (nº de concorrentes citados × 2)
      + bônus por pageviews (5/3/1 para ≥10k/1k/100)
      + 1 ponto extra se veio de categoria curada
```

Artigos onde a marca já aparece, ou onde nenhum concorrente é citado, são descartados antes do scoring.

## Colunas do CSV

| Coluna | Descrição |
|---|---|
| `idioma` | pt / es / en |
| `titulo` | Título do artigo |
| `url` | Link direto pra Wikipédia |
| `fonte_descoberta` | Categoria ou busca que trouxe o artigo |
| `pageviews_30d` | Visitas nos últimos 30 dias |
| `concorrentes_citados` | Lista de concorrentes encontrados no wikitext |
| `score` | Prioridade calculada |
| `sugestao_secao` | Onde inserir |
| `paragrafo_sugerido` | Texto pronto (gerado pelo Claude) |
| `fato_usado` | Fato da base que foi escolhido |
| `fonte_citacao` | URL da fonte externa |
| `template_ref` | `{{Citar web\|...}}` pronto pra colar |
| `status_validacao` | Começa como `PENDENTE`; revisor atualiza |

## Governança — leia antes de publicar qualquer coisa

A Wikipédia tem políticas rígidas. Ignorar custa banimento de IP + reversão em massa + dano reputacional. Regras práticas:

1. **WP:COI (conflito de interesse)** — quem editar deve declarar vínculo com a Nuvemshop na própria página de usuário e/ou na talk page do artigo.
2. **Use `{{Edit request}}` quando possível** — em vez de editar direto, peça na talk page do artigo. Editores voluntários revisam e aplicam.
3. **Fonte secundária obrigatória** — nada de citar o blog da Nuvemshop como fonte do próprio fato. Use Valor, Reuters, TechCrunch, Folha, Bloomberg, La Nación, etc.
4. **Tom enciclopédico** — sem adjetivos ("líder", "principal", "inovadora"). O prompt do Claude já bloqueia isso, mas confira na revisão.
5. **Ritmo** — distribua as edições no tempo. Burst de 30 edições no mesmo dia, todas mencionando a marca, é flag automática.
6. **Diversidade de editores** — não use uma única conta corporativa pra tudo.

## Custos estimados (Claude API)

Com defaults (25 chamadas/execução, ~1k tokens de input + ~500 de output cada):

- Input: 25 × 1k = 25k tokens
- Output: 25 × 500 = 12,5k tokens
- A preços atuais de Sonnet 4.6 ($3/MTok input, $15/MTok output): **~US$ 0,26 por execução**

Rodar semanalmente custa centavos. Se quiser baratear ainda mais, troque `CLAUDE_MODEL` para `claude-haiku-4-5-20251001`.

## Próximos passos sugeridos

- [ ] Substituir `NUVEMSHOP_FACTS` por dados reais com URLs de fontes secundárias verificadas
- [ ] Rodar 1ª execução em dry-run e revisar manualmente os 10 primeiros outputs
- [ ] Definir SLA de validação (ex.: revisor humano avalia até 48h depois)
- [ ] Logar histórico de edições aplicadas (planilha separada) pra evitar duplicidade
- [ ] Considerar publicar via `{{Edit request}}` em vez de edição direta nos primeiros meses
