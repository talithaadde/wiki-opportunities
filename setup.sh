#!/bin/bash
# ==============================================================================
# setup.sh — Publica o projeto wiki-opportunities na conta talithaadde
# ==============================================================================
# Uso:
#   1. Crie o repositório vazio em github.com/new com o nome "wiki-opportunities"
#      (deixe SEM README, SEM .gitignore, SEM LICENSE — já temos)
#   2. cd para esta pasta
#   3. chmod +x setup.sh
#   4. ./setup.sh
# ==============================================================================

set -e  # falha rápido se qualquer comando falhar

GITHUB_USER="talithaadde"
REPO_NAME="wiki-opportunities"
REMOTE_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo "🚀 Wiki Opportunities — Deploy ao GitHub"
echo "   Conta:  ${GITHUB_USER}"
echo "   Repo:   ${REPO_NAME}"
echo ""

# Checa pré-requisitos
if ! command -v git &> /dev/null; then
  echo "❌ Git não está instalado."
  echo "   Mac:    brew install git"
  echo "   Linux:  sudo apt install git"
  echo "   Windows: https://git-scm.com/download/win"
  exit 1
fi

# Se já é um repo git, pergunta antes de continuar
if [ -d ".git" ]; then
  echo "⚠️  Esta pasta já é um repositório git."
  read -p "   Continuar e sobrescrever a configuração? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "   Cancelado."
    exit 0
  fi
  rm -rf .git
fi

echo "📦 Inicializando repositório..."
git init -q
git branch -M main

echo "📝 Adicionando arquivos..."
git add .

echo "💾 Criando commit inicial..."
git commit -q -m "feat: painel wiki opportunities + script python

- Painel HTML com identidade visual Nuvemshop
- Input de URLs de matérias (Radar D2C / NuvemCommerce)
- Script Python pra varredura na Wikipédia + Claude
- GitHub Actions: deploy diário do feed + GitHub Pages"

echo "🔗 Conectando ao remoto..."
git remote add origin "${REMOTE_URL}"

echo ""
echo "🔐 Fazendo push (será pedida autenticação)..."
echo "   Se for a primeira vez no Git, recomendo instalar o GitHub CLI:"
echo "   → brew install gh && gh auth login"
echo ""

if git push -u origin main; then
  echo ""
  echo "✅ Pronto! Código no ar em:"
  echo "   https://github.com/${GITHUB_USER}/${REPO_NAME}"
  echo ""
  echo "📋 Próximos passos (no navegador):"
  echo ""
  echo "   1. Settings → Pages → Source: GitHub Actions"
  echo "      https://github.com/${GITHUB_USER}/${REPO_NAME}/settings/pages"
  echo ""
  echo "   2. Settings → Secrets → New repository secret"
  echo "      Nome:  ANTHROPIC_API_KEY"
  echo "      Valor: sua chave sk-ant-..."
  echo "      https://github.com/${GITHUB_USER}/${REPO_NAME}/settings/secrets/actions/new"
  echo ""
  echo "   3. Aguarde ~1 min e abra:"
  echo "      https://${GITHUB_USER}.github.io/${REPO_NAME}/"
  echo ""
else
  echo ""
  echo "❌ O push falhou. Possíveis causas:"
  echo ""
  echo "   • O repositório ainda não foi criado no GitHub."
  echo "     → Vá em https://github.com/new, crie 'wiki-opportunities' (vazio) e rode de novo."
  echo ""
  echo "   • Autenticação falhou."
  echo "     → Instale o GitHub CLI e rode: gh auth login"
  echo "     → Depois rode este script de novo."
  echo ""
  exit 1
fi
