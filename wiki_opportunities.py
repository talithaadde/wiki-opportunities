"""
Wiki Opportunities Mapper — Nuvemshop
======================================

Cruza artigos da Wikipédia (PT/ES/EN) que falam de e-commerce com a base de fatos
da Nuvemshop e gera um feed de oportunidades de menção para validação humana.

NÃO publica nada na Wikipédia. Output é uma planilha CSV pronta para revisão.

Uso:
    export ANTHROPIC_API_KEY="sk-ant-..."
    python wiki_opportunities.py

Saída:
    oportunidades_wiki_YYYYMMDD_HHMM.csv

Dependências:
    pip install anthropic requests
"""

import csv
import json
import logging
import os
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional

import requests
from anthropic import Anthropic

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

CLAUDE_MODEL = "claude-sonnet-4-6"
USER_AGENT = "NuvemshopWikiOpportunityBot/1.0 (contato@nuvemshop.com.br) Python/requests"

# Línguas e categorias-alvo. As categorias precisam existir na Wiki daquele idioma.
LANGUAGE_TARGETS = {
    "pt": {
        "categorias": [
            "Categoria:Comércio_eletrônico",
            "Categoria:Empresas_de_comércio_eletrônico",
            "Categoria:Comércio_eletrônico_do_Brasil",
            "Categoria:Plataformas_de_comércio_eletrônico",
        ],
        "buscas": [
            "plataforma de e-commerce Brasil",
            "marketplace América Latina",
            "SaaS lojas virtuais",
        ],
    },
    "es": {
        "categorias": [
            "Categoría:Comercio_electrónico",
            "Categoría:Empresas_de_comercio_electrónico",
            "Categoría:Comercio_electrónico_en_Argentina",
        ],
        "buscas": [
            "plataforma comercio electrónico Argentina",
            "tiendas online Latinoamérica",
        ],
    },
    "en": {
        "categorias": [
            "Category:E-commerce_companies",
            "Category:E-commerce_in_Brazil",
            "Category:E-commerce_in_Latin_America",
        ],
        "buscas": [
            "e-commerce platform Latin America",
            "SaaS online store Brazil",
        ],
    },
}

# Aliases da marca para detectar se já é citada
BRAND_ALIASES = ["Nuvemshop", "Tiendanube", "Nuvem Shop", "Tienda Nube"]

# Concorrentes — sinal de relevância: se o artigo cita um destes, a Nuvemshop cabe ali
COMPETITORS = [
    "Shopify", "VTEX", "Tray", "Loja Integrada", "WooCommerce",
    "Magento", "BigCommerce", "WIX", "Squarespace", "Mercado Shops",
    "PrestaShop", "Jumpseller",
]

# Base de fatos sobre a Nuvemshop — CADA fato deve ter fonte externa citável.
# Edite com dados reais e atualizados antes de rodar em produção.
NUVEMSHOP_FACTS = [
    {
        "fato": "A Nuvemshop (Tiendanube na Argentina) é uma plataforma SaaS de e-commerce fundada em 2011 em Buenos Aires.",
        "fonte_url": "https://www.reuters.com/article/example-nuvemshop",
        "fonte_titulo": "Reuters — Nuvemshop overview",
        "fonte_publicacao": "Reuters",
        "data_acesso": "2026-05-18",
    },
    {
        "fato": "Em 2021 a empresa recebeu aporte de US$ 500 milhões liderado por Insight Partners e Tiger Global.",
        "fonte_url": "https://techcrunch.com/example-nuvemshop-funding",
        "fonte_titulo": "TechCrunch — Tiendanube raises $500M",
        "fonte_publicacao": "TechCrunch",
        "data_acesso": "2026-05-18",
    },
    {
        "fato": "A plataforma opera no Brasil, Argentina, México, Chile e Colômbia, atendendo mais de 130 mil lojistas.",
        "fonte_url": "https://valor.globo.com/exemplo-nuvemshop",
        "fonte_titulo": "Valor Econômico — Nuvemshop expansão LatAm",
        "fonte_publicacao": "Valor Econômico",
        "data_acesso": "2026-05-18",
    },
]

# Limites operacionais
MAX_ARTIGOS_POR_FONTE = 50           # quantos artigos puxar por categoria/busca
MAX_OPORTUNIDADES_LLM = 25           # quantas levam pra geração com Claude
MIN_SCORE = 2                        # score mínimo de relevância pra entrar
PAGEVIEWS_DIAS = 30                  # janela de pageviews
WIKI_REQUEST_DELAY = 0.2             # pausa entre chamadas pra Wiki (respeitar rate limit)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("wiki-opp")


# ---------------------------------------------------------------------------
# Modelo de dados
# ---------------------------------------------------------------------------

@dataclass
class Oportunidade:
    idioma: str
    titulo: str
    url: str
    fonte_descoberta: str           # ex.: "categoria:Comércio eletrônico" ou "busca:..."
    pageviews_30d: int
    concorrentes_citados: str       # CSV string
    score: int
    sugestao_secao: str = ""
    paragrafo_sugerido: str = ""
    fato_usado: str = ""
    fonte_citacao: str = ""
    template_ref: str = ""
    status_validacao: str = "PENDENTE"


# ---------------------------------------------------------------------------
# Cliente da API do MediaWiki
# ---------------------------------------------------------------------------

class WikiClient:
    def __init__(self, idioma: str):
        self.idioma = idioma
        self.api_base = f"https://{idioma}.wikipedia.org/w/api.php"
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def _get(self, params: dict) -> dict:
        params = {**params, "format": "json", "formatversion": "2"}
        time.sleep(WIKI_REQUEST_DELAY)
        r = self.session.get(self.api_base, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def artigos_da_categoria(self, categoria: str, limite: int) -> list[dict]:
        """Lista artigos (namespace 0) de uma categoria."""
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": categoria,
            "cmlimit": min(limite, 500),
            "cmtype": "page",
            "cmnamespace": "0",
        }
        try:
            data = self._get(params)
            return data.get("query", {}).get("categorymembers", [])
        except Exception as e:
            log.warning(f"Falha ao listar categoria {categoria}: {e}")
            return []

    def buscar(self, termo: str, limite: int) -> list[dict]:
        """Busca full-text por termo."""
        params = {
            "action": "query",
            "list": "search",
            "srsearch": termo,
            "srlimit": min(limite, 50),
            "srnamespace": "0",
        }
        try:
            data = self._get(params)
            return data.get("query", {}).get("search", [])
        except Exception as e:
            log.warning(f"Falha na busca '{termo}': {e}")
            return []

    def wikitext(self, titulo: str) -> Optional[str]:
        """Conteúdo bruto (wikitext) do artigo."""
        params = {
            "action": "parse",
            "page": titulo,
            "prop": "wikitext",
            "redirects": "1",
        }
        try:
            data = self._get(params)
            return data.get("parse", {}).get("wikitext", "")
        except Exception as e:
            log.warning(f"Falha ao puxar wikitext de '{titulo}': {e}")
            return None

    def pageviews_30d(self, titulo: str) -> int:
        """Soma de pageviews dos últimos 30 dias via REST API."""
        from datetime import datetime, timedelta
        fim = datetime.utcnow().date()
        inicio = fim - timedelta(days=PAGEVIEWS_DIAS)
        titulo_url = requests.utils.quote(titulo.replace(" ", "_"), safe="")
        url = (
            f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
            f"{self.idioma}.wikipedia/all-access/user/"
            f"{titulo_url}/daily/{inicio.strftime('%Y%m%d')}/{fim.strftime('%Y%m%d')}"
        )
        try:
            time.sleep(WIKI_REQUEST_DELAY)
            r = self.session.get(url, timeout=20)
            if r.status_code != 200:
                return 0
            return sum(item.get("views", 0) for item in r.json().get("items", []))
        except Exception:
            return 0


# ---------------------------------------------------------------------------
# Análise de artigos
# ---------------------------------------------------------------------------

def marca_ja_citada(wikitext: str) -> bool:
    """True se algum alias da marca aparece no texto."""
    if not wikitext:
        return False
    texto_norm = wikitext.lower()
    return any(alias.lower() in texto_norm for alias in BRAND_ALIASES)


def concorrentes_no_texto(wikitext: str) -> list[str]:
    """Lista de concorrentes citados no artigo."""
    if not wikitext:
        return []
    achados = []
    texto_norm = wikitext.lower()
    for c in COMPETITORS:
        # palavra inteira (evita falsos positivos curtos como "Tray" em outros contextos)
        padrao = r"\b" + re.escape(c.lower()) + r"\b"
        if re.search(padrao, texto_norm):
            achados.append(c)
    return achados


def calcular_score(pageviews: int, concorrentes: list[str], fonte: str) -> int:
    """Score simples de prioridade."""
    score = 0
    score += len(concorrentes) * 2                # cada concorrente vale 2
    if pageviews >= 10_000:
        score += 5
    elif pageviews >= 1_000:
        score += 3
    elif pageviews >= 100:
        score += 1
    if fonte.startswith("categoria"):             # categoria curada vale mais que busca
        score += 1
    return score


def extrair_trecho_relevante(wikitext: str, concorrentes: list[str], max_chars: int = 1200) -> str:
    """Pega um trecho do artigo onde um concorrente é citado, pra dar contexto ao LLM."""
    if not wikitext or not concorrentes:
        return wikitext[:max_chars] if wikitext else ""
    alvo = concorrentes[0]
    idx = wikitext.lower().find(alvo.lower())
    if idx == -1:
        return wikitext[:max_chars]
    inicio = max(0, idx - max_chars // 2)
    fim = min(len(wikitext), idx + max_chars // 2)
    return wikitext[inicio:fim]


# ---------------------------------------------------------------------------
# Geração de sugestão com Claude
# ---------------------------------------------------------------------------

class ClaudeSuggester:
    def __init__(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("Defina ANTHROPIC_API_KEY no ambiente.")
        self.client = Anthropic(api_key=api_key)

    def sugerir(self, idioma: str, titulo: str, trecho: str,
                concorrentes: list[str]) -> dict:
        """Retorna dict com sugestao_secao, paragrafo, fato_usado, fonte, template_ref."""

        system_prompt = (
            "Você é um editor experiente da Wikipédia que conhece as políticas de "
            "verificabilidade (WP:V), ponto de vista neutro (WP:POV) e conflito de "
            "interesse (WP:COI). Seu objetivo é sugerir UMA inserção curta, factual e "
            "neutra mencionando a Nuvemshop/Tiendanube em um artigo existente, sempre "
            "ancorada em fonte secundária confiável. Nunca use adjetivos promocionais "
            "como 'líder', 'principal', 'inovadora', 'a melhor'. Tom enciclopédico."
        )

        fatos_json = json.dumps(NUVEMSHOP_FACTS, ensure_ascii=False, indent=2)

        user_prompt = f"""Idioma do artigo: {idioma}
Título do artigo na Wikipédia: "{titulo}"
Concorrentes já citados no artigo: {', '.join(concorrentes) or 'nenhum identificado'}

Trecho do artigo onde os concorrentes aparecem:
\"\"\"
{trecho}
\"\"\"

Fatos disponíveis sobre a Nuvemshop (use APENAS um deles, escolhendo o mais pertinente ao contexto):
{fatos_json}

Tarefa: produza uma sugestão de edição neutra para este artigo. Responda EXCLUSIVAMENTE em JSON válido (sem cercas de código, sem comentários), com este formato:

{{
  "sugestao_secao": "Nome ou descrição da seção do artigo onde a inserção faria sentido",
  "paragrafo_sugerido": "Frase ou parágrafo de 1 a 3 linhas, em {idioma}, mencionando a Nuvemshop de forma neutra e factual, com a referência inline no formato <ref name=\\"nuvem1\\">...</ref>",
  "fato_usado": "Cópia exata do campo 'fato' do item escolhido",
  "fonte_citacao": "URL da fonte usada",
  "template_ref": "Template completo {{{{Citar web|url=...|título=...|publicação=...|acessadoem=...}}}} pronto para colar"
}}

Se nenhum fato se encaixar de forma honesta no artigo, responda exatamente: {{"skip": true, "motivo": "explique por quê"}}"""

        try:
            msg = self.client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = msg.content[0].text.strip()
            # Remove cercas eventuais
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()
            parsed = json.loads(raw)
            return parsed
        except json.JSONDecodeError as e:
            log.warning(f"JSON inválido vindo do Claude para '{titulo}': {e}")
            return {"skip": True, "motivo": "JSON inválido"}
        except Exception as e:
            log.warning(f"Erro no Claude para '{titulo}': {e}")
            return {"skip": True, "motivo": str(e)}


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def coletar_candidatos(idioma: str, cfg: dict, wiki: WikiClient) -> list[tuple[str, str]]:
    """Retorna lista de (titulo, fonte_descoberta) deduplicada."""
    candidatos: dict[str, str] = {}

    for cat in cfg["categorias"]:
        log.info(f"[{idioma}] categoria: {cat}")
        for art in wiki.artigos_da_categoria(cat, MAX_ARTIGOS_POR_FONTE):
            titulo = art.get("title")
            if titulo and titulo not in candidatos:
                candidatos[titulo] = f"categoria:{cat}"

    for termo in cfg["buscas"]:
        log.info(f"[{idioma}] busca: {termo}")
        for art in wiki.buscar(termo, MAX_ARTIGOS_POR_FONTE):
            titulo = art.get("title")
            if titulo and titulo not in candidatos:
                candidatos[titulo] = f"busca:{termo}"

    return list(candidatos.items())


def avaliar_artigo(titulo: str, fonte: str, idioma: str,
                   wiki: WikiClient) -> Optional[Oportunidade]:
    """Filtra artigos onde a Nuvemshop ainda não aparece e calcula score."""
    wikitext = wiki.wikitext(titulo)
    if wikitext is None:
        return None
    if marca_ja_citada(wikitext):
        return None

    concorrentes = concorrentes_no_texto(wikitext)
    if not concorrentes:                          # sem concorrente citado → contexto fraco
        return None

    pageviews = wiki.pageviews_30d(titulo)
    score = calcular_score(pageviews, concorrentes, fonte)
    if score < MIN_SCORE:
        return None

    url = f"https://{idioma}.wikipedia.org/wiki/{titulo.replace(' ', '_')}"
    return Oportunidade(
        idioma=idioma,
        titulo=titulo,
        url=url,
        fonte_descoberta=fonte,
        pageviews_30d=pageviews,
        concorrentes_citados=", ".join(concorrentes),
        score=score,
    )


def enriquecer_com_llm(oportunidades: list[Oportunidade],
                       wiki_clients: dict[str, WikiClient]) -> list[Oportunidade]:
    """Gera sugestão de parágrafo para as top-N oportunidades."""
    suggester = ClaudeSuggester()
    enriquecidas = []

    # Ordena por score e corta no limite
    oportunidades.sort(key=lambda o: o.score, reverse=True)
    top = oportunidades[:MAX_OPORTUNIDADES_LLM]

    for i, op in enumerate(top, 1):
        log.info(f"[LLM {i}/{len(top)}] {op.titulo} (score={op.score})")
        wiki = wiki_clients[op.idioma]
        wikitext = wiki.wikitext(op.titulo) or ""
        concorrentes = op.concorrentes_citados.split(", ") if op.concorrentes_citados else []
        trecho = extrair_trecho_relevante(wikitext, concorrentes)

        sugestao = suggester.sugerir(op.idioma, op.titulo, trecho, concorrentes)

        if sugestao.get("skip"):
            log.info(f"  ↳ pulado: {sugestao.get('motivo', 'sem motivo')}")
            continue

        op.sugestao_secao = sugestao.get("sugestao_secao", "")
        op.paragrafo_sugerido = sugestao.get("paragrafo_sugerido", "")
        op.fato_usado = sugestao.get("fato_usado", "")
        op.fonte_citacao = sugestao.get("fonte_citacao", "")
        op.template_ref = sugestao.get("template_ref", "")
        enriquecidas.append(op)

    # Inclui também as não-LLM com campos vazios (pra revisor decidir)
    nao_top = oportunidades[MAX_OPORTUNIDADES_LLM:]
    return enriquecidas + nao_top


def exportar_csv(oportunidades: list[Oportunidade], caminho: str):
    if not oportunidades:
        log.warning("Sem oportunidades para exportar.")
        return
    campos = list(asdict(oportunidades[0]).keys())
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=campos)
        writer.writeheader()
        for op in oportunidades:
            writer.writerow(asdict(op))
    log.info(f"CSV salvo em: {caminho}")


def exportar_json(oportunidades: list[Oportunidade], caminho: str):
    """Exporta JSON pra alimentar o painel HTML."""
    if not oportunidades:
        return
    payload = [asdict(op) for op in oportunidades]
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    log.info(f"JSON salvo em: {caminho}")


def main():
    log.info("=" * 60)
    log.info("Wiki Opportunities Mapper — Nuvemshop")
    log.info("=" * 60)

    wiki_clients = {lang: WikiClient(lang) for lang in LANGUAGE_TARGETS}
    todas_oportunidades: list[Oportunidade] = []

    # 1. Coleta + avaliação
    for idioma, cfg in LANGUAGE_TARGETS.items():
        wiki = wiki_clients[idioma]
        candidatos = coletar_candidatos(idioma, cfg, wiki)
        log.info(f"[{idioma}] {len(candidatos)} candidatos únicos")

        for titulo, fonte in candidatos:
            op = avaliar_artigo(titulo, fonte, idioma, wiki)
            if op:
                todas_oportunidades.append(op)

        log.info(f"[{idioma}] {sum(1 for o in todas_oportunidades if o.idioma == idioma)} oportunidades válidas")

    log.info(f"Total bruto: {len(todas_oportunidades)} oportunidades")

    # 2. Enriquecimento com LLM
    if todas_oportunidades:
        todas_oportunidades = enriquecer_com_llm(todas_oportunidades, wiki_clients)

    # 3. Export
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    saida_csv = f"oportunidades_wiki_{timestamp}.csv"
    saida_json = f"oportunidades_wiki_{timestamp}.json"
    exportar_csv(todas_oportunidades, saida_csv)
    exportar_json(todas_oportunidades, saida_json)

    # Atualiza JSON "current" pro painel HTML
    if todas_oportunidades:
        exportar_json(todas_oportunidades, "oportunidades.json")

    log.info("=" * 60)
    log.info(f"Pronto. Revise {saida_csv} ou abra o painel HTML carregando {saida_json}.")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
