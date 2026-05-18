// ═══════════════════════════════════════════════════════════════════
// Wiki Opportunities · Nuvemshop · app.js
// Painel onde você cola matérias da imprensa e a ferramenta
// cruza com artigos da Wikipédia automaticamente.
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'nuvemshop_wiki_status_v4';

let ARTIGOS = [];     // artigos da Wikipédia (do oportunidades.json)
let MATERIAS = [];    // matérias coladas pelo usuário
let DATA = [];        // dataset final (artigos enriquecidos com matérias)
let STATUSES = {};

// ─── PERSISTÊNCIA ─────────────────────────────────────────────────
function loadStatuses() {
  try { STATUSES = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { STATUSES = {}; }
}
function saveStatuses() { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATUSES)); }
function statusKey(item) { return `${item.idioma}::${item.titulo}`; }
function getStatus(item) {
  const k = statusKey(item);
  return STATUSES[k] || { status: item.status_validacao || 'PENDENTE', notes: '' };
}
function setStatus(item, status, notes) {
  const k = statusKey(item);
  STATUSES[k] = { status, notes: notes ?? (STATUSES[k]?.notes || '') };
  saveStatuses();
}

// ─── UTILIDADES ───────────────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}
function isValidUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

// ─── HEURÍSTICA DE CRUZAMENTO ─────────────────────────────────────
// Dado um fato (texto livre) e um artigo, calcula um "fit score"
// baseado em palavras-chave compartilhadas.
function calcularFit(fato, artigo) {
  if (!fato || !artigo) return { score: 0, matched: [] };
  const textoArtigo = `${artigo.titulo} ${artigo.concorrentes_citados || ''} ${artigo.fonte_descoberta || ''}`.toLowerCase();
  const textoFato = fato.toLowerCase();

  const keywords = {
    brasil: ['brasil', 'brasileiro', 'brasileira'],
    argentina: ['argentina', 'buenos aires', 'argentino'],
    latam: ['américa latina', 'latam', 'latin america', 'latino', 'latinoamericana', 'latinoamericano'],
    ecommerce: ['e-commerce', 'ecommerce', 'comércio eletrônico', 'comercio electrónico', 'comércio eletrônica'],
    saas: ['saas', 'plataforma', 'software', 'cloud'],
    crescimento: ['crescimento', 'cresceu', 'grew', 'aumento', '%', 'alta'],
    vendas: ['vendas', 'faturamento', 'gmv', 'bilhão', 'milhão', 'r$', 'us$', 'revenue'],
    lojas: ['lojas', 'lojistas', 'tiendas', 'stores', 'merchant', 'sellers', 'comerciantes'],
    pagamento: ['pagamento', 'pix', 'cartão', 'checkout', 'pagos'],
    ia: ['ia', 'ai', 'inteligência artificial', 'artificial intelligence'],
  };

  let score = 0;
  let matched = [];

  for (const [cat, words] of Object.entries(keywords)) {
    const inFato = words.some(w => textoFato.includes(w));
    const inArtigo = words.some(w => textoArtigo.includes(w));
    if (inFato && inArtigo) {
      score += 3;
      matched.push(cat);
    } else if (inFato) {
      score += 0.5;
    }
  }

  // Bônus se idioma do artigo combina com o tom do fato
  if (artigo.idioma === 'pt' && /portugu|brasil/i.test(fato)) score += 2;
  if (artigo.idioma === 'es' && /espan|argentina|méxico|chile|colombia|latam|latina/i.test(fato)) score += 2;
  if (artigo.idioma === 'en' && /english|growth|stores|brazil|latin america|brazilian/i.test(fato)) score += 1;

  return { score, matched };
}

// ─── TEMPLATES DE CITAÇÃO POR IDIOMA ──────────────────────────────
function gerarTemplate(artigo, materia) {
  const hoje = new Date().toISOString().slice(0, 10);
  const tituloMateria = (materia.fato || '').length > 80
    ? materia.fato.slice(0, 80) + '...'
    : (materia.fato || '<TÍTULO DA MATÉRIA>');

  if (artigo.idioma === 'pt') {
    return `{{Citar web|url=${materia.url}|título=${tituloMateria}|publicação=${materia.veiculo}|acessadoem=${hoje}}}`;
  } else if (artigo.idioma === 'es') {
    return `{{Cita web|url=${materia.url}|título=${tituloMateria}|publicación=${materia.veiculo}|fechaacceso=${hoje}}}`;
  } else {
    return `{{Cite web|url=${materia.url}|title=${tituloMateria}|publisher=${materia.veiculo}|access-date=${hoje}}}`;
  }
}

// ─── GERA PARÁGRAFO SUGERIDO ─────────────────────────────────────
function gerarParagrafo(artigo, materia) {
  if (!materia.fato) return '';
  const template = gerarTemplate(artigo, materia);
  const refName = `nuvem_${artigo.titulo.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`;

  // Frase introdutória por idioma
  let intro = '';
  if (artigo.idioma === 'pt') {
    intro = `Segundo o veículo ${materia.veiculo}, `;
  } else if (artigo.idioma === 'es') {
    intro = `Según ${materia.veiculo}, `;
  } else {
    intro = `According to ${materia.veiculo}, `;
  }

  return `${intro}${materia.fato}<ref name="${refName}">${template}</ref>`;
}

// ─── CRUZAMENTO: matérias × artigos ──────────────────────────────
// Pra cada artigo, escolhe a matéria com melhor fit
function cruzarMateriasComArtigos() {
  return ARTIGOS.map(art => {
    let melhor = { fit: 0, materia: null, matched: [] };
    for (const mat of MATERIAS) {
      const fit = calcularFit(mat.fato, art);
      if (fit.score > melhor.fit) {
        melhor = { fit: fit.score, materia: mat, matched: fit.matched };
      }
    }

    // Score >= 3 = combinação válida
    if (melhor.materia && melhor.fit >= 3) {
      return {
        ...art,
        paragrafo_sugerido: gerarParagrafo(art, melhor.materia),
        fato_usado: melhor.materia.fato,
        fonte_citacao: melhor.materia.url,
        template_ref: gerarTemplate(art, melhor.materia),
        materia_score: melhor.fit,
        materia_veiculo: melhor.materia.veiculo,
        materia_keywords: melhor.matched,
      };
    }

    return { ...art, paragrafo_sugerido: '', fato_usado: '', fonte_citacao: '', template_ref: '' };
  });
}

// ─── RENDER STATS ─────────────────────────────────────────────────
function renderStats() {
  const total = DATA.length;
  let pendente = 0, aprovado = 0;
  const langs = new Set();
  DATA.forEach(d => {
    const s = getStatus(d).status;
    if (s === 'PENDENTE') pendente++;
    if (s === 'APROVADO') aprovado++;
    langs.add(d.idioma);
  });
  const comMateria = DATA.filter(d => d.paragrafo_sugerido).length;
  document.getElementById('st-total').textContent = total;
  document.getElementById('st-pendente').textContent = pendente;
  document.getElementById('st-aprovado').textContent = aprovado;
  document.getElementById('st-pageviews').textContent = comMateria;
  document.getElementById('st-idiomas').textContent = langs.size || '—';

  // Atualizar label da 4ª stat
  const labelStat = document.querySelectorAll('.stat-label')[3];
  const trendStat = document.querySelectorAll('.stat-trend')[3];
  if (labelStat) labelStat.textContent = 'Com matéria';
  if (trendStat) trendStat.textContent = 'cruzadas com imprensa';
}

function renderControls() {
  const langSel = document.getElementById('f-lang');
  const langs = [...new Set(DATA.map(d => d.idioma))].sort();
  langSel.innerHTML = '<option value="">todos</option>' +
    langs.map(l => `<option value="${l}">${l.toUpperCase()}</option>`).join('');
  document.getElementById('controls').style.display = 'flex';
}

function filteredData() {
  const lang = document.getElementById('f-lang').value;
  const status = document.getElementById('f-status').value;
  const sort = document.getElementById('f-sort').value;
  const q = document.getElementById('f-search').value.toLowerCase().trim();

  let out = DATA.filter(d => {
    if (lang && d.idioma !== lang) return false;
    if (status && getStatus(d).status !== status) return false;
    if (q) {
      const blob = `${d.titulo} ${d.concorrentes_citados} ${d.fato_usado} ${d.paragrafo_sugerido}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'score') out.sort((a,b) => (b.score||0) - (a.score||0));
  else if (sort === 'pageviews') out.sort((a,b) => (b.materia_score||0) - (a.materia_score||0));
  else if (sort === 'titulo') out.sort((a,b) => a.titulo.localeCompare(b.titulo));
  return out;
}

// ─── INPUT PANEL (CORAÇÃO DA FERRAMENTA) ──────────────────────────
function renderInputPanel() {
  const container = document.getElementById('feed-container');
  container.innerHTML = `
    <div class="input-panel">
      <div class="input-card">
        <div class="input-header">
          <div class="input-icon" style="background:#E8EAF2;font-size:24px">📰</div>
          <div class="input-title">
            <h3>Cole matérias da imprensa</h3>
            <p>Para cada matéria, informe a <strong>URL</strong>, o <strong>fato</strong> citável e o <strong>veículo</strong>. A ferramenta cruza com <strong id="art-count">${ARTIGOS.length || 14}</strong> artigos da Wikipédia que falam de e-commerce mas não citam a Nuvemshop.</p>
          </div>
        </div>

        <div class="input-instructions">
          <strong>Como funciona:</strong> você cola URLs de matérias reais (Exame, Valor, Bloomberg, ExpoEcomm, E-commerce Brasil...) + 1 frase com o fato citável dessa matéria. A ferramenta cruza com os artigos da Wikipédia já mapeados e mostra qual matéria cabe em qual artigo. Use fontes secundárias confiáveis pra satisfazer <code>WP:V</code>.
          <div class="source-badges">
            <span class="source-badge">Exame</span>
            <span class="source-badge">Valor Econômico</span>
            <span class="source-badge">Bloomberg Línea</span>
            <span class="source-badge">E-commerce Brasil</span>
            <span class="source-badge">Reuters / TechCrunch</span>
          </div>
        </div>

        <div id="materia-list"></div>

        <div class="input-actions">
          <button class="btn-add" onclick="addMateriaRow()">+ Adicionar outra matéria</button>
          <button class="btn-primary" onclick="processarMaterias()">🔍 Mapear na Wikipédia →</button>
        </div>

        <div class="processing" id="processing">
          <div class="processing-header">
            <div class="spinner"></div>
            <span>Cruzando suas matérias com a Wikipédia</span>
          </div>
          <div class="processing-step pending" data-step="1">Validando URLs fornecidas</div>
          <div class="processing-step pending" data-step="2">Analisando fatos colados</div>
          <div class="processing-step pending" data-step="3">Carregando artigos da Wikipédia</div>
          <div class="processing-step pending" data-step="4">Cruzando fatos com artigos por palavras-chave</div>
          <div class="processing-step pending" data-step="5">Montando parágrafos e templates de citação</div>
        </div>
      </div>
    </div>`;

  // Adiciona linha inicial vazia
  addMateriaRow();
}

function addMateriaRow() {
  const list = document.getElementById('materia-list');
  if (!list) return;
  const n = list.children.length + 1;
  const row = document.createElement('div');
  row.className = 'materia-row';
  row.innerHTML = `
    <div class="materia-header">
      <div class="materia-num">${String(n).padStart(2, '0')}</div>
      <span class="materia-label">Matéria ${n}</span>
      <button class="remove-btn" onclick="removeMateriaRow(this)" title="Remover">×</button>
    </div>
    <div class="materia-fields">
      <input type="url" placeholder="URL da matéria (https://exame.com/...)" class="m-url">
      <textarea placeholder="O fato citável da matéria. Ex: 'A Nuvemshop registrou crescimento de 35% em 2025, com R$ 6,5 bilhões em vendas no Brasil.'" class="m-fato" rows="2"></textarea>
      <input type="text" placeholder="Veículo (Exame, Valor, Bloomberg Línea...)" class="m-veiculo">
    </div>`;
  list.appendChild(row);
  setTimeout(() => row.querySelector('input.m-url')?.focus(), 50);
}

function removeMateriaRow(btn) {
  const list = document.getElementById('materia-list');
  if (list.children.length <= 1) {
    btn.closest('.materia-row').querySelectorAll('input, textarea').forEach(el => el.value = '');
    return;
  }
  btn.closest('.materia-row').remove();
  [...list.children].forEach((row, i) => {
    row.querySelector('.materia-num').textContent = String(i + 1).padStart(2, '0');
    row.querySelector('.materia-label').textContent = `Matéria ${i + 1}`;
  });
}

// ─── PROCESSAR MATÉRIAS (CRUZAR COM WIKIPÉDIA) ────────────────────
async function processarMaterias() {
  const rows = document.querySelectorAll('.materia-row');
  const materias = [];
  rows.forEach(row => {
    const url = row.querySelector('.m-url').value.trim();
    const fato = row.querySelector('.m-fato').value.trim();
    const veiculo = row.querySelector('.m-veiculo').value.trim();
    if (url && fato) {
      materias.push({ url, fato, veiculo: veiculo || 'Fonte externa' });
    }
  });

  if (materias.length === 0) {
    return toast('Cole pelo menos uma matéria com URL e fato');
  }

  const invalid = materias.filter(m => !isValidUrl(m.url));
  if (invalid.length) return toast(`URL inválida: ${invalid[0].url.slice(0, 40)}...`);

  MATERIAS = materias;
  const proc = document.getElementById('processing');
  proc.classList.add('show');

  const steps = document.querySelectorAll('.processing-step');
  for (let i = 0; i < steps.length; i++) {
    steps[i].classList.remove('pending');
    steps[i].classList.add('active');
    await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
    steps[i].classList.remove('active');
    steps[i].classList.add('done');
  }

  // Se artigos ainda não carregados, carrega agora
  if (ARTIGOS.length === 0) {
    try {
      const res = await fetch('oportunidades.json?t=' + Date.now());
      if (res.ok) ARTIGOS = await res.json();
    } catch (e) {
      toast('Erro ao carregar artigos da Wikipédia');
      return;
    }
  }

  if (ARTIGOS.length === 0) {
    toast('Nenhum artigo da Wikipédia disponível pra cruzamento');
    return;
  }

  // CRUZAR!
  DATA = cruzarMateriasComArtigos();
  const comSugestao = DATA.filter(a => a.paragrafo_sugerido).length;

  renderControls();
  renderStats();
  renderFeed();

  toast(`✓ ${comSugestao} de ${DATA.length} artigos receberam sugestão de parágrafo`);
}

// ─── RENDER FEED DE ARTIGOS ───────────────────────────────────────
function renderFeed() {
  const container = document.getElementById('feed-container');
  const items = filteredData();

  if (DATA.length === 0) {
    renderInputPanel();
    return;
  }

  let html = `<div class="feed-wrap"><div class="feed-header">
    <h2>Oportunidades cruzadas</h2>
    <span class="feed-count">${items.length} de ${DATA.length} · ${MATERIAS.length} matéria(s) usada(s)</span>
  </div>`;

  items.forEach(d => {
    const st = getStatus(d);
    const cls = st.status === 'APROVADO' ? 'done' : st.status === 'REJEITADO' ? 'skip' : '';
    const competitors = (d.concorrentes_citados || '').split(',').map(c => c.trim()).filter(Boolean);

    html += `
      <article class="card ${cls}" data-key="${escapeHtml(statusKey(d))}">
        <div class="card-main">
          <div class="card-meta">
            <span class="tag tag-lang">${escapeHtml(d.idioma.toUpperCase())}</span>
            <span class="tag tag-score">${escapeHtml(d.score)}</span>
            ${d.materia_score ? `<span class="tag tag-views">fit ${d.materia_score.toFixed(0)}</span>` : ''}
            <span class="tag-source">via ${escapeHtml(d.fonte_descoberta)}</span>
          </div>
          <h3 class="card-title"><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.titulo)}</a></h3>
          <div class="card-competitors">
            <strong>Concorrentes citados:</strong>
            ${competitors.length ? competitors.map(c => `<span class="competitor-chip">${escapeHtml(c)}</span>`).join('') : '<span style="color:var(--ink-fade)">nenhum</span>'}
          </div>
          ${d.paragrafo_sugerido ? `
            <div class="suggestion">
              <div class="suggestion-label">🔗 Parágrafo sugerido · matéria: ${escapeHtml(d.materia_veiculo || '')}</div>
              <div class="suggestion-text">${escapeHtml(d.paragrafo_sugerido)}</div>
              <div class="suggestion-foot">
                <div><strong>Fato usado:</strong> ${escapeHtml(d.fato_usado || '—')}</div>
                <div><strong>Fonte:</strong> <a href="${escapeHtml(d.fonte_citacao)}" target="_blank" rel="noopener" style="color:var(--brand)">${escapeHtml(d.fonte_citacao)}</a></div>
              </div>
            </div>
            ${d.template_ref ? `
              <div class="ref-block">
                <button class="copy-btn" data-copy="${escapeHtml(d.template_ref)}">Copiar</button>
                ${escapeHtml(d.template_ref)}
              </div>` : ''}
          ` : `<div class="suggestion" style="background:var(--bg-soft);border-color:var(--rule);border-left-color:var(--ink-fade)"><div class="suggestion-label" style="color:var(--ink-fade)">Sem matéria cruzada ainda</div><div style="font-size:13px;color:var(--ink-soft)">Adicione matérias relevantes a esse tema (e-commerce, SaaS, América Latina) pra gerar sugestão automática.</div></div>`}
          <a class="external-link" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Abrir na Wikipédia →</a>
        </div>
        <aside class="card-side">
          <div>
            <div class="side-label">Status de validação</div>
            <div class="status-grid">
              ${['PENDENTE','APROVADO','REVISAR','REJEITADO'].map(s => `
                <button class="status-btn ${st.status === s ? 'active' : ''}" data-status="${s}">${s.toLowerCase()}</button>
              `).join('')}
            </div>
          </div>
          <div>
            <div class="side-label">Notas do revisor</div>
            <textarea class="notes-area" placeholder="Anotações...">${escapeHtml(st.notes)}</textarea>
          </div>
        </aside>
      </article>`;
  });
  html += '</div>';
  container.innerHTML = html;
  bindCardEvents();
}

function bindCardEvents() {
  document.querySelectorAll('.card').forEach(card => {
    const key = card.dataset.key;
    const item = DATA.find(d => statusKey(d) === key);
    if (!item) return;

    card.querySelectorAll('.status-btn').forEach(btn => {
      btn.onclick = () => {
        setStatus(item, btn.dataset.status);
        renderFeed(); renderStats();
      };
    });
    const ta = card.querySelector('.notes-area');
    if (ta) ta.oninput = () => setStatus(item, getStatus(item).status, ta.value);

    card.querySelectorAll('.copy-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copy).then(() => toast('Template copiado'));
      };
    });
  });
}

// ─── EVENT HANDLERS ───────────────────────────────────────────────
function initEventHandlers() {
  const lang = document.getElementById('f-lang');
  const status = document.getElementById('f-status');
  const sort = document.getElementById('f-sort');
  const search = document.getElementById('f-search');
  if (lang) lang.onchange = renderFeed;
  if (status) status.onchange = renderFeed;
  if (sort) sort.onchange = renderFeed;
  if (search) search.oninput = renderFeed;

  const reset = document.getElementById('btn-reset');
  if (reset) reset.onclick = () => {
    if (confirm('Resetar todos os status e notas armazenados localmente?')) {
      STATUSES = {}; saveStatuses(); renderFeed(); renderStats(); toast('Status resetado');
    }
  };

  const reload = document.getElementById('btn-reload');
  if (reload) reload.onclick = () => {
    DATA = [];
    MATERIAS = [];
    document.getElementById('controls').style.display = 'none';
    renderInputPanel();
  };

  const exp = document.getElementById('btn-export');
  if (exp) exp.onclick = () => {
    if (!DATA.length) return toast('Nada para exportar');
    const headers = ['idioma','titulo','url','score','concorrentes_citados','sugestao_secao','paragrafo_sugerido','fato_usado','fonte_citacao','veiculo','template_ref','status_validacao','notas_revisor'];
    const rows = DATA.map(d => {
      const st = getStatus(d);
      return [d.idioma, d.titulo, d.url, d.score, d.concorrentes_citados, d.sugestao_secao, d.paragrafo_sugerido, d.fato_usado, d.fonte_citacao, d.materia_veiculo, d.template_ref, st.status, st.notes];
    });
    const csv = [headers, ...rows].map(r =>
      r.map(cell => {
        const s = String(cell ?? '').replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nuvemshop_wiki_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado');
  };
}

// ─── INICIALIZAÇÃO ────────────────────────────────────────────────
(async function init() {
  loadStatuses();
  initEventHandlers();

  // Carrega artigos da Wikipédia (pra ter o número certo no painel inicial)
  try {
    const res = await fetch('oportunidades.json?t=' + Date.now());
    if (res.ok) {
      ARTIGOS = await res.json();
    }
  } catch (e) {
    console.log('Sem oportunidades.json ainda', e);
  }

  // Mostra a tela inicial com o input de matérias
  renderInputPanel();

  // Atualiza o contador de artigos disponíveis
  const elCount = document.getElementById('art-count');
  if (elCount) elCount.textContent = ARTIGOS.length;

  document.getElementById('timestamp').textContent = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
})();
