# Deploy no GitHub Pages (repo privado + atualização diária)

## ⚠️ Antes de começar: limitação do GitHub Pages com repositório privado

**GitHub Pages em repositório privado só funciona em planos pagos:**

- **Conta Free:** Pages só com repo público. → use a [alternativa Vercel](#alternativa-vercel-grátis-para-repo-privado) no final deste guia.
- **GitHub Pro** (US$ 4/mês), **Team** ou **Enterprise:** Pages funciona com repo privado normalmente.

Se você está em conta **Free** e quer manter o repo privado de qualquer jeito, vá direto para [Vercel](#alternativa-vercel-grátis-para-repo-privado) — leva o mesmo tempo, é grátis, e funciona melhor com repos privados.

Para verificar seu plano: [github.com/settings/billing/plans](https://github.com/settings/billing/plans)

---

## Caminho A — GitHub Pages (conta com Pro/Team/Enterprise)

### Passo 1 — Criar o repositório privado

1. Vá em **[github.com/new](https://github.com/new)**
2. Nome: `wiki-opportunities`
3. Visibilidade: **Private** ✓
4. **Não** marque "Add a README" / "Add .gitignore" / "Add a license" — já temos tudo
5. **Create repository**
6. Copie a URL (ex: `https://github.com/talithaadde/wiki-opportunities.git`)

### Passo 2 — Subir o código

Na pasta `wiki-opportunities/` descompactada, abra o terminal e cole:

```bash
git init
git add .
git commit -m "feat: painel wiki opportunities + script python"
git branch -M main
git remote add origin https://github.com/talithaadde/wiki-opportunities.git
git push -u origin main
```

Substitua `talithaadde` pelo seu username.

Primeira vez usando Git? Instale o **GitHub CLI** (`brew install gh` no Mac, ou [cli.github.com](https://cli.github.com/) em outros sistemas) e rode `gh auth login` antes do `git push`.

### Passo 3 — Ativar o GitHub Pages

1. No repo: **Settings** → menu lateral **Pages**
2. Em **Source**, selecione **GitHub Actions**
3. Pronto — o workflow `.github/workflows/deploy-pages.yml` dispara sozinho.

### Passo 4 — Configurar a chave da Anthropic (para a atualização diária)

1. **Settings → Secrets and variables → Actions → New repository secret**
2. Nome: `ANTHROPIC_API_KEY`
3. Valor: sua chave (`sk-ant-...`)
4. **Add secret**

### Passo 5 — Aguardar o primeiro deploy

1. Aba **Actions** → workflow "Deploy Painel ao GitHub Pages"
2. Em ~1 min fica verde
3. URL aparece no resumo: `https://talithaadde.github.io/wiki-opportunities/`

### Como o time acessa

Como o repo é privado, o GitHub Pages **fica autenticado** — quem acessar a URL precisa estar logado no GitHub e ser colaborador do repositório.

Para adicionar gente do time: **Settings → Collaborators → Add people**. Eles recebem convite por email e passam a poder ver tanto o código quanto o painel.

---

## Alternativa Vercel (grátis para repo privado)

Se sua conta GitHub é Free, esta é a melhor opção. Leva o mesmo tempo, é grátis, e o Vercel lida com repos privados normalmente.

### Passo 1 — Subir o código pro GitHub (igual ao Caminho A)

Faça os Passos 1 e 2 do Caminho A acima — criar o repo privado e dar `git push`.

**Não** precisa ativar GitHub Pages no Caminho B.

### Passo 2 — Conectar ao Vercel

1. Vá em **[vercel.com/signup](https://vercel.com/signup)** e entre com sua conta GitHub
2. Clique em **Add New → Project**
3. Selecione o repo `wiki-opportunities`
4. Framework Preset: **Other**
5. Root Directory: `.` (raiz)
6. **Deploy**

Em ~30 segundos sai uma URL tipo `wiki-opportunities-suaconta.vercel.app`.

### Passo 3 — Ativar a varredura diária

A varredura roda no GitHub Actions (não no Vercel). Configure exatamente como no Passo 4 do Caminho A: vá no GitHub → repo → Settings → Secrets → adicione `ANTHROPIC_API_KEY`.

### Controle de acesso no Vercel

- **Por padrão**, a URL Vercel é pública (qualquer um com o link acessa).
- Para restringir: Projeto → **Settings → Deployment Protection → Vercel Authentication**, ative. Só quem tem acesso ao time Vercel consegue abrir.
- **Password Protection** (senha compartilhada) está só em planos pagos (Vercel Pro a partir de US$ 20/mês). Para uso interno gratuito, `Vercel Authentication` resolve.

---

## Atualização diária do feed (vale para os dois caminhos)

Já está configurada. O workflow `.github/workflows/refresh-feed.yml`:

- **Roda todo dia às 09h de Brasília** (12h UTC).
- Executa `wiki_opportunities.py`, que consome a API do MediaWiki + Claude.
- Commita o `oportunidades.json` atualizado no repo.
- Se o painel estiver configurado pra carregar o JSON automaticamente, ele já aparece atualizado.

### Disparar manualmente

Aba **Actions** → "Atualizar Feed Wiki Opportunities" → **Run workflow**.

### Custo estimado

Com defaults do script (25 chamadas/execução, Sonnet 4.6): ~US$ 0,26 por execução. Diário = ~**US$ 8/mês** em API Anthropic. GitHub Actions é grátis até 2000 min/mês (esta execução leva ~2 min).

### Plug-and-play do JSON no painel

Para o painel carregar o JSON automaticamente em vez de pedir upload manual, edite o final do `<script>` no `index.html`:

```js
// Substituir esta linha no final do script:
loadData([]);

// Por:
fetch('oportunidades.json')
  .then(r => r.json())
  .then(loadData)
  .catch(() => loadData([]));  // fallback: mostra a tela de input se o JSON não existir
```

---

## Domínio customizado (opcional)

### No GitHub Pages

1. DNS do domínio: crie um `CNAME` apontando pra `talithaadde.github.io`
2. Repo → Settings → Pages → **Custom domain** → digite `wiki.nuvemshop.com.br` → Save
3. Aguarde DNS propagar e marque **Enforce HTTPS**

### No Vercel

1. Projeto → Settings → **Domains** → Add → digite o domínio
2. Vercel mostra os registros DNS necessários — adicione no provedor do domínio
3. SSL automático em ~1 min

---

## Atualizando o painel depois do deploy

Qualquer mudança no `index.html` ou nos arquivos:

```bash
git add .
git commit -m "ajuste: o que você mudou"
git push
```

Tanto GitHub Pages quanto Vercel refazem o deploy automaticamente em ~1 minuto.

---

## Resumo de decisão

| Critério | GitHub Pages | Vercel |
|---|---|---|
| **Custo (repo privado)** | US$ 4/mês (Pro) | Grátis |
| **Tempo de deploy** | ~1 min | ~30 seg |
| **Acesso ao painel** | Só colaboradores logados no GitHub | Público por padrão, restringível |
| **Setup** | 4 passos | 2 passos |
| **Atualização automática (Actions)** | ✓ | ✓ (Actions roda no GitHub mesmo) |

Se sua conta é Free → **Vercel**. Se já tem Pro/Team → **GitHub Pages** funciona bem e mantém tudo num lugar só.
