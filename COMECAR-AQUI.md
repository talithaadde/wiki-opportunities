# 🚀 Deploy rápido — Talitha

Esse é o caminho mais curto. Em ~3 minutos seu painel estará no ar.

## Passo 1 — Criar repositório vazio

Abra: **[github.com/new](https://github.com/new)**

- **Repository name:** `wiki-opportunities`
- **Description:** *Feed de oportunidades de menção na Wikipédia · Nuvemshop*
- **Privacy:** Private ✓ (assumindo que você tem Pro; se for Free, ver nota abaixo)
- **NÃO marque** "Add a README", "Add .gitignore" nem "Choose a license"
- Clique **Create repository**

## Passo 2 — Subir o código

No terminal, navegue até a pasta `wiki-opportunities/` descompactada e rode:

```bash
chmod +x setup.sh
./setup.sh
```

O script já está configurado com seu usuário `talithaadde` e cuida de tudo: `git init`, commit inicial, conecta ao remote e faz push.

**Primeira vez no Git nesta máquina?** Antes do `./setup.sh`, rode:

```bash
brew install gh         # se você está no Mac (Linux: veja cli.github.com)
gh auth login           # autentica via browser, mais simples que SSH/token
```

## Passo 3 — Ativar Pages e configurar a chave da API

Depois que o push terminar, abra estes dois links e siga as instruções:

**A. Ativar GitHub Pages:**
[github.com/talithaadde/wiki-opportunities/settings/pages](https://github.com/talithaadde/wiki-opportunities/settings/pages)
→ Em **Source**, selecione **GitHub Actions** → Save

**B. Adicionar a chave da Anthropic** (necessária pra varredura diária):
[github.com/talithaadde/wiki-opportunities/settings/secrets/actions/new](https://github.com/talithaadde/wiki-opportunities/settings/secrets/actions/new)
→ **Name:** `ANTHROPIC_API_KEY`
→ **Secret:** sua chave (`sk-ant-...`)
→ **Add secret**

Se ainda não tem chave: [console.anthropic.com](https://console.anthropic.com/) → API Keys → Create.

## Passo 4 — Aguardar o primeiro deploy

Abra **[github.com/talithaadde/wiki-opportunities/actions](https://github.com/talithaadde/wiki-opportunities/actions)** — você verá dois workflows:

1. ✓ **Deploy Painel ao GitHub Pages** — roda automaticamente no push
2. ⏰ **Atualizar Feed Wiki Opportunities** — programado pra rodar todo dia às 9h

Quando o primeiro ficar verde (~1 minuto), seu painel está em:

**🎉 [https://talithaadde.github.io/wiki-opportunities/](https://talithaadde.github.io/wiki-opportunities/)**

## (Opcional) Disparar a primeira varredura agora

Pra não esperar até amanhã 9h:
→ Aba **Actions** → "Atualizar Feed Wiki Opportunities" → **Run workflow** (botão à direita)

---

## ⚠️ Se sua conta é GitHub Free

GitHub Pages com repo privado exige plano pago (Pro a partir de US$ 4/mês). Duas saídas:

**Opção A:** Crie o repo **público** no Passo 1 → o painel publica grátis. Os dados não são sensíveis (são URLs públicas + sugestões editoriais), então repo público funciona bem.

**Opção B:** Use Vercel em vez de Pages — grátis com repo privado. Depois do `./setup.sh` rodar, vá em [vercel.com/new](https://vercel.com/new), importe o repo, Framework "Other", Deploy. Pronto em 30s. Veja `DEPLOY.md` (caminho B) pros detalhes.

---

## Atualizações futuras

Mudou algo no `index.html` ou em qualquer arquivo:

```bash
git add .
git commit -m "ajuste: o que você mudou"
git push
```

O deploy refaz sozinho em ~1 min.

---

## Compartilhar com o time

**Settings → Collaborators → Add people** no repo. Convide quem precisa por email/username. Eles poderão ver o painel se a conta deles também tiver acesso ao repo.

Pra revisão sem dar acesso ao código: compartilhe direto a URL `https://talithaadde.github.io/wiki-opportunities/` — em repo público, qualquer um abre. Em repo privado, precisa estar logado e ser colaborador.
