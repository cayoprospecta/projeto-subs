const CONFIG = {
  SUPABASE_URL: "https://chyiakakkugjmlfuzqmf.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeWlha2Fra3Vnam1sZnV6cW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjgwNTIsImV4cCI6MjA5ODU0NDA1Mn0.mHEMc_92U3rU7rJrepOkFjE1ThtDa7w3qUnexs_ITaA",
  TABLE: "substabelecidos",
  COL_CNPJ_GRUPO: "cnpj_empresa",
  TABLE_EMPRESAS: "empresas_grupo",
  TABLE_BANCOS: "bancos",
  TABLE_HIST: "historico",
  TABLE_AGENDA: "agenda",
  TABLE_MENSAGENS: "mensagem",
  TABLE_PRODUCAO: "producao_mensal",
  TABLE_PRODUCAO_CONVENIO: "producao_convenio",
  AUTH_EMAIL_DOMAIN: "prospecta.local",
  PAGE_SIZE: 25
};

const state = {
  rows: [],
  empresas: [],
  bancos: [],
  filtered: [],
  page: 1,
  gestor: false,
  gestorNome: null,
  session: null,
  editingId: null,
  editingBancoId: null,
  editingPassoId: null,
  obsMode: null,
  obsSubId: null,
  obsPendingBody: null,
  hist: [],
  agenda: [],
  agendaRef: new Date,
  editingAgendaId: null,
  alertasVistos: false,
  painelFiltro: "TODOS",
  sortCol: null,
  sortDir: 1,
  duvidas: [],
  duvidasCarregadas: false,
  editingDuvidaId: null
};

const H = () => ({
  apikey: CONFIG.SUPABASE_KEY,
  Authorization: "Bearer " + (state.session && state.session.access_token ? state.session.access_token : CONFIG.SUPABASE_KEY),
  "Content-Type": "application/json"
});

const REST = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE}`;

const REST_EMP = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_EMPRESAS}`;

const REST_BANCOS = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_BANCOS}`;

const REST_HIST = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_HIST}`;

const REST_AGENDA = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_AGENDA}`;

const REST_PRODUCAO = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_PRODUCAO}`;

const REST_PRODUCAO_CONVENIO = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_PRODUCAO_CONVENIO}`;

const REST_MSG = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_MENSAGENS}`;

const $ = id => document.getElementById(id);

const norm = v => (v == null ? "" : String(v)).trim();

const lower = v => norm(v).toLowerCase();

const LS_PENDENTES = "prospecta_duvidas_pendentes";

const getPendentes = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_PENDENTES) || "[]");
  } catch (e) {
    return [];
  }
};

const setPendentes = arr => localStorage.setItem(LS_PENDENTES, JSON.stringify(arr));

const addPendente = id => {
  const p = getPendentes();
  if (!p.includes(id)) {
    p.push(id);
    setPendentes(p);
  }
};

const LS_MINHAS = "prospecta_minhas_duvidas";

const getMinhas = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_MINHAS) || "[]");
  } catch (e) {
    return [];
  }
};

const addMinha = id => {
  const p = getMinhas();
  if (!p.includes(id)) {
    p.push(id);
    localStorage.setItem(LS_MINHAS, JSON.stringify(p));
  }
};

const LS_HISTORICO = "prospecta_notif_historico";

const getHistorico = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORICO) || "[]");
  } catch (e) {
    return [];
  }
};

const setHistorico = arr => localStorage.setItem(LS_HISTORICO, JSON.stringify(arr));

const isReal = r => norm(r.nome_subs) || norm(r.cnpj_subs);

const UF_REGIAO = {
  AC: "Norte",
  AP: "Norte",
  AM: "Norte",
  PA: "Norte",
  RO: "Norte",
  RR: "Norte",
  TO: "Norte",
  AL: "Nordeste",
  BA: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  PB: "Nordeste",
  PE: "Nordeste",
  PI: "Nordeste",
  RN: "Nordeste",
  SE: "Nordeste",
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
  ES: "Sudeste",
  MG: "Sudeste",
  RJ: "Sudeste",
  SP: "Sudeste",
  PR: "Sul",
  RS: "Sul",
  SC: "Sul"
};

function ufDoSub(r) {
  const m = norm(r.cod_substabelecido).toUpperCase().match(/^([A-Z]{2})/);
  return m && UF_REGIAO[m[1]] ? m[1] : null;
}

const AUTH_URL = () => `${CONFIG.SUPABASE_URL}/auth/v1`;

const SESSION_KEY = "prospecta_session";

function loginParaEmail(login) {
  login = login.trim();
  return login.includes("@") ? login : `${login}@${CONFIG.AUTH_EMAIL_DOMAIN}`;
}

function salvarSessao(session) {
  state.session = session;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {}
  agendarRefreshSessao();
}

function limparSessao() {
  state.session = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {}
  if (state._refreshTimer) clearTimeout(state._refreshTimer);
}

async function authLogin(login, senha) {
  try {
    const res = await fetch(`${AUTH_URL()}/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: loginParaEmail(login),
        password: senha
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || `HTTP ${res.status}`);
    salvarSessao({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1e3
    });
    const nome = data.user && data.user.user_metadata && data.user.user_metadata.nome || data.user && data.user.email && data.user.email.split("@")[0] || "Gestor(a)";
    return {
      nome: nome
    };
  } catch (e) {
    console.error("authLogin:", e);
    return null;
  }
}

async function authRefresh() {
  if (!state.session || !state.session.refresh_token) return false;
  try {
    const res = await fetch(`${AUTH_URL()}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        refresh_token: state.session.refresh_token
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || `HTTP ${res.status}`);
    salvarSessao({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1e3
    });
    return true;
  } catch (e) {
    console.error("authRefresh:", e);
    limparSessao();
    if (state.gestor) {
      toast("Sua sessão expirou. Faça login novamente.", "err");
      sairGestor();
    }
    return false;
  }
}

function agendarRefreshSessao() {
  if (state._refreshTimer) clearTimeout(state._refreshTimer);
  if (!state.session) return;
  const ms = Math.max(state.session.expires_at - Date.now() - 6e4, 5e3);
  state._refreshTimer = setTimeout(authRefresh, ms);
}

async function authLogout() {
  if (state.session && state.session.access_token) {
    try {
      await fetch(`${AUTH_URL()}/logout`, {
        method: "POST",
        headers: {
          apikey: CONFIG.SUPABASE_KEY,
          Authorization: "Bearer " + state.session.access_token
        }
      });
    } catch (e) {
      console.error("authLogout:", e);
    }
  }
  limparSessao();
}

async function restaurarSessao() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch (e) {}
  if (!saved) return null;
  state.session = saved;
  if (saved.expires_at - Date.now() < 6e4) {
    const ok = await authRefresh();
    if (!ok) return null;
  } else {
    agendarRefreshSessao();
  }
  try {
    const res = await fetch(`${AUTH_URL()}/user`, {
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: "Bearer " + state.session.access_token
      }
    });
    if (!res.ok) throw new Error("sessão inválida");
    const user = await res.json();
    return {
      nome: user.user_metadata && user.user_metadata.nome || (user.email || "").split("@")[0] || "Gestor(a)"
    };
  } catch (e) {
    limparSessao();
    return null;
  }
}

function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show " + (kind || "");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.className = "", 2600);
}

async function carregar() {
  $("count").textContent = "carregando…";
  try {
    const [resSubs, resEmp, resBancos, resAgenda] = await Promise.all([ fetch(`${REST()}?select=*&order=id.asc`, {
      headers: H()
    }), fetch(`${REST_EMP()}?select=razao_social,fantasia,cnpj&order=razao_social.asc`, {
      headers: H()
    }), fetch(`${REST_BANCOS()}?select=*&order=nome_banco.asc`, {
      headers: H()
    }), fetch(`${REST_AGENDA()}?select=*&order=data.asc,hora.asc`, {
      headers: H()
    }) ]);
    if (!resSubs.ok) throw new Error(`subs HTTP ${resSubs.status} — ${await resSubs.text()}`);
    state.rows = await resSubs.json();
    if (resEmp.ok) {
      state.empresas = await resEmp.json();
      montarEmpresasSelect();
    } else {
      console.warn("empresas_grupo:", resEmp.status, await resEmp.text());
      toast("Empresas do grupo não carregaram (RLS?).", "err");
    }
    if (resBancos.ok) {
      state.bancos = await resBancos.json();
    } else {
      console.warn("bancos:", resBancos.status, await resBancos.text());
    }
    if (resAgenda.ok) {
      state.agenda = await resAgenda.json();
      checarAlertas();
    } else {
      console.warn("agenda:", resAgenda.status, await resAgenda.text());
    }
    montarFiltros();
    aplicarFiltros();
    if (!state.gestor && $("viewBancosConsulta").style.display !== "none") renderBancosConsulta();
    if (state.gestor) renderKPIs();
    toast("Dados atualizados", "ok");
  } catch (e) {
    console.error(e);
    $("count").textContent = "erro ao carregar";
    toast("Falha ao carregar do Supabase. Veja o console (F12).", "err");
  }
}

function montarEmpresasSelect() {
  const sel = $("f_razao"), atual = sel.value;
  const opts = state.empresas.filter(e => norm(e.razao_social)).map(e => {
    const label = norm(e.fantasia) ? `${escapeHtml(e.razao_social)} — ${escapeHtml(e.fantasia)}` : escapeHtml(e.razao_social);
    return `<option value="${escapeHtml(norm(e.razao_social))}" data-cnpj="${escapeHtml(norm(e.cnpj))}">${label}</option>`;
  }).join("");
  sel.innerHTML = `<option value="">Selecione…</option>` + opts;
  if (atual) sel.value = atual;
}

function distintos(campo) {
  return [ ...new Set(state.rows.filter(isReal).map(r => norm(r[campo])).filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function montarFiltros() {
  const fill = (sel, vals) => {
    const el = $(sel), atual = el.value;
    const base = '<option value="">Todos</option>';
    el.innerHTML = base + vals.map(v => `<option>${escapeHtml(v)}</option>`).join("");
    el.value = atual && vals.includes(atual) ? atual : "";
  };
  const bancosCadastrados = [ ...new Set(state.bancos.map(b => norm(b.nome_banco)).filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  fill("fBanco", bancosCadastrados);
  fill("fTipo", distintos("tipo_cadastro"));
  fill("fGerente", distintos("gerente_comercial"));
  preencherBancosForm();
}

function preencherBancosForm() {
  const sel = $("f_banco");
  if (!sel) return;
  const atual = sel.value;
  const nomes = [ ...new Set(state.bancos.filter(b => norm(b.status).toUpperCase() !== "INATIVO").map(b => norm(b.nome_banco)).filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  sel.innerHTML = '<option value="">Selecione…</option>' + nomes.map(v => `<option>${escapeHtml(v)}</option>`).join("");
  if (atual && nomes.includes(atual)) sel.value = atual;
}

function aplicarFiltros() {
  const q = lower($("fBusca").value), banco = $("fBanco").value, st = $("fStatus").value, tipo = $("fTipo").value, ger = $("fGerente").value;
  state.aguardandoBanco = !state.gestor && !banco;
  if (state.aguardandoBanco) {
    state.filtered = [];
    state.page = 1;
    renderTabela();
    return;
  }
  state.filtered = state.rows.filter(isReal).filter(r => {
    if (banco && norm(r.banco) !== banco) return false;
    if (st && norm(r.status).toUpperCase() !== st) return false;
    if (tipo && norm(r.tipo_cadastro) !== tipo) return false;
    if (ger && norm(r.gerente_comercial) !== ger) return false;
    if (q) {
      const blob = [ r.nome_subs, r.cnpj_subs, r.cod_loja_banco, r.cod_substabelecido, r.cod_parceiro, r.responsavel_empresa, r.banco ].map(lower).join(" ");
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  ordenarFiltrados();
  state.page = 1;
  renderTabela();
}

const SORT_COLS = [ "nome_subs", "banco", "tipo_cadastro", "comissao" ];

function ordenarFiltrados() {
  const col = state.sortCol;
  if (!col) return;
  const dir = state.sortDir;
  state.filtered.sort((a, b) => {
    const va = norm(a[col]), vb = norm(b[col]);
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return va.localeCompare(vb, "pt-BR", {
      numeric: true,
      sensitivity: "base"
    }) * dir;
  });
}

function atualizarSetasCabecalho() {
  document.querySelectorAll("#tabelaSubs thead th.sortable").forEach(th => {
    const col = th.dataset.sort;
    const ic = th.querySelector(".sort-ic");
    if (col === state.sortCol) {
      th.classList.add("sorted");
      ic.textContent = state.sortDir === 1 ? "▲" : "▼";
    } else {
      th.classList.remove("sorted");
      ic.textContent = "";
    }
  });
}

function ordenarPorColuna(col) {
  if (state.sortCol === col) state.sortDir = -state.sortDir; else {
    state.sortCol = col;
    state.sortDir = 1;
  }
  ordenarFiltrados();
  state.page = 1;
  renderTabela();
  atualizarSetasCabecalho();
}

function renderTabela() {
  const {filtered: filtered, page: page} = state, size = CONFIG.PAGE_SIZE;
  const total = filtered.length, pages = Math.max(1, Math.ceil(total / size));
  state.page = Math.min(page, pages);
  const ini = (state.page - 1) * size, slice = filtered.slice(ini, ini + size);
  $("count").innerHTML = state.aguardandoBanco ? "—" : `<b>${total}</b> registro${total !== 1 ? "s" : ""}`;
  const es = $("emptyState");
  if (state.aguardandoBanco) {
    es.innerHTML = "<b>Selecione um banco</b>Escolha um banco no filtro ao lado para exibir a lista de substabelecidos.";
    es.style.display = "block";
  } else {
    es.innerHTML = "<b>Nada encontrado</b>Ajuste os filtros ou limpe a busca.";
    es.style.display = total ? "none" : "block";
  }
  const tb = $("tbody");
  tb.innerHTML = slice.map(r => {
    const stU = norm(r.status).toUpperCase();
    const badge = badgeStatus(stU);
    const acoes = state.gestor ? `<td><div class="rowact">\n        <button class="btn sm" data-edit="${r.id}">Editar</button>\n        <div class="status-menu-wrap">\n          <button class="btn sm" data-statusmenu="${r.id}">Alterar status</button>\n        </div>\n      </div></td>` : "";
    const nome = escapeHtml(norm(r.nome_subs) || "—");
    const nomeCell = state.gestor ? `<td class="empresa"><span class="linklike" data-obs="${r.id}" title="Observações">${nome}</span>${temObs(r) ? ' <span class="obs-dot" title="tem observação">●</span>' : ""}</td>` : `<td class="empresa">${nome}</td>`;
    return `<tr data-rowid="${r.id}" title="Ver ficha completa">\n      ${nomeCell}\n      <td class="mono">${escapeHtml(norm(r.cnpj_subs) || "—")}</td>\n      <td>${escapeHtml(norm(r.banco) || "—")}</td>\n      <td>${escapeHtml(norm(r.tipo_cadastro) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(r.cod_loja_banco) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(r.cod_substabelecido) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(r.cod_parceiro) || "—")}</td>\n      <td>${escapeHtml(norm(r.responsavel_empresa) || "—")}</td>\n      <td>${escapeHtml(norm(r.gerente_comercial) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(r.comissao) || "—")}</td>\n      <td>${badge}</td>\n      ${acoes}\n    </tr>`;
  }).join("");
  $("pageInfo").textContent = total ? `Página ${state.page} de ${pages} · exibindo ${slice.length}` : "";
  $("prevBtn").disabled = state.page <= 1;
  $("nextBtn").disabled = state.page >= pages;
}

const PALETTE = [ "#2563eb", "#0f9d6b", "#7c3aed", "#e5484d", "#b7791f", "#0891b2", "#db2777", "#65a30d", "#f59e0b", "#64748b" ];

function contarPor(lista, fn, rotuloVazio) {
  const out = {};
  lista.forEach(item => {
    const k = fn(item) || rotuloVazio;
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function buildDonutCard(titulo, obj, opts) {
  opts = opts || {};
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  let acc = 0;
  const stops = entries.map(([, n], i) => {
    const color = PALETTE[i % PALETTE.length];
    const from = acc, to = acc + (total ? n / total * 100 : 0);
    acc = to;
    return `${color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  }).join(", ");
  const legend = entries.map(([label, n], i) => {
    const det = opts.det ? ` data-det-tipo="${opts.det}" data-det-valor="${escapeHtml(label)}"` : "";
    return `<div class="dl-item${opts.det ? " dl-click" : ""}"${det} title="${opts.det ? `Clique para ver detalhes de ${escapeHtml(label)}` : ""}">\n      <span class="dl-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>\n      <span class="dl-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span><b>${n}</b>\n    </div>`;
  }).join("");
  return `<div class="painel-card${opts.wide ? " wide" : ""}">\n    <div class="painel-card-title">${titulo}</div>\n    <div class="donut-wrap${opts.wide ? " wide" : ""}">\n      <div class="donut${opts.wide ? " lg" : ""} reveal" style="background:conic-gradient(${stops || "var(--line) 0 100%"})">\n        <div class="donut-hole"><b>${total}</b><span>total</span></div>\n      </div>\n      <div class="donut-legend${opts.wide ? " wide" : ""}">${legend || '<div class="dl-empty">Sem dados</div>'}</div>\n    </div>\n  </div>`;
}

function buildTowerCard(titulo, obj, opts) {
  opts = opts || {};
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, opts.limite || 12);
  if (!entries.length) return `<div class="painel-card"><div class="painel-card-title">${titulo}</div><div class="dl-empty">Sem dados</div></div>`;
  const max = entries[0][1] || 1;
  const bars = entries.map(([label, n], i) => {
    const h = Math.max(4, Math.round(n / max * 100));
    const cor = opts.colorful ? PALETTE[i % PALETTE.length] : "";
    const delay = (i * .06).toFixed(2) + "s";
    const det = opts.det ? ` data-det-tipo="${opts.det}" data-det-valor="${escapeHtml(label)}"` : "";
    return `<div class="tower-bar${opts.det ? " tw-click" : ""}"${det} title="${escapeHtml(label)} — clique para detalhar">\n      <span class="tw-val">${n}</span>\n      <span class="tw-col${cor ? " c" : ""}" style="--h:${h}%;--d:${delay}${cor ? `;--c:${cor}` : ""}"></span>\n      <span class="tw-lab" title="${escapeHtml(label)}">${escapeHtml(label)}</span>\n    </div>`;
  }).join("");
  return `<div class="painel-card">\n    <div class="painel-card-title">${titulo}</div>\n    <div class="tower">${bars}</div>\n  </div>`;
}

function buildBarsCard(titulo, obj, limite) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limite || 10);
  const max = entries.length ? entries[0][1] : 1;
  const linhas = entries.map(([label, n]) => `<div class="k-bar">\n    <span class="n" title="${escapeHtml(label)}">${escapeHtml(label)}</span>\n    <span class="track"><span class="fill" style="width:${Math.round(n / max * 100)}%"></span></span>\n    <span class="v">${n}</span></div>`).join("");
  return `<div class="painel-card">\n    <div class="painel-card-title">${titulo}</div>\n    <div class="k-bars">${linhas || '<div class="dl-empty">Sem dados</div>'}</div>\n  </div>`;
}

function formatMes(chave) {
  const [y, m] = chave.split("-");
  const nomes = [ "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez" ];
  return `${nomes[(+m || 1) - 1]}/${y.slice(2)}`;
}

function buildLineCard(titulo, pares) {
  if (!pares.length) return `<div class="painel-card"><div class="painel-card-title">${titulo}</div><div class="dl-empty">Sem dados</div></div>`;
  const w = 320, h = 110, pad = 12;
  const max = Math.max(1, ...pares.map(p => p[1]));
  const stepX = pares.length > 1 ? (w - 2 * pad) / (pares.length - 1) : 0;
  const pts = pares.map((p, i) => [ pad + i * stepX, h - pad - p[1] / max * (h - 2 * pad) ]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--cyan)"></circle>`).join("");
  const labels = pares.map(p => `<span>${formatMes(p[0])}</span>`).join("");
  return `<div class="painel-card">\n    <div class="painel-card-title">${titulo}</div>\n    <svg viewBox="0 0 ${w} ${h}" class="line-chart" preserveAspectRatio="none">\n      <path d="${path}" fill="none" stroke="var(--cyan)" stroke-width="2"></path>${dots}\n    </svg>\n    <div class="line-labels">${labels}</div>\n  </div>`;
}

function renderPainel() {
  const reais = state.rows.filter(isReal);
  const ativos = reais.filter(r => norm(r.status).toUpperCase() === "ATIVO");
  const inativos = reais.filter(r => norm(r.status).toUpperCase() === "INATIVO");
  const pendentes = reais.filter(r => norm(r.status).toUpperCase() === "PENDENTE");
  const andamento = reais.filter(r => norm(r.status).toUpperCase() === "EM_ANDAMENTO");
  const incompFn = r => !norm(r.gerente_comercial) || !norm(r.status) || !norm(r.cod_substabelecido) && !norm(r.cod_loja_banco);
  const incompativeis = reais.filter(incompFn);
  const filtro = state.painelFiltro || "TODOS";
  let base = reais;
  if (filtro === "ATIVO") base = ativos; else if (filtro === "INATIVO") base = inativos; else if (filtro === "PENDENTE") base = pendentes; else if (filtro === "EM_ANDAMENTO") base = andamento; else if (filtro === "INCOMPATIVEL") base = incompativeis;
  const porBanco = contarPor(base, r => norm(r.banco), "Sem banco");
  const porUF = {}, porRegiao = {};
  base.forEach(r => {
    const uf = ufDoSub(r);
    if (uf) {
      porUF[uf] = (porUF[uf] || 0) + 1;
      porRegiao[UF_REGIAO[uf]] = (porRegiao[UF_REGIAO[uf]] || 0) + 1;
    } else porUF["Não identificado"] = (porUF["Não identificado"] || 0) + 1;
  });
  const kpi = (label, val, key, colorClass) => `<div class="kpi kpi-click ${filtro === key ? "active" : ""}" data-filtro="${key}">\n    <div class="k-label">${label}</div><div class="k-val ${colorClass || ""}">${val}</div>\n  </div>`;
  $("viewPainel").innerHTML = `\n    <section class="kpis">\n      ${kpi("Total de cadastros", reais.length, "TODOS")}\n      ${kpi("Ativos", ativos.length, "ATIVO", "cyan")}\n      ${kpi("Pendentes", pendentes.length, "PENDENTE")}\n      ${kpi("Em andamento", andamento.length, "EM_ANDAMENTO")}\n      ${kpi("Inativos", inativos.length, "INATIVO", "red")}\n      ${kpi("Incompatíveis", incompativeis.length, "INCOMPATIVEL")}\n    </section>\n    <div class="painel-grid">\n      ${buildDonutCard("Por região (UF do Cód. sub)", porRegiao, {
    det: "regiao",
    wide: true
  })}\n      ${buildTowerCard("Por banco", porBanco, {
    limite: 10,
    det: "banco"
  })}\n      ${buildTowerCard("Por UF", porUF, {
    colorful: true,
    limite: 14,
    det: "uf"
  })}\n    </div>`;
}

function painelBase() {
  const reais = state.rows.filter(isReal);
  const f = state.painelFiltro || "TODOS";
  if (f === "ATIVO") return reais.filter(r => norm(r.status).toUpperCase() === "ATIVO");
  if (f === "INATIVO") return reais.filter(r => norm(r.status).toUpperCase() === "INATIVO");
  if (f === "PENDENTE") return reais.filter(r => norm(r.status).toUpperCase() === "PENDENTE");
  if (f === "EM_ANDAMENTO") return reais.filter(r => norm(r.status).toUpperCase() === "EM_ANDAMENTO");
  if (f === "INCOMPATIVEL") return reais.filter(r => !norm(r.gerente_comercial) || !norm(r.status) || !norm(r.cod_substabelecido) && !norm(r.cod_loja_banco));
  return reais;
}

function abrirDetalhePainel(tipo, valor) {
  const base = painelBase();
  state.detalheAtual = {
    tipo: tipo,
    valor: valor
  };
  const badgeDe = r => badgeStatus(norm(r.status).toUpperCase());
  if (tipo === "banco") {
    const subs = base.filter(r => (norm(r.banco) || "Sem banco") === valor).sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
    const ativos = subs.filter(r => norm(r.status).toUpperCase() === "ATIVO").length;
    $("detalheKicker").textContent = "Banco";
    $("detalheTitle").textContent = valor;
    $("detalheBody").innerHTML = `\n      <div class="det-resumo">\n        <div class="det-kpi"><b>${subs.length}</b><span>sub${subs.length !== 1 ? "s" : ""}</span></div>\n        <div class="det-kpi"><b class="ok">${ativos}</b><span>ativos</span></div>\n        <div class="det-kpi"><b class="off">${subs.length - ativos}</b><span>demais</span></div>\n      </div>\n      <div class="det-sec">Substabelecidos deste banco</div>\n      <div class="det-list">\n        ${subs.map(r => `\n          <div class="det-item">\n            <div class="det-main">\n              <span class="det-nome">${escapeHtml(norm(r.nome_subs) || "—")}</span>\n              ${badgeDe(r)}\n            </div>\n            <div class="det-meta">\n              <span>CNPJ <b>${escapeHtml(norm(r.cnpj_subs) || "—")}</b></span>\n              <span>Tipo <b>${escapeHtml(norm(r.tipo_cadastro) || "—")}</b></span>\n              <span>Cód. sub <b>${escapeHtml(norm(r.cod_substabelecido) || "—")}</b></span>\n              <span>Gerente <b>${escapeHtml(norm(r.gerente_comercial) || "—")}</b></span>\n            </div>\n          </div>`).join("") || '<div class="dl-empty">Nenhum substabelecido.</div>'}\n      </div>`;
  } else if (tipo === "uf") {
    const subs = valor === "Não identificado" ? base.filter(r => !ufDoSub(r)) : base.filter(r => ufDoSub(r) === valor);
    const porBanco = {};
    subs.forEach(r => {
      const b = norm(r.banco) || "Sem banco";
      porBanco[b] = (porBanco[b] || 0) + 1;
    });
    const entries = Object.entries(porBanco).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 1;
    $("detalheKicker").textContent = "Unidade federativa";
    $("detalheTitle").textContent = valor === "Não identificado" ? "UF não identificada" : valor + (UF_REGIAO[valor] ? ` · ${UF_REGIAO[valor]}` : "");
    $("detalheBody").innerHTML = `\n      <div class="det-resumo">\n        <div class="det-kpi"><b>${subs.length}</b><span>sub${subs.length !== 1 ? "s" : ""} na UF</span></div>\n        <div class="det-kpi"><b>${entries.length}</b><span>banco${entries.length !== 1 ? "s" : ""}</span></div>\n      </div>\n      <div class="det-sec">Bancos com mais subs nesta UF</div>\n      <div class="k-bars det-bars">\n        ${entries.map(([b, n]) => `<div class="k-bar">\n          <span class="n" title="${escapeHtml(b)}">${escapeHtml(b)}</span>\n          <span class="track"><span class="fill" style="width:${Math.round(n / max * 100)}%"></span></span>\n          <span class="v">${n}</span></div>`).join("") || '<div class="dl-empty">Sem dados.</div>'}\n      </div>`;
  } else if (tipo === "regiao") {
    const subs = base.filter(r => UF_REGIAO[ufDoSub(r)] === valor).sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
    const porUF = {};
    subs.forEach(r => {
      const uf = ufDoSub(r) || "—";
      porUF[uf] = (porUF[uf] || 0) + 1;
    });
    const entriesUF = Object.entries(porUF).sort((a, b) => b[1] - a[1]);
    const maxUF = entriesUF.length ? entriesUF[0][1] : 1;
    $("detalheKicker").textContent = "Região";
    $("detalheTitle").textContent = valor;
    $("detalheBody").innerHTML = `\n      <div class="det-resumo">\n        <div class="det-kpi"><b>${subs.length}</b><span>sub${subs.length !== 1 ? "s" : ""} na região</span></div>\n        <div class="det-kpi"><b>${entriesUF.length}</b><span>estado${entriesUF.length !== 1 ? "s" : ""}</span></div>\n      </div>\n      <div class="det-sec">Estados dentro de ${escapeHtml(valor)}</div>\n      <div class="k-bars det-bars">\n        ${entriesUF.map(([uf, n]) => `<div class="k-bar">\n          <span class="n" title="${escapeHtml(uf)}">${escapeHtml(uf)}</span>\n          <span class="track"><span class="fill" style="width:${Math.round(n / maxUF * 100)}%"></span></span>\n          <span class="v">${n}</span></div>`).join("") || '<div class="dl-empty">Sem dados.</div>'}\n      </div>\n      <div class="det-sec">Substabelecidos da região</div>\n      <div class="det-list">\n        ${subs.map(r => `\n          <div class="det-item">\n            <div class="det-main">\n              <span class="det-nome">${escapeHtml(norm(r.nome_subs) || "—")}</span>\n              ${badgeDe(r)}\n            </div>\n            <div class="det-meta">\n              <span>UF <b>${escapeHtml(ufDoSub(r) || "—")}</b></span>\n              <span>Banco <b>${escapeHtml(norm(r.banco) || "—")}</b></span>\n              <span>Cód. sub <b>${escapeHtml(norm(r.cod_substabelecido) || "—")}</b></span>\n              <span>Gerente <b>${escapeHtml(norm(r.gerente_comercial) || "—")}</b></span>\n            </div>\n          </div>`).join("") || '<div class="dl-empty">Nenhum substabelecido.</div>'}\n      </div>`;
  } else return;
  $("detalheOverlay").classList.add("show");
}

function empresaGrupoDe(r) {
  const c = norm(r[CONFIG.COL_CNPJ_GRUPO]).replace(/\D/g, "");
  if (!c) return null;
  return state.empresas.find(e => norm(e.cnpj).replace(/\D/g, "") === c) || null;
}

function camposFichaSub(r) {
  const emp = empresaGrupoDe(r);
  const uf = ufDoSub(r);
  return {
    identificacao: [ [ "Nome do sub", norm(r.nome_subs) ], [ "CNPJ do sub", norm(r.cnpj_subs) ], [ "Empresa do grupo (razão)", emp ? norm(emp.razao_social) : "" ], [ "CNPJ do grupo", norm(r[CONFIG.COL_CNPJ_GRUPO]) ] ],
    vinculo: [ [ "Banco", norm(r.banco) ], [ "Tipo de cadastro", norm(r.tipo_cadastro) ], [ "Cód. loja banco", norm(r.cod_loja_banco) ], [ "Cód. substabelecido", norm(r.cod_substabelecido) ], [ "Cód. parceiro", norm(r.cod_parceiro) ], [ "UF / Região", uf ? `${uf} · ${UF_REGIAO[uf]}` : "" ] ],
    gestao: [ [ "Responsável (empresa)", norm(r.responsavel_empresa) ], [ "Gerente comercial", norm(r.gerente_comercial) ], [ "Comissão", norm(r.comissao) ], [ "Status", (STATUS_SUB[norm(r.status).toUpperCase()] || {}).label || norm(r.status) ] ]
  };
}

function abrirFichaSub(id) {
  const r = state.rows.find(x => x.id === id);
  if (!r) return;
  state.fichaSubId = id;
  const stU = norm(r.status).toUpperCase();
  const campos = camposFichaSub(r);
  const obs = parseObs(r.observacao);
  const uf = ufDoSub(r);
  $("subTitle").textContent = norm(r.nome_subs) || "Substabelecido";
  const grid = pares => `<div class="sub-grid">\n    ${pares.map(([lab, val]) => `<div class="sub-field">\n      <span class="sf-label">${escapeHtml(lab)}</span>\n      <span class="sf-val${/CNPJ|Cód\./.test(lab) ? " mono" : ""}">${escapeHtml(val || "—")}</span>\n    </div>`).join("")}\n  </div>`;
  $("subBody").innerHTML = `\n    <div class="det-resumo">\n      <div class="det-kpi sub-box"><b class="st-${(STATUS_SUB[stU] || {
    classe: "none"
  }).classe}">${escapeHtml((STATUS_SUB[stU] || {}).label || "—")}</b><span>status</span></div>\n      <div class="det-kpi sub-box"><b>${escapeHtml(norm(r.banco) || "—")}</b><span>banco</span></div>\n      <div class="det-kpi sub-box"><b>${uf || "—"}</b><span>UF</span></div>\n      <div class="det-kpi sub-box"><b>${obs.length}</b><span>observaç${obs.length === 1 ? "ão" : "ões"}</span></div>\n    </div>\n\n    <div class="det-sec">Identificação</div>\n    ${grid(campos.identificacao)}\n\n    <div class="det-sec">Vínculo bancário</div>\n    ${grid(campos.vinculo)}\n\n    <div class="det-sec">Gestão comercial</div>\n    ${grid(campos.gestao)}\n\n    ${obs.length ? `\n      <div class="det-sec">Observações</div>\n      <div class="sub-obs-list">\n        ${obs.map(b => `<div class="obs-block">\n          <div class="obs-head">\n            <span class="obs-quem">${escapeHtml(norm(b.quem) || "—")}</span>\n            <span class="obs-quando">${escapeHtml(b.em ? fmtData(b.em) : "")}</span>\n          </div>\n          <div class="obs-text">${escapeHtml(norm(b.texto))}</div>\n        </div>`).join("")}\n      </div>` : ""}\n  `;
  $("subOverlay").classList.add("show");
}

async function exportarFichaSubPDF() {
  const r = state.rows.find(x => x.id === state.fichaSubId);
  if (!r) return;
  const btn = $("subPdfBtn");
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Gerando…';
  try {
    await loadPdfLibs();
    const {jsPDF: jsPDF} = window.jspdf;
    const doc = new jsPDF({
      unit: "mm",
      format: "a4"
    });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const NAVY = [ 15, 31, 56 ], BLUE = [ 26, 86, 196 ], LINE = [ 200, 212, 229 ], TXT = [ 18, 33, 53 ], MUT = [ 84, 104, 127 ], VERDE = [ 14, 138, 95 ], VERM = [ 201, 58, 63 ], AMBAR = [ 160, 101, 20 ];
    const agora = (new Date).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const stU = norm(r.status).toUpperCase();
    const stLbl = (STATUS_SUB[stU] || {}).label || norm(r.status) || "—";
    const stCor = stU === "ATIVO" ? VERDE : stU === "INATIVO" ? VERM : stU === "PENDENTE" ? AMBAR : stU === "EM_ANDAMENTO" ? BLUE : MUT;
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 26, "F");
    doc.setFillColor(...BLUE);
    doc.rect(0, 26, W, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Prospecta", 14, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(154, 171, 201);
    doc.text("G E S T Ã O   D E   S U B S T A B E L E C I D O S", 14, 16.5);
    doc.setFontSize(8);
    doc.text("Gerado em " + agora, W - 14, 13.5, {
      align: "right"
    });
    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("FICHA · SUBSTABELECIDO", 14, 37);
    doc.setTextColor(...TXT);
    doc.setFontSize(18);
    const titulo = doc.splitTextToSize(norm(r.nome_subs) || "Substabelecido", W - 70);
    doc.text(titulo, 14, 45);
    doc.setFontSize(9);
    doc.setTextColor(...stCor);
    doc.setFont("helvetica", "bold");
    doc.text(stLbl.toUpperCase(), W - 14, 45, {
      align: "right"
    });
    let y = 45 + (titulo.length - 1) * 8 + 5;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(.4);
    doc.line(14, y, W - 14, y);
    y += 8;
    const secao = nome => {
      if (y > H - 45) {
        doc.addPage();
        y = 20;
      }
      doc.setTextColor(...MUT);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(nome.toUpperCase(), 14, y);
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(.6);
      doc.line(14, y + 2, W - 14, y + 2);
      y += 6;
    };
    const tabelaKV = pares => {
      doc.autoTable({
        startY: y,
        body: pares.map(([k, v]) => [ k, v || "—" ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          textColor: TXT,
          lineColor: LINE,
          lineWidth: .2,
          cellPadding: 2.8
        },
        columnStyles: {
          0: {
            cellWidth: 58,
            fontStyle: "bold",
            textColor: MUT,
            fillColor: [ 246, 249, 253 ],
            fontSize: 8
          }
        },
        margin: {
          left: 14,
          right: 14
        },
        didParseCell: d => {
          if (d.column.index === 1 && /CNPJ|Cód\./.test(String(d.row.raw[0]))) d.cell.styles.font = "courier";
          if (d.column.index === 1 && d.row.raw[0] === "Status") {
            d.cell.styles.textColor = stCor;
            d.cell.styles.fontStyle = "bold";
          }
        }
      });
      y = doc.lastAutoTable.finalY + 9;
    };
    const campos = camposFichaSub(r);
    secao("Identificação");
    tabelaKV(campos.identificacao);
    secao("Vínculo bancário");
    tabelaKV(campos.vinculo);
    secao("Gestão comercial");
    tabelaKV(campos.gestao);
    const obs = parseObs(r.observacao);
    if (obs.length) {
      secao("Observações");
      doc.autoTable({
        startY: y,
        head: [ [ "Quem", "Quando", "Observação" ] ],
        body: obs.map(b => [ norm(b.quem) || "—", b.em ? fmtData(b.em) : "—", norm(b.texto) ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          textColor: TXT,
          lineColor: LINE,
          lineWidth: .2,
          cellPadding: 2.6
        },
        headStyles: {
          fillColor: NAVY,
          textColor: [ 255, 255, 255 ],
          fontSize: 7.8,
          fontStyle: "bold",
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: [ 249, 251, 254 ]
        },
        columnStyles: {
          0: {
            cellWidth: 28,
            fontStyle: "bold"
          },
          1: {
            cellWidth: 30,
            font: "courier",
            fontSize: 8
          }
        },
        margin: {
          left: 14,
          right: 14,
          top: 20
        }
      });
    }
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(.3);
      doc.line(14, H - 12, W - 14, H - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.setTextColor(...MUT);
      doc.text("Prospecta · documento de uso interno", 14, H - 7.5);
      doc.text(`Página ${i} de ${total}`, W - 14, H - 7.5, {
        align: "right"
      });
    }
    doc.save(`prospecta_sub_${slugArquivo(r.nome_subs)}.pdf`);
    toast("PDF gerado com sucesso", "ok");
  } catch (err) {
    console.error(err);
    toast("Erro ao gerar PDF: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

let _pdfLibs = null;

function loadPdfLibs() {
  if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
  if (_pdfLibs) return _pdfLibs;
  const load = src => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("Falha ao carregar biblioteca de PDF"));
    document.head.appendChild(s);
  });
  _pdfLibs = load("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js").then(() => load("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"));
  return _pdfLibs;
}

function slugArquivo(s) {
  return norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "detalhe";
}

async function exportarDetalhePDF() {
  const det = state.detalheAtual;
  if (!det) return;
  const btn = $("detalhePdfBtn");
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Gerando…';
  try {
    await loadPdfLibs();
    const {jsPDF: jsPDF} = window.jspdf;
    const doc = new jsPDF({
      unit: "mm",
      format: "a4"
    });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const NAVY = [ 15, 31, 56 ], BLUE = [ 26, 86, 196 ], LINE = [ 200, 212, 229 ], TXT = [ 18, 33, 53 ], MUT = [ 84, 104, 127 ], VERDE = [ 14, 138, 95 ], VERM = [ 201, 58, 63 ];
    const base = painelBase();
    const filtroLbl = {
      TODOS: "Todos os cadastros",
      ATIVO: "Somente ativos",
      PENDENTE: "Somente pendentes",
      EM_ANDAMENTO: "Somente em andamento",
      INATIVO: "Somente inativos",
      INCOMPATIVEL: "Somente incompatíveis"
    }[state.painelFiltro || "TODOS"];
    const agora = (new Date).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const cabecalho = (kicker, titulo) => {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, W, 26, "F");
      doc.setFillColor(...BLUE);
      doc.rect(0, 26, W, 1.2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Prospecta", 14, 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(154, 171, 201);
      doc.text("G E S T Ã O   D E   S U B S T A B E L E C I D O S", 14, 16.5);
      doc.setFontSize(8);
      doc.text("Gerado em " + agora, W - 14, 11, {
        align: "right"
      });
      doc.text("Filtro do painel: " + filtroLbl, W - 14, 16.5, {
        align: "right"
      });
      doc.setTextColor(...BLUE);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(kicker.toUpperCase(), 14, 37);
      doc.setTextColor(...TXT);
      doc.setFontSize(18);
      doc.text(titulo, 14, 45);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(.4);
      doc.line(14, 49, W - 14, 49);
    };
    const resumo = itens => {
      const y = 55, bh = 18, gap = 6;
      const bw = (W - 28 - (itens.length - 1) * gap) / itens.length;
      let x = 14;
      itens.forEach(it => {
        doc.setFillColor(246, 249, 253);
        doc.rect(x, y, bw, bh, "F");
        doc.setDrawColor(...LINE);
        doc.setLineWidth(.25);
        doc.rect(x, y, bw, bh, "S");
        doc.setFillColor(...it.cor || BLUE);
        doc.rect(x, y, bw, 1.3, "F");
        doc.setTextColor(...it.cor || TXT);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text(String(it.v), x + bw / 2, y + 9.5, {
          align: "center"
        });
        doc.setTextColor(...MUT);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.8);
        doc.text(it.label.toUpperCase(), x + bw / 2, y + 14.6, {
          align: "center"
        });
        x += bw + gap;
      });
      return y + bh;
    };
    const tabelaBase = {
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        textColor: TXT,
        lineColor: LINE,
        lineWidth: .2,
        cellPadding: 2.6
      },
      headStyles: {
        fillColor: NAVY,
        textColor: [ 255, 255, 255 ],
        fontSize: 7.8,
        fontStyle: "bold",
        cellPadding: 3
      },
      alternateRowStyles: {
        fillColor: [ 249, 251, 254 ]
      },
      margin: {
        left: 14,
        right: 14,
        top: 34
      }
    };
    let nomeArq;
    if (det.tipo === "banco") {
      const subs = base.filter(r => (norm(r.banco) || "Sem banco") === det.valor).sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
      const nAtivos = subs.filter(r => norm(r.status).toUpperCase() === "ATIVO").length;
      cabecalho("Relatório · Banco", det.valor);
      const yFim = resumo([ {
        v: subs.length,
        label: "substabelecidos"
      }, {
        v: nAtivos,
        label: "ativos",
        cor: VERDE
      }, {
        v: subs.length - nAtivos,
        label: "demais",
        cor: VERM
      } ]);
      doc.autoTable(Object.assign({}, tabelaBase, {
        startY: yFim + 7,
        head: [ [ "#", "Nome do sub", "CNPJ", "Tipo", "Cód. sub", "Gerente", "Status" ] ],
        body: subs.map((r, i) => [ i + 1, norm(r.nome_subs) || "—", norm(r.cnpj_subs) || "—", norm(r.tipo_cadastro) || "—", norm(r.cod_substabelecido) || "—", norm(r.gerente_comercial) || "—", norm(r.status).toUpperCase() || "—" ]),
        columnStyles: {
          0: {
            cellWidth: 9,
            halign: "center",
            textColor: MUT
          },
          2: {
            cellWidth: 34,
            font: "courier",
            fontSize: 8
          },
          4: {
            cellWidth: 22,
            font: "courier",
            fontSize: 8
          },
          6: {
            cellWidth: 18,
            halign: "center",
            fontStyle: "bold"
          }
        },
        didParseCell: d => {
          if (d.section === "body" && d.column.index === 6) {
            const v = String(d.cell.raw);
            if (v === "ATIVO") d.cell.styles.textColor = VERDE; else if (v === "INATIVO") d.cell.styles.textColor = VERM; else d.cell.styles.textColor = MUT;
          }
        }
      }));
      nomeArq = `prospecta_banco_${slugArquivo(det.valor)}.pdf`;
    } else if (det.tipo === "uf") {
      const subs = det.valor === "Não identificado" ? base.filter(r => !ufDoSub(r)) : base.filter(r => ufDoSub(r) === det.valor);
      const porBanco = {};
      subs.forEach(r => {
        const b = norm(r.banco) || "Sem banco";
        porBanco[b] = (porBanco[b] || 0) + 1;
      });
      const entries = Object.entries(porBanco).sort((a, b) => b[1] - a[1]);
      const titulo = det.valor === "Não identificado" ? "UF não identificada" : det.valor + (UF_REGIAO[det.valor] ? ` · ${UF_REGIAO[det.valor]}` : "");
      cabecalho("Relatório · Unidade federativa", titulo);
      const yFim = resumo([ {
        v: subs.length,
        label: "subs na UF"
      }, {
        v: entries.length,
        label: "bancos"
      } ]);
      doc.autoTable(Object.assign({}, tabelaBase, {
        startY: yFim + 7,
        head: [ [ "#", "Banco", "Substabelecidos", "% do total da UF" ] ],
        body: entries.map(([b, n], i) => [ i + 1, b, n, subs.length ? (n / subs.length * 100).toFixed(1).replace(".", ",") + "%" : "—" ]),
        columnStyles: {
          0: {
            cellWidth: 9,
            halign: "center",
            textColor: MUT
          },
          2: {
            cellWidth: 36,
            halign: "center",
            fontStyle: "bold"
          },
          3: {
            cellWidth: 36,
            halign: "center",
            textColor: MUT
          }
        }
      }));
      nomeArq = `prospecta_uf_${slugArquivo(det.valor)}.pdf`;
    } else {
      const subs = base.filter(r => UF_REGIAO[ufDoSub(r)] === det.valor).sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
      const porUF = {};
      subs.forEach(r => {
        const uf = ufDoSub(r) || "—";
        porUF[uf] = (porUF[uf] || 0) + 1;
      });
      const entriesUF = Object.entries(porUF).sort((a, b) => b[1] - a[1]);
      const nAtivos = subs.filter(r => norm(r.status).toUpperCase() === "ATIVO").length;
      cabecalho("Relatório · Região", det.valor);
      const yFim = resumo([ {
        v: subs.length,
        label: "subs na região"
      }, {
        v: entriesUF.length,
        label: "estados"
      }, {
        v: nAtivos,
        label: "ativos",
        cor: VERDE
      } ]);
      doc.autoTable(Object.assign({}, tabelaBase, {
        startY: yFim + 7,
        head: [ [ "#", "Estado (UF)", "Substabelecidos", "% da região" ] ],
        body: entriesUF.map(([uf, n], i) => [ i + 1, uf, n, subs.length ? (n / subs.length * 100).toFixed(1).replace(".", ",") + "%" : "—" ]),
        columnStyles: {
          0: {
            cellWidth: 9,
            halign: "center",
            textColor: MUT
          },
          2: {
            cellWidth: 36,
            halign: "center",
            fontStyle: "bold"
          },
          3: {
            cellWidth: 36,
            halign: "center",
            textColor: MUT
          }
        }
      }));
      doc.autoTable(Object.assign({}, tabelaBase, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [ [ "#", "Nome do sub", "UF", "Banco", "Status" ] ],
        body: subs.map((r, i) => [ i + 1, norm(r.nome_subs) || "—", ufDoSub(r) || "—", norm(r.banco) || "—", norm(r.status).toUpperCase() || "—" ]),
        columnStyles: {
          0: {
            cellWidth: 9,
            halign: "center",
            textColor: MUT
          },
          2: {
            cellWidth: 16,
            halign: "center"
          },
          4: {
            cellWidth: 24,
            halign: "center",
            fontStyle: "bold"
          }
        },
        didParseCell: d => {
          if (d.section === "body" && d.column.index === 4) {
            const v = String(d.cell.raw);
            if (v === "ATIVO") d.cell.styles.textColor = VERDE; else if (v === "INATIVO") d.cell.styles.textColor = VERM; else d.cell.styles.textColor = MUT;
          }
        }
      }));
      nomeArq = `prospecta_regiao_${slugArquivo(det.valor)}.pdf`;
    }
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(.3);
      doc.line(14, H - 12, W - 14, H - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.setTextColor(...MUT);
      doc.text("Prospecta · documento de uso interno", 14, H - 7.5);
      doc.text(`Página ${i} de ${total}`, W - 14, H - 7.5, {
        align: "right"
      });
    }
    doc.save(nomeArq);
    toast("PDF gerado com sucesso", "ok");
  } catch (err) {
    console.error(err);
    toast("Erro ao gerar PDF: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

function renderKPIs() {
  const reais = state.rows.filter(isReal);
  const ativos = reais.filter(r => norm(r.status).toUpperCase() === "ATIVO");
  const inativos = reais.filter(r => norm(r.status).toUpperCase() === "INATIVO");
  const pct = reais.length ? Math.round(ativos.length / reais.length * 100) : 0;
  const bancos = new Set(ativos.map(r => norm(r.banco)).filter(Boolean));
  const gerentes = new Set(ativos.map(r => norm(r.gerente_comercial)).filter(Boolean));
  const porBanco = {};
  ativos.forEach(r => {
    const b = norm(r.banco) || "—";
    porBanco[b] = (porBanco[b] || 0) + 1;
  });
  const top = Object.entries(porBanco).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxTop = top.length ? top[0][1] : 1;
  const cnpjBanco = {};
  ativos.forEach(r => {
    const c = norm(r.cnpj);
    if (!c) return;
    (cnpjBanco[c] = cnpjBanco[c] || new Set).add(norm(r.banco));
  });
  const multiBanco = Object.values(cnpjBanco).filter(s => s.size > 1).length;
  const incompletos = reais.filter(r => !norm(r.gerente_comercial) || !norm(r.status) || !norm(r.cod_substabelecido) && !norm(r.cod_loja_banco)).length;
  $("kpis").innerHTML = `\n    <div class="kpi"><div class="k-label">Ativos</div><div class="k-val cyan">${ativos.length}</div><div class="k-sub">${pct}% do total</div></div>\n    <div class="kpi"><div class="k-label">Inativos</div><div class="k-val red">${inativos.length}</div><div class="k-sub">de ${reais.length} cadastros</div></div>\n    <div class="kpi"><div class="k-label">Bancos ativos</div><div class="k-val">${bancos.size}</div><div class="k-sub">com ao menos 1 sub</div></div>\n    <div class="kpi"><div class="k-label">Gerentes</div><div class="k-val">${gerentes.size}</div><div class="k-sub">carteiras distintas</div></div>\n    <div class="kpi"><div class="k-label">Parceiros multi-banco</div><div class="k-val">${multiBanco}</div><div class="k-sub">mesmo CNPJ em 2+ bancos</div></div>\n    <div class="kpi"><div class="k-label">Cadastros incompletos</div><div class="k-val" style="color:var(--warn)">${incompletos}</div><div class="k-sub">sem gerente / código / status</div></div>\n    <div class="kpi wide">\n      <div class="k-label">Top bancos por ativos</div>\n      <div class="k-bars">\n        ${top.map(([b, n]) => `<div class="k-bar">\n          <span class="n" title="${escapeHtml(b)}">${escapeHtml(b)}</span>\n          <span class="track"><span class="fill" style="width:${Math.round(n / maxTop * 100)}%"></span></span>\n          <span class="v">${n}</span></div>`).join("")}\n      </div>\n    </div>`;
}

function setRazaoByCnpj(cnpj) {
  const sel = $("f_razao"), c = norm(cnpj);
  const opt = [ ...sel.options ].find(o => norm(o.dataset.cnpj) === c && c !== "");
  sel.value = opt ? opt.value : "";
}

function setBanco(val) {
  const sel = $("f_banco"), v = norm(val);
  sel.querySelectorAll("option[data-legacy]").forEach(o => o.remove());
  if (v && ![ ...sel.options ].some(o => o.value === v)) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v + " (atual)";
    o.dataset.legacy = "1";
    sel.appendChild(o);
  }
  sel.value = v;
}

function setTipo(val) {
  const sel = $("f_tipo"), v = norm(val);
  sel.querySelectorAll("option[data-legacy]").forEach(o => o.remove());
  if (v && ![ ...sel.options ].some(o => o.value === v)) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v + " (atual)";
    o.dataset.legacy = "1";
    sel.appendChild(o);
  }
  sel.value = v;
}

function abrirForm(id) {
  state.editingId = id || null;
  const r = id ? state.rows.find(x => x.id === id) : {};
  $("formTitle").textContent = id ? "Editar substabelecido" : "Novo substabelecido";
  const set = (el, v) => $(el).value = v == null ? "" : v;
  set("f_sub", r.nome_subs);
  set("f_cnpj_subs", mascaraCNPJ(r.cnpj_subs));
  validarCnpjSubUI();
  set("f_cnpj", r[CONFIG.COL_CNPJ_GRUPO]);
  setRazaoByCnpj(r[CONFIG.COL_CNPJ_GRUPO]);
  preencherBancosForm();
  setBanco(r.banco);
  setTipo(r.tipo_cadastro);
  set("f_codloja", r.cod_loja_banco);
  set("f_codsub", r.cod_substabelecido);
  set("f_codparc", r.cod_parceiro);
  set("f_resp", r.responsavel_empresa);
  set("f_gerente", r.gerente_comercial);
  set("f_comissao", r.comissao);
  atualizarObrigatoriedadeComissao();
  $("formSave").textContent = id ? "Salvar" : "Avançar";
  $("formOverlay").classList.add("show");
}

function atualizarObrigatoriedadeComissao() {
  const ehSubstabelecido = $("f_tipo").value.trim() === "SUBSTABELECIDO";
  $("comissaoReq").style.display = ehSubstabelecido ? "" : "none";
}

function payloadDoForm() {
  const g = el => {
    const v = $(el).value.trim();
    return v === "" ? null : v;
  };
  return {
    nome_subs: g("f_sub"),
    cnpj_subs: g("f_cnpj_subs"),
    [CONFIG.COL_CNPJ_GRUPO]: g("f_cnpj"),
    banco: g("f_banco"),
    tipo_cadastro: g("f_tipo"),
    cod_loja_banco: g("f_codloja"),
    cod_substabelecido: g("f_codsub"),
    cod_parceiro: g("f_codparc"),
    responsavel_empresa: g("f_resp"),
    gerente_comercial: g("f_gerente"),
    comissao: g("f_comissao")
  };
}

async function salvarForm() {
  const nomeSub = $("f_sub").value.trim(), cnpjSub = $("f_cnpj_subs").value.trim(), razao = $("f_razao").value.trim(), banco = $("f_banco").value.trim(), tipo = $("f_tipo").value.trim(), gerente = $("f_gerente").value.trim(), comissao = $("f_comissao").value.trim();
  const faltando = [];
  if (!nomeSub) faltando.push("Nome do sub");
  if (!cnpjSub) faltando.push("CNPJ do sub");
  if (!razao) faltando.push("Empresa (razão)");
  if (!banco) faltando.push("Banco");
  if (!tipo) faltando.push("Tipo de cadastro");
  if (!gerente) faltando.push("Gerente");
  if (tipo === "SUBSTABELECIDO" && !comissao) faltando.push("Comissão");
  if (faltando.length) {
    toast("Obrigatórios: " + faltando.join(", "), "err");
    return;
  }
  if (!validaCNPJ(cnpjSub)) {
    validarCnpjSubUI();
    toast("CNPJ do sub inválido.", "err");
    $("f_cnpj_subs").focus();
    return;
  }
  const body = payloadDoForm();
  if (!state.editingId) {
    state.obsPendingBody = {
      ...body,
      status: "EM_ANDAMENTO"
    };
    abrirObs("create", null, "");
    return;
  }
  const btn = $("formSave");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    const res = await fetch(`${REST()}?id=eq.${state.editingId}`, {
      method: "PATCH",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    const i = state.rows.findIndex(x => x.id === state.editingId);
    if (i > -1) state.rows[i] = saved;
    $("formOverlay").classList.remove("show");
    montarFiltros();
    aplicarFiltros();
    renderKPIs();
    logHist("editou_sub", "substabelecidos", saved.id, `Editou sub ${norm(saved.nome_subs)} (${norm(saved.banco)})`);
    toast("Substabelecido atualizado", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar. Veja o console (F12).", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

const STATUS_SUB = {
  ATIVO: {
    label: "Ativo",
    classe: "ativo"
  },
  PENDENTE: {
    label: "Pendente",
    classe: "pendente"
  },
  EM_ANDAMENTO: {
    label: "Em andamento",
    classe: "andamento"
  },
  INATIVO: {
    label: "Inativo",
    classe: "inativo"
  }
};

function badgeStatus(stU) {
  const cfg = STATUS_SUB[stU];
  return cfg ? `<span class="badge ${cfg.classe}">${cfg.label.toUpperCase()}</span>` : `<span class="badge none">—</span>`;
}

async function mudarStatus(id, novo) {
  try {
    const res = await fetch(`${REST()}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status: novo
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    const i = state.rows.findIndex(x => x.id === id);
    if (i > -1) state.rows[i] = saved;
    aplicarFiltros();
    renderKPIs();
    const lbl = (STATUS_SUB[novo] || {}).label || novo;
    logHist("status_sub", "substabelecidos", id, `Alterou status de ${norm(saved.nome_subs)} para ${lbl}`);
    toast(`Status alterado para "${lbl}"`, "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao mudar status.", "err");
  }
}

function fecharMenuStatus() {
  const m = document.getElementById("statusPopover");
  if (m) m.remove();
  document.removeEventListener("click", fecharMenuStatusFora, true);
  document.removeEventListener("keydown", fecharMenuStatusEsc, true);
}

function fecharMenuStatusFora(e) {
  const m = document.getElementById("statusPopover");
  if (m && !m.contains(e.target)) fecharMenuStatus();
}

function fecharMenuStatusEsc(e) {
  if (e.key === "Escape") fecharMenuStatus();
}

function abrirMenuStatus(btn, id) {
  fecharMenuStatus();
  const row = state.rows.find(r => r.id === id);
  const atual = norm(row && row.status).toUpperCase();
  const pop = document.createElement("div");
  pop.id = "statusPopover";
  pop.className = "status-popover";
  pop.innerHTML = `<div class="sp-title">Alterar status</div>` + Object.entries(STATUS_SUB).map(([key, cfg]) => `<button class="sp-opt${key === atual ? " is-atual" : ""}" data-setstatus="${key}">\n        <span class="sp-dot ${cfg.classe}"></span>${cfg.label}\n        ${key === atual ? '<span class="sp-check">&check;</span>' : ""}\n      </button>`).join("");
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = window.scrollY + r.bottom + 6 + "px";
  let left = window.scrollX + r.right - pop.offsetWidth;
  left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8));
  pop.style.left = left + "px";
  pop.addEventListener("click", e => {
    const opt = e.target.closest("[data-setstatus]");
    if (!opt) return;
    const novo = opt.dataset.setstatus;
    fecharMenuStatus();
    if (novo !== atual) mudarStatus(id, novo);
  });
  setTimeout(() => {
    document.addEventListener("click", fecharMenuStatusFora, true);
    document.addEventListener("keydown", fecharMenuStatusEsc, true);
  }, 0);
}

async function enviarDuvida() {
  const nome = $("duvidaNome").value.trim(), msg = $("duvidaMsg").value.trim();
  if (!msg) {
    toast("Escreva a dúvida antes de enviar.", "err");
    $("duvidaMsg").focus();
    return;
  }
  const btn = $("duvidaSend");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Enviando';
  try {
    const res = await fetch(REST_MSG(), {
      method: "POST",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify([ {
        nome_enviou: nome || null,
        mensagem_enviada: msg
      } ])
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    if (saved && saved.id != null) {
      addPendente(saved.id);
      addMinha(saved.id);
    }
    $("duvidaMsg").value = "";
    $("duvidaOverlay").classList.remove("show");
    toast("Dúvida enviada ao gestor", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao enviar dúvida. Veja o console (F12).", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function carregarDuvidas() {
  try {
    const res = await fetch(`${REST_MSG()}?select=*&order=id.desc`, {
      headers: H()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    state.duvidas = await res.json();
    state.duvidasCarregadas = true;
    atualizarBadgeDuvidas();
    renderDuvidas();
  } catch (e) {
    console.error(e);
    toast("Falha ao carregar dúvidas.", "err");
  }
}

function atualizarBadgeDuvidas() {
  const abertas = state.duvidas.filter(d => !norm(d.mensagem_respondida)).length;
  const b = $("duvidasBadge");
  b.textContent = abertas;
  b.style.display = abertas > 0 ? "inline-block" : "none";
}

function renderDuvidas() {
  const filtro = $("fDuvidaStatus").value;
  const list = state.duvidas.filter(d => {
    const st = norm(d.mensagem_respondida) ? "RESPONDIDA" : "ABERTA";
    return !filtro || st === filtro;
  });
  $("duvidasCount").innerHTML = `<b>${list.length}</b> dúvida${list.length !== 1 ? "s" : ""}`;
  $("duvidasEmpty").style.display = list.length ? "none" : "block";
  $("duvidasList").innerHTML = list.map(d => {
    const aberta = !norm(d.mensagem_respondida);
    return `<div class="duvida-item">\n      <div class="d-top">\n        <span class="d-nome">${escapeHtml(norm(d.nome_enviou) || "Atendente")}</span>\n        ${aberta ? `<span class="badge inativo">ABERTA</span>` : `<span class="badge ativo">RESPONDIDA</span>`}\n      </div>\n      <div class="d-msg">${escapeHtml(norm(d.mensagem_enviada))}</div>\n      ${d.mensagem_respondida ? `<div class="d-resp"><b>${escapeHtml(norm(d.nome_respondeu) || "Gestor")}:</b> ${escapeHtml(norm(d.mensagem_respondida))}</div>` : ""}\n      <div class="d-act">\n        ${aberta ? `<button class="btn sm" data-responder="${d.id}">Responder</button>` : ""}\n        <button class="btn sm danger" data-apagar="${d.id}">Apagar</button>\n      </div>\n    </div>`;
  }).join("");
}

async function excluirDuvida(id) {
  const d = state.duvidas.find(x => x.id === id);
  if (!d) return;
  if (!confirm("Apagar esta dúvida?")) return;
  try {
    const res = await fetch(`${REST_MSG()}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        ...H(),
        Prefer: "return=representation"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const del = await res.json();
    if (!Array.isArray(del) || !del.length) {
      toast("Nada foi apagado. Falta a policy de DELETE para 'authenticated' no Supabase.", "err");
      return;
    }
    state.duvidas = state.duvidas.filter(x => x.id !== id);
    logHist("apagou_duvida", "mensagem", id, `Apagou dúvida de ${norm(d.nome_enviou) || "atendente"}`);
    atualizarBadgeDuvidas();
    renderDuvidas();
    toast("Dúvida apagada", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao apagar dúvida.", "err");
  }
}

function abrirResposta(id) {
  const d = state.duvidas.find(x => x.id === id);
  if (!d) return;
  if (norm(d.mensagem_respondida)) return;
  state.editingDuvidaId = id;
  $("respPergunta").innerHTML = `<b>${escapeHtml(norm(d.nome_enviou) || "Atendente")}</b> perguntou: “${escapeHtml(norm(d.mensagem_enviada))}”`;
  $("respTexto").value = norm(d.mensagem_respondida);
  $("respOverlay").classList.add("show");
  $("respTexto").focus();
}

async function salvarResposta() {
  const nome = state.gestorNome;
  const texto = $("respTexto").value.trim();
  if (!texto) {
    toast("Escreva a resposta.", "err");
    return;
  }
  const id = state.editingDuvidaId;
  const btn = $("respSalvar");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    const res = await fetch(`${REST_MSG()}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        nome_respondeu: nome || null,
        mensagem_respondida: texto
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    const i = state.duvidas.findIndex(x => x.id === id);
    if (i > -1) state.duvidas[i] = saved;
    atualizarBadgeDuvidas();
    renderDuvidas();
    $("respOverlay").classList.remove("show");
    toast("Resposta enviada", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar resposta.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function abrirMinhas() {
  const ids = getMinhas();
  const box = $("minhasList");
  $("minhasOverlay").classList.add("show");
  if (!ids.length) {
    box.innerHTML = '<div class="empty-state" style="display:block"><b>Nenhuma dúvida ainda</b>As dúvidas que você enviar aparecem aqui.</div>';
    return;
  }
  box.innerHTML = '<div class="d-msg" style="padding:16px 20px;color:var(--muted)">Carregando…</div>';
  try {
    const res = await fetch(`${REST_MSG()}?id=in.(${ids.join(",")})&select=*&order=id.desc`, {
      headers: H()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) {
      box.innerHTML = '<div class="empty-state" style="display:block"><b>Nada encontrado</b>Suas dúvidas podem ter sido apagadas pelo gestor.</div>';
      return;
    }
    box.innerHTML = rows.map(d => {
      const resp = norm(d.mensagem_respondida);
      return `<div class="duvida-item">\n        <div class="d-top">\n          <span class="d-nome">Você perguntou</span>\n          ${resp ? `<span class="badge ativo">RESPONDIDA</span>` : `<span class="badge inativo">AGUARDANDO</span>`}\n        </div>\n        <div class="d-msg">${escapeHtml(norm(d.mensagem_enviada))}</div>\n        ${resp ? `<div class="d-resp"><b>${escapeHtml(norm(d.nome_respondeu) || "Gestor")}:</b> ${escapeHtml(resp)}</div>` : `<div class="d-msg" style="color:var(--muted)">Ainda sem resposta.</div>`}\n      </div>`;
    }).join("");
  } catch (e) {
    console.error(e);
    box.innerHTML = '<div class="d-msg" style="padding:16px 20px;color:var(--warn)">Erro ao carregar. Veja o console (F12).</div>';
  }
}

async function verificarRespostas() {
  if (state.gestor) return;
  const pend = getPendentes();
  if (!pend.length) return;
  try {
    const res = await fetch(`${REST_MSG()}?id=in.(${pend.join(",")})&select=id,mensagem_enviada,mensagem_respondida,nome_respondeu`, {
      headers: H()
    });
    if (!res.ok) return;
    const rows = await res.json();
    const respondidas = rows.filter(r => norm(r.mensagem_respondida));
    if (respondidas.length) {
      const hist = getHistorico();
      respondidas.forEach(r => {
        hist.unshift({
          id: r.id,
          mensagem_enviada: r.mensagem_enviada,
          mensagem_respondida: r.mensagem_respondida,
          nome_respondeu: r.nome_respondeu,
          lida: false
        });
        toast("O gestor respondeu sua dúvida", "ok");
      });
      setHistorico(hist);
      setPendentes(pend.filter(id => !respondidas.some(r => r.id === id)));
      renderNotifPanel();
    }
  } catch (e) {
    console.error(e);
  }
}

function renderNotifPanel() {
  const hist = getHistorico();
  const list = $("notifList");
  $("notifEmpty").style.display = hist.length ? "none" : "block";
  list.innerHTML = hist.map((h, i) => `\n    <div class="notif-item ${h.lida ? "lida" : ""}" data-idx="${i}">\n      <span class="notif-dot"></span>\n      <div class="notif-txt"><b>${escapeHtml(norm(h.nome_respondeu) || "O gestor")} respondeu:</b> ${escapeHtml(norm(h.mensagem_respondida))}\n      <div class="notif-pergunta">Sua dúvida: “${escapeHtml(norm(h.mensagem_enviada))}”</div></div>\n    </div>`).join("");
  const naoLidas = hist.filter(h => !h.lida).length;
  $("notifBadge").textContent = naoLidas;
  $("notifBadge").style.display = naoLidas > 0 ? "flex" : "none";
}

function marcarHistoricoLido() {
  const hist = getHistorico();
  if (!hist.length) return;
  hist.forEach(h => h.lida = true);
  setHistorico(hist);
  renderNotifPanel();
}

function limparHistoricoNotif() {
  if (!confirm("Limpar todo o histórico de notificações deste navegador?")) return;
  setHistorico([]);
  renderNotifPanel();
}

function entrarGestor() {
  state.gestor = true;
  $("modePill").innerHTML = `Gestor(a) <b>${escapeHtml(state.gestorNome || "")}</b>`;
  $("gestorBtn").style.display = "none";
  $("sairBtn").style.display = "";
  $("novoBtn").style.display = "";
  $("thAcoes").style.display = "";
  $("kpis").style.display = "grid";
  $("tabs").style.display = "flex";
  $("tabsCons").style.display = "none";
  $("notifWrap").style.display = "none";
  $("sidebar").style.display = "none";
  $("filtrosTop").appendChild($("filtrosWrap"));
  $("filtrosTop").style.display = "flex";
  $("fldTipo").style.display = "";
  $("fldGerente").style.display = "";
  switchTab("painel");
  renderKPIs();
  aplicarFiltros();
  checarAlertas();
  carregarDuvidas();
  toast(`Bem-vindo(a), ${escapeHtml(state.gestorNome || "")}`, "ok");
}

function sairGestor() {
  authLogout();
  state.gestor = false;
  state.gestorNome = null;
  $("modePill").innerHTML = "Modo <b>Consulta</b>";
  $("gestorBtn").style.display = "";
  $("sairBtn").style.display = "none";
  $("novoBtn").style.display = "none";
  $("thAcoes").style.display = "none";
  $("kpis").style.display = "none";
  $("kpis").innerHTML = "";
  $("tabs").style.display = "none";
  $("tabsCons").style.display = "flex";
  $("agendaAlert").style.display = "none";
  $("notifWrap").style.display = "";
  $("filtrosTop").appendChild($("filtrosWrap"));
  $("filtrosTop").style.display = "flex";
  $("sidebar").style.display = "none";
  $("fldTipo").style.display = "none";
  $("fldGerente").style.display = "none";
  switchTab("welcome");
  aplicarFiltros();
  verificarRespostas();
}

function soDigitos(s) {
  return norm(s).replace(/\D/g, "");
}

function mascaraCNPJ(s) {
  const d = soDigitos(s).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function validaCNPJ(s) {
  const c = soDigitos(s);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = base => {
    let len = base.length, pos = len - 7, sum = 0;
    for (let i = len; i >= 1; i--) {
      sum += base.charAt(len - i) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === +c.charAt(12) && dv(c.slice(0, 13)) === +c.charAt(13);
}

function validaEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(norm(s));
}

function validaTelefone(s) {
  const d = soDigitos(s);
  return d.length === 10 || d.length === 11;
}

function mascaraTel(s) {
  const d = soDigitos(s).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function linkWhats(tel) {
  const t = norm(tel);
  const d = t.replace(/\D/g, "");
  if (!d) return "—";
  const full = d.startsWith("55") && d.length >= 12 ? d : "55" + d;
  return `<a class="tel-whats" href="https://wa.me/${full}" target="_blank" rel="noopener" title="Conversar no WhatsApp">${escapeHtml(t)}</a>`;
}

function renderBancos() {
  const tb = $("bancosTbody"), list = state.bancos;
  $("bancosCount").innerHTML = `<b>${list.length}</b> banco${list.length !== 1 ? "s" : ""}`;
  $("bancosEmpty").style.display = list.length ? "none" : "block";
  tb.innerHTML = list.map(b => {
    const st = norm(b.status).toUpperCase() === "INATIVO" ? "INATIVO" : "ATIVO";
    const badge = st === "ATIVO" ? `<span class="badge ativo">ATIVO</span>` : `<span class="badge inativo">INATIVO</span>`;
    return `<tr>\n    <td class="empresa">${escapeHtml(norm(b.nome_banco) || "—")}</td>\n    <td>${escapeHtml(norm(b.gerente_banco) || "—")}</td>\n    <td class="mono">${linkWhats(b.contato_gerente)}</td>\n    <td>${escapeHtml(norm(b.email_gerente) || "—")}</td>\n    <td>${escapeHtml(norm(b.suporte_banco) || "—")}</td>\n    <td>${badge}</td>\n    <td><div class="rowact">\n      <button class="btn sm" data-editbanco="${b.id}">Editar</button>\n      <button class="btn sm" data-passo="${b.id}">Passo a passo</button>\n      ${st === "ATIVO" ? `<button class="btn sm danger" data-inativabanco="${b.id}">Inativar</button>` : `<button class="btn sm" data-ativabanco="${b.id}">Reativar</button>`}\n    </div></td>\n  </tr>`;
  }).join("");
}

function renderBancosConsulta() {
  const q = lower($("fBancoConsulta").value);
  const list = state.bancos.filter(b => norm(b.status).toUpperCase() !== "INATIVO").filter(b => !q || lower(b.nome_banco).includes(q));
  $("bancoscCount").innerHTML = `<b>${list.length}</b> banco${list.length !== 1 ? "s" : ""}`;
  $("bancoscEmpty").style.display = list.length ? "none" : "block";
  $("bancoscTbody").innerHTML = list.map(b => `<tr>\n    <td class="empresa">${escapeHtml(norm(b.nome_banco) || "—")}</td>\n    <td>${escapeHtml(norm(b.gerente_banco) || "—")}</td>\n    <td class="mono">${linkWhats(b.contato_gerente)}</td>\n    <td>${escapeHtml(norm(b.email_gerente) || "—")}</td>\n    <td>${escapeHtml(norm(b.suporte_banco) || "—")}</td>\n  </tr>`).join("");
}

async function mudarStatusBanco(id, novo) {
  try {
    const res = await fetch(`${REST_BANCOS()}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status: novo
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    const i = state.bancos.findIndex(x => x.id === id);
    if (i > -1) state.bancos[i] = saved;
    renderBancos();
    logHist(novo === "INATIVO" ? "inativou_banco" : "reativou_banco", "bancos", id, `${novo === "INATIVO" ? "Inativou" : "Reativou"} banco ${norm(saved.nome_banco)}`);
    toast(novo === "INATIVO" ? "Banco inativado" : "Banco reativado", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao mudar status do banco.", "err");
  }
}

function abrirBanco(id) {
  state.editingBancoId = id || null;
  const b = id ? state.bancos.find(x => x.id === id) : {};
  $("bancoTitle").textContent = id ? "Editar banco" : "Novo banco";
  $("b_nome").value = norm(b.nome_banco);
  $("b_gerente").value = norm(b.gerente_banco);
  $("b_contato").value = mascaraTel(b.contato_gerente);
  $("b_email").value = norm(b.email_gerente);
  $("b_suporte").value = norm(b.suporte_banco);
  [ "b_contato_h", "b_email_h", "b_suporte_h" ].forEach(h => {
    $(h).textContent = "";
    $(h).className = "hint";
  });
  $("bancoOverlay").classList.add("show");
}

function validarBancoUI() {
  const set = (h, ok, txt) => {
    $(h).textContent = txt;
    $(h).className = "hint " + (ok ? "ok" : "warn");
  };
  const clear = h => {
    $(h).textContent = "";
    $(h).className = "hint";
  };
  const tel = $("b_contato").value.trim(), em = $("b_email").value.trim(), sup = $("b_suporte").value.trim();
  tel ? set("b_contato_h", validaTelefone(tel), validaTelefone(tel) ? "Número válido" : "Número inválido") : clear("b_contato_h");
  em ? set("b_email_h", validaEmail(em), validaEmail(em) ? "E-mail válido" : "E-mail inválido") : clear("b_email_h");
  sup ? set("b_suporte_h", validaEmail(sup), validaEmail(sup) ? "E-mail válido" : "E-mail inválido") : clear("b_suporte_h");
}

async function salvarBanco() {
  const nome = $("b_nome").value.trim(), gerente = $("b_gerente").value.trim(), contato = $("b_contato").value.trim(), email = $("b_email").value.trim(), suporte = $("b_suporte").value.trim();
  if (!nome || !gerente || !contato || !email) {
    toast("Preencha os campos obrigatórios (*).", "err");
    return;
  }
  if (!validaTelefone(contato)) {
    validarBancoUI();
    toast("Número de contato inválido.", "err");
    $("b_contato").focus();
    return;
  }
  if (!validaEmail(email)) {
    validarBancoUI();
    toast("E-mail do gerente inválido.", "err");
    $("b_email").focus();
    return;
  }
  if (suporte && !validaEmail(suporte)) {
    validarBancoUI();
    toast("E-mail de suporte inválido.", "err");
    $("b_suporte").focus();
    return;
  }
  const body = {
    nome_banco: nome,
    gerente_banco: gerente,
    contato_gerente: contato,
    email_gerente: email,
    suporte_banco: suporte || null
  };
  const btn = $("bancoSave");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    let res;
    if (state.editingBancoId) {
      res = await fetch(`${REST_BANCOS()}?id=eq.${state.editingBancoId}`, {
        method: "PATCH",
        headers: {
          ...H(),
          Prefer: "return=representation"
        },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch(REST_BANCOS(), {
        method: "POST",
        headers: {
          ...H(),
          Prefer: "return=representation"
        },
        body: JSON.stringify([ body ])
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    if (state.editingBancoId) {
      const i = state.bancos.findIndex(x => x.id === state.editingBancoId);
      if (i > -1) state.bancos[i] = saved;
    } else state.bancos.push(saved);
    state.bancos.sort((a, b) => norm(a.nome_banco).localeCompare(norm(b.nome_banco), "pt-BR"));
    $("bancoOverlay").classList.remove("show");
    renderBancos();
    if (state.editingBancoId) logHist("editou_banco", "bancos", saved.id, `Editou banco ${norm(saved.nome_banco)}`); else logHist("criou_banco", "bancos", saved.id, `Criou banco ${norm(saved.nome_banco)}`);
    toast(state.editingBancoId ? "Banco atualizado" : "Banco criado", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar banco. Veja o console (F12).", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

const AG_TIPOS = {
  TREINAMENTO: "Treinamento",
  REUNIAO: "Reunião",
  NOVO_CADASTRO: "Novo cadastro",
  OUTRO: "Outro"
};

function tipoLabel(t) {
  return AG_TIPOS[t] || t || "—";
}

function hojeStr() {
  const d = new Date, p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDataCurta(dataStr) {
  const s = norm(dataStr);
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}`;
}

function diasAte(dataStr) {
  const [y, m, d] = norm(dataStr).split("-").map(Number);
  const alvo = new Date(y, (m || 1) - 1, d || 1);
  alvo.setHours(0, 0, 0, 0);
  const hoje = new Date;
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 864e5);
}

function ehAlerta(a) {
  const dias = diasAte(a.data);
  const janela = a.alerta_dias_antes == null ? 1 : +a.alerta_dias_antes;
  return dias >= 0 && dias <= janela;
}

function montarVinculoList() {
  const nomes = new Set([ ...distintos("banco"), ...state.agenda.map(a => norm(a.vinculo_nome)).filter(Boolean) ]);
  $("agVinculoList").innerHTML = [ ...nomes ].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => `<option value="${escapeHtml(v)}">`).join("");
}

function renderAgenda() {
  buildCalendarGrid();
  renderAgendaList();
  montarVinculoList();
}

function buildCalendarGrid() {
  const ref = state.agendaRef, year = ref.getFullYear(), month = ref.getMonth();
  $("agMesLabel").textContent = ref.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  }).replace(/^\w/, c => c.toUpperCase());
  const first = new Date(year, month, 1), startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const hojeS = hojeStr(), p = n => String(n).padStart(2, "0");
  const porDia = {};
  state.agenda.forEach(a => {
    const k = norm(a.data);
    (porDia[k] = porDia[k] || []).push(a);
  });
  const dows = [ "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb" ];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join("");
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    let cellDate, outClass = "";
    if (dayNum < 1) {
      cellDate = new Date(year, month - 1, daysInPrev + dayNum);
      outClass = "out";
    } else if (dayNum > daysInMonth) {
      cellDate = new Date(year, month + 1, dayNum - daysInMonth);
      outClass = "out";
    } else cellDate = new Date(year, month, dayNum);
    const dstr = `${cellDate.getFullYear()}-${p(cellDate.getMonth() + 1)}-${p(cellDate.getDate())}`;
    const isToday = dstr === hojeS;
    const evs = (porDia[dstr] || []).slice().sort((a, b) => norm(a.hora).localeCompare(norm(b.hora)));
    const evsHtml = evs.slice(0, 4).map(a => {
      const alerta = ehAlerta(a);
      const hora = norm(a.hora) ? norm(a.hora).slice(0, 5) + " " : "";
      return `<div class="cal-ev tipo-${a.tipo}${alerta ? " alerta" : ""}" data-editagenda="${a.id}" title="${escapeHtml(norm(a.titulo))}">${hora}${escapeHtml(norm(a.titulo))}</div>`;
    }).join("");
    const mais = evs.length > 4 ? `<div class="cal-ev" style="opacity:.65;border-color:var(--dim)">+${evs.length - 4}</div>` : "";
    html += `<div class="cal-day ${outClass} ${isToday ? "today" : ""}" data-day="${dstr}">\n      <div class="n">${cellDate.getDate()}</div>\n      <div class="evs">${evsHtml}${mais}</div>\n    </div>`;
  }
  $("calGrid").innerHTML = html;
}

function renderAgendaList() {
  const hojeS = hojeStr();
  const proximos = state.agenda.filter(a => norm(a.data) >= hojeS).sort((a, b) => (norm(a.data) + norm(a.hora)).localeCompare(norm(b.data) + norm(b.hora)));
  const box = $("agendaList");
  if (!proximos.length) {
    box.innerHTML = `<div class="ag-empty">Nenhum compromisso futuro.</div>`;
    return;
  }
  box.innerHTML = proximos.map(a => {
    const alerta = ehAlerta(a);
    const vinc = norm(a.vinculo_nome) ? `${norm(a.vinculo_tipo) === "BANCO" ? "Banco" : "Parceiro"}: ${escapeHtml(norm(a.vinculo_nome))}` : "";
    const quem = norm(a.com_quem) ? `Com: ${escapeHtml(norm(a.com_quem))}` : "";
    const meta = [ vinc, quem ].filter(Boolean).join(" · ");
    return `<div class="ag-item ${alerta ? "alerta" : ""}" data-editagenda="${a.id}">\n      <div class="ag-data">${fmtDataCurta(a.data)}${norm(a.hora) ? " · " + norm(a.hora).slice(0, 5) : ""} · ${tipoLabel(a.tipo)}</div>\n      <div class="ag-tit">${escapeHtml(norm(a.titulo))}</div>\n      ${meta ? `<div class="ag-meta">${meta}</div>` : ""}\n    </div>`;
  }).join("");
}

function abrirCompromisso(id, dataPreset) {
  state.editingAgendaId = id || null;
  const a = id ? state.agenda.find(x => x.id === id) : {};
  $("agendaTitle").textContent = id ? "Editar compromisso" : "Novo compromisso";
  const set = (el, v) => $(el).value = v == null ? "" : v;
  set("ag_titulo", a.titulo);
  set("ag_tipo", a.tipo);
  set("ag_data", a.data || dataPreset || hojeStr());
  set("ag_hora", a.hora ? norm(a.hora).slice(0, 5) : "");
  set("ag_alerta", a.alerta_dias_antes != null ? a.alerta_dias_antes : "1");
  set("ag_vinculo_tipo", a.vinculo_tipo);
  set("ag_vinculo_nome", a.vinculo_nome);
  set("ag_com_quem", a.com_quem);
  set("ag_link", a.link);
  set("ag_obs", a.observacoes);
  $("agendaExcluir").style.display = id ? "" : "none";
  montarVinculoList();
  $("agendaOverlay").classList.add("show");
  setTimeout(() => $("ag_titulo").focus(), 50);
}

function payloadAgenda() {
  const g = el => {
    const v = $(el).value.trim();
    return v === "" ? null : v;
  };
  return {
    titulo: g("ag_titulo"),
    tipo: g("ag_tipo"),
    data: g("ag_data"),
    hora: g("ag_hora"),
    alerta_dias_antes: +$("ag_alerta").value || 0,
    vinculo_tipo: g("ag_vinculo_tipo"),
    vinculo_nome: g("ag_vinculo_nome"),
    com_quem: g("ag_com_quem"),
    link: g("ag_link"),
    observacoes: g("ag_obs")
  };
}

async function salvarCompromisso() {
  const titulo = $("ag_titulo").value.trim(), tipo = $("ag_tipo").value.trim(), data = $("ag_data").value.trim();
  const faltando = [];
  if (!titulo) faltando.push("Título");
  if (!tipo) faltando.push("Tipo");
  if (!data) faltando.push("Data");
  if (faltando.length) {
    toast("Obrigatórios: " + faltando.join(", "), "err");
    return;
  }
  const body = payloadAgenda();
  const btn = $("agendaSave");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    let res;
    if (state.editingAgendaId) {
      res = await fetch(`${REST_AGENDA()}?id=eq.${state.editingAgendaId}`, {
        method: "PATCH",
        headers: {
          ...H(),
          Prefer: "return=representation"
        },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch(REST_AGENDA(), {
        method: "POST",
        headers: {
          ...H(),
          Prefer: "return=representation"
        },
        body: JSON.stringify([ body ])
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    if (state.editingAgendaId) {
      const i = state.agenda.findIndex(x => x.id === state.editingAgendaId);
      if (i > -1) state.agenda[i] = saved;
    } else state.agenda.push(saved);
    $("agendaOverlay").classList.remove("show");
    renderAgenda();
    checarAlertas();
    logHist(state.editingAgendaId ? "editou_compromisso" : "criou_compromisso", "agenda", saved.id, `${state.editingAgendaId ? "Editou" : "Criou"} compromisso "${norm(saved.titulo)}" em ${fmtDataCurta(saved.data)}`);
    toast(state.editingAgendaId ? "Compromisso atualizado" : "Compromisso criado", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar compromisso. Veja o console (F12).", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function excluirCompromisso() {
  const id = state.editingAgendaId;
  if (!id) return;
  if (!confirm("Excluir este compromisso?")) return;
  try {
    const res = await fetch(`${REST_AGENDA()}?id=eq.${id}`, {
      method: "DELETE",
      headers: H()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    state.agenda = state.agenda.filter(x => x.id !== id);
    $("agendaOverlay").classList.remove("show");
    renderAgenda();
    checarAlertas();
    logHist("excluiu_compromisso", "agenda", id, "Excluiu compromisso");
    toast("Compromisso excluído", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao excluir compromisso.", "err");
  }
}

function checarAlertas() {
  const box = $("agendaAlert");
  const alvo = state.agenda.filter(ehAlerta).sort((a, b) => norm(a.data).localeCompare(norm(b.data)));
  if (!state.gestor || !alvo.length) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  const itens = alvo.slice(0, 3).map(a => `${escapeHtml(norm(a.titulo))} (${fmtDataCurta(a.data)})`).join(", ");
  const resto = alvo.length > 3 ? ` e mais ${alvo.length - 3}` : "";
  box.style.display = "flex";
  box.innerHTML = `⚠️ <span><b>${alvo.length} compromisso${alvo.length !== 1 ? "s" : ""}</b> próximo${alvo.length !== 1 ? "s" : ""}: ${itens}${resto}</span>`;
}

function bindAgenda() {
  $("agNovoBtn").onclick = () => abrirCompromisso(null, null);
  $("agendaSave").onclick = salvarCompromisso;
  $("agendaExcluir").onclick = excluirCompromisso;
  $("agPrev").onclick = () => {
    state.agendaRef = new Date(state.agendaRef.getFullYear(), state.agendaRef.getMonth() - 1, 1);
    buildCalendarGrid();
  };
  $("agNext").onclick = () => {
    state.agendaRef = new Date(state.agendaRef.getFullYear(), state.agendaRef.getMonth() + 1, 1);
    buildCalendarGrid();
  };
  $("agHoje").onclick = () => {
    state.agendaRef = new Date;
    buildCalendarGrid();
  };
  $("calGrid").addEventListener("click", e => {
    const ev = e.target.closest("[data-editagenda]");
    if (ev) {
      abrirCompromisso(+ev.dataset.editagenda);
      return;
    }
    const day = e.target.closest("[data-day]");
    if (day) abrirCompromisso(null, day.dataset.day);
  });
  $("agendaList").addEventListener("click", e => {
    const it = e.target.closest("[data-editagenda]");
    if (it) abrirCompromisso(+it.dataset.editagenda);
  });
}

async function logHist(acao, entidade, ref_id, descricao) {
  try {
    await fetch(REST_HIST(), {
      method: "POST",
      headers: {
        ...H(),
        Prefer: "return=minimal"
      },
      body: JSON.stringify([ {
        quem: state.gestorNome,
        acao: acao,
        entidade: entidade,
        ref_id: ref_id ?? null,
        descricao: descricao
      } ])
    });
  } catch (e) {
    console.warn("histórico:", e);
  }
}

async function renderHistorico() {
  const tb = $("histTbody");
  tb.innerHTML = `<tr><td colspan="4" style="color:var(--muted)">carregando…</td></tr>`;
  try {
    const res = await fetch(`${REST_HIST()}?select=*&order=criado_em.desc&limit=300`, {
      headers: H()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    state.hist = await res.json();
  } catch (e) {
    console.error(e);
    tb.innerHTML = `<tr><td colspan="4" style="color:var(--inativo)">erro ao carregar (RLS?)</td></tr>`;
    return;
  }
  $("histEmpty").style.display = state.hist.length ? "none" : "block";
  tb.innerHTML = state.hist.map(h => `<tr>\n    <td class="mono">${escapeHtml(fmtData(h.criado_em))}</td>\n    <td><b>${escapeHtml(norm(h.quem) || "—")}</b></td>\n    <td>${escapeHtml(norm(h.acao) || "—")}</td>\n    <td class="empresa">${escapeHtml(norm(h.descricao) || "—")}</td>\n  </tr>`).join("");
}

function fmtData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return norm(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseObs(raw) {
  const s = norm(raw);
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v;
  } catch (e) {}
  return [ {
    quem: "—",
    texto: s,
    em: null
  } ];
}

function temObs(r) {
  return parseObs(r.observacao).length > 0;
}

function serialObs(blocks) {
  return blocks.length ? JSON.stringify(blocks) : null;
}

function abrirObs(mode, subId) {
  state.obsMode = mode;
  state.obsSubId = subId || null;
  const r = subId ? state.rows.find(x => x.id === subId) : null;
  state.obsBlocks = mode === "edit" ? parseObs(r && r.observacao) : [];
  $("obsTitle").textContent = mode === "create" ? "Observações (opcional)" : "Observações do sub";
  $("obsFechar").style.display = mode === "create" ? "none" : "";
  $("obsConcluir").style.display = mode === "create" ? "" : "none";
  $("obsInput").value = "";
  renderObsBlocks();
  const podeAnexar = mode === "edit" && subId;
  $("obsAnexosCol").style.display = podeAnexar ? "" : "none";
  $("obsAnexosAviso").style.display = podeAnexar ? "none" : "block";
  $("obsArqFile").value = "";
  $("obsArqTitulo").value = "";
  $("obsArqNome").textContent = "";
  if (podeAnexar) carregarArquivosSub(subId);
  $("obsOverlay").classList.add("show");
  setTimeout(() => $("obsInput").focus(), 50);
}

function renderObsBlocks() {
  const box = $("obsBlocks");
  if (!state.obsBlocks.length) {
    box.innerHTML = `<div class="obs-vazio">Nenhuma observação ainda.</div>`;
    return;
  }
  box.innerHTML = state.obsBlocks.map((b, i) => `\n    <div class="obs-block">\n      <div class="obs-head">\n        <span class="obs-quem">${escapeHtml(norm(b.quem) || "—")}</span>\n        <span class="obs-quando">${escapeHtml(b.em ? fmtData(b.em) : "")}</span>\n        <button class="obs-del" data-i="${i}" title="Apagar">&times;</button>\n      </div>\n      <div class="obs-text">${escapeHtml(norm(b.texto))}</div>\n    </div>`).join("");
  box.scrollTop = box.scrollHeight;
}

async function persistObsEdit() {
  const id = state.obsSubId;
  if (!id) return;
  try {
    const res = await fetch(`${REST()}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        observacao: serialObs(state.obsBlocks)
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    const i = state.rows.findIndex(x => x.id === id);
    if (i > -1) state.rows[i] = saved;
    aplicarFiltros();
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar observação.", "err");
  }
}

function obsEnviar() {
  const t = $("obsInput").value.trim();
  if (!t) return;
  state.obsBlocks.push({
    quem: state.gestorNome,
    texto: t,
    em: (new Date).toISOString()
  });
  $("obsInput").value = "";
  renderObsBlocks();
  if (state.obsMode === "edit") {
    persistObsEdit();
    logHist("observacao", "substabelecidos", state.obsSubId, `Observação em sub #${state.obsSubId}`);
  }
}

function obsDel(i) {
  state.obsBlocks.splice(i, 1);
  renderObsBlocks();
  if (state.obsMode === "edit") persistObsEdit();
}

async function obsConcluir() {
  const btn = $("obsConcluir");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    const body = {
      ...state.obsPendingBody,
      observacao: serialObs(state.obsBlocks)
    };
    const res = await fetch(REST(), {
      method: "POST",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify([ body ])
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    state.rows.push(saved);
    $("obsOverlay").classList.remove("show");
    $("formOverlay").classList.remove("show");
    montarFiltros();
    aplicarFiltros();
    renderKPIs();
    logHist("criou_sub", "substabelecidos", saved.id, `Criou sub ${norm(saved.nome_subs)} (${norm(saved.banco)})`);
    toast("Substabelecido criado", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao criar. Veja o console (F12).", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function abrirPasso(id) {
  const b = state.bancos.find(x => x.id === id);
  if (!b) return;
  state.editingPassoId = id;
  $("passoTitle").textContent = `Passo a passo — ${norm(b.nome_banco) || "banco"}`;
  $("passoTexto").value = norm(b.passo_a_passo);
  $("passoArqFile").value = "";
  $("passoArqTitulo").value = "";
  $("passoArqNome").textContent = "";
  $("passoOverlay").classList.add("show");
  carregarArquivosBanco(id);
}

const BUCKET_ARQ = "arquivos_bancos";

const REST_BANCO_ARQ = () => `${CONFIG.SUPABASE_URL}/rest/v1/banco_arquivos`;

const urlPublicaArq = path => `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${BUCKET_ARQ}/${path}`;

const MAX_ARQ_MB = 20;

function iconeArquivo(nome) {
  const ext = (nome.split(".").pop() || "").toLowerCase();
  if ([ "pdf" ].includes(ext)) return "PDF";
  if ([ "doc", "docx" ].includes(ext)) return "DOC";
  if ([ "xls", "xlsx", "csv" ].includes(ext)) return "XLS";
  if ([ "png", "jpg", "jpeg", "gif", "webp" ].includes(ext)) return "IMG";
  if ([ "zip", "rar", "7z" ].includes(ext)) return "ZIP";
  return "ARQ";
}

async function carregarArquivosBanco(bancoId) {
  const el = $("passoArqList");
  try {
    const res = await fetch(`${REST_BANCO_ARQ()}?banco_id=eq.${bancoId}&order=criado_em.desc`, {
      headers: H()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    renderArquivosBanco(await res.json());
  } catch (e) {
    console.error(e);
    el.innerHTML = '<div class="dl-empty">Erro ao carregar anexos.<br>Verifique se a tabela <b>banco_arquivos</b> e o bucket existem.</div>';
  }
}

function renderArquivosBanco(list) {
  const el = $("passoArqList");
  if (!list.length) {
    el.innerHTML = '<div class="dl-empty">Nenhum arquivo anexado.</div>';
    return;
  }
  el.innerHTML = list.map(a => `\n    <div class="pa-item">\n      <span class="pa-ic">${iconeArquivo(norm(a.nome_arquivo))}</span>\n      <div class="pa-info">\n        <a class="pa-titulo" href="${urlPublicaArq(a.path)}" target="_blank" rel="noopener" title="Abrir ${escapeHtml(norm(a.nome_arquivo))}">${escapeHtml(norm(a.titulo) || norm(a.nome_arquivo))}</a>\n        <span class="pa-nome">${escapeHtml(norm(a.nome_arquivo))}</span>\n      </div>\n      <button class="pa-del" title="Excluir anexo" data-arqdel="${a.id}" data-arqpath="${escapeHtml(a.path)}">&times;</button>\n    </div>`).join("");
}

async function anexarArquivoBanco() {
  const bancoId = state.editingPassoId;
  const file = $("passoArqFile").files[0];
  const titulo = $("passoArqTitulo").value.trim();
  if (!file) {
    toast("Escolha um arquivo primeiro.", "err");
    return;
  }
  if (!titulo) {
    toast("Dê um título ao anexo.", "err");
    $("passoArqTitulo").focus();
    return;
  }
  if (file.size > MAX_ARQ_MB * 1024 * 1024) {
    toast(`Arquivo acima de ${MAX_ARQ_MB} MB.`, "err");
    return;
  }
  const btn = $("passoArqAdd");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> Enviando…';
  try {
    const nomeSan = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${bancoId}/${Date.now()}_${nomeSan}`;
    const up = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ}/${path}`, {
      method: "POST",
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: "Bearer " + CONFIG.SUPABASE_KEY,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false"
      },
      body: file
    });
    if (!up.ok) throw new Error(`Upload HTTP ${up.status} — ${await up.text()}`);
    const ins = await fetch(REST_BANCO_ARQ(), {
      method: "POST",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        banco_id: bancoId,
        titulo: titulo,
        nome_arquivo: file.name,
        path: path
      })
    });
    if (!ins.ok) throw new Error(`HTTP ${ins.status} — ${await ins.text()}`);
    const b = state.bancos.find(x => x.id === bancoId);
    logHist("anexou_arquivo", "bancos", bancoId, `Anexou "${titulo}" ao banco ${norm(b && b.nome_banco)}`);
    $("passoArqFile").value = "";
    $("passoArqTitulo").value = "";
    $("passoArqNome").textContent = "";
    toast("Arquivo anexado", "ok");
    carregarArquivosBanco(bancoId);
  } catch (e) {
    console.error(e);
    toast("Erro ao anexar: " + e.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function excluirArquivoBanco(id, path) {
  if (!confirm("Excluir este anexo?")) return;
  try {
    const del = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ}/${path}`, {
      method: "DELETE",
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: "Bearer " + CONFIG.SUPABASE_KEY
      }
    });
    if (!del.ok && del.status !== 404) throw new Error(`Storage HTTP ${del.status} — ${await del.text()}`);
    const res = await fetch(`${REST_BANCO_ARQ()}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        ...H(),
        Prefer: "return=representation"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) throw new Error("RLS bloqueou a exclusão na tabela banco_arquivos.");
    toast("Anexo excluído", "ok");
    carregarArquivosBanco(state.editingPassoId);
  } catch (e) {
    console.error(e);
    toast("Erro ao excluir: " + e.message, "err");
  }
}

const BUCKET_ARQ_SUB = "arquivos_subs";

const REST_SUB_ARQ = () => `${CONFIG.SUPABASE_URL}/rest/v1/substabelecido_arquivos`;

const urlPublicaArqSub = path => `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${BUCKET_ARQ_SUB}/${path}`;

async function carregarArquivosSub(subId) {
  const el = $("obsArqList");
  el.innerHTML = '<div class="dl-empty">Carregando…</div>';
  try {
    const res = await fetch(`${REST_SUB_ARQ()}?substabelecido_id=eq.${subId}&order=criado_em.desc`, {
      headers: H()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    renderArquivosSub(await res.json());
  } catch (e) {
    console.error(e);
    el.innerHTML = '<div class="dl-empty">Erro ao carregar documentos.<br>Verifique se a tabela <b>substabelecido_arquivos</b> e o bucket existem.</div>';
  }
}

function renderArquivosSub(list) {
  const el = $("obsArqList");
  if (!list.length) {
    el.innerHTML = '<div class="dl-empty">Nenhum documento anexado.</div>';
    return;
  }
  el.innerHTML = list.map(a => `\n    <div class="pa-item">\n      <span class="pa-ic">${iconeArquivo(norm(a.nome_arquivo))}</span>\n      <div class="pa-info">\n        <a class="pa-titulo" href="${urlPublicaArqSub(a.path)}" target="_blank" rel="noopener" title="Abrir ${escapeHtml(norm(a.nome_arquivo))}">${escapeHtml(norm(a.titulo) || norm(a.nome_arquivo))}</a>\n        <span class="pa-nome">${escapeHtml(norm(a.nome_arquivo))}</span>\n      </div>\n      <button class="pa-del" title="Excluir documento" data-subarqdel="${a.id}" data-subarqpath="${escapeHtml(a.path)}">&times;</button>\n    </div>`).join("");
}

async function anexarArquivoSub() {
  const subId = state.obsSubId;
  const file = $("obsArqFile").files[0];
  const titulo = $("obsArqTitulo").value.trim();
  if (!subId) {
    toast("Salve o cadastro antes de anexar documentos.", "err");
    return;
  }
  if (!file) {
    toast("Escolha um arquivo primeiro.", "err");
    return;
  }
  if (!titulo) {
    toast("Dê um título ao documento.", "err");
    $("obsArqTitulo").focus();
    return;
  }
  if (file.size > MAX_ARQ_MB * 1024 * 1024) {
    toast(`Arquivo acima de ${MAX_ARQ_MB} MB.`, "err");
    return;
  }
  const btn = $("obsArqAdd");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> Enviando…';
  try {
    const nomeSan = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${subId}/${Date.now()}_${nomeSan}`;
    const up = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ_SUB}/${path}`, {
      method: "POST",
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: "Bearer " + CONFIG.SUPABASE_KEY,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false"
      },
      body: file
    });
    if (!up.ok) throw new Error(`Upload HTTP ${up.status} — ${await up.text()}`);
    const ins = await fetch(REST_SUB_ARQ(), {
      method: "POST",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        substabelecido_id: subId,
        titulo: titulo,
        nome_arquivo: file.name,
        path: path
      })
    });
    if (!ins.ok) throw new Error(`HTTP ${ins.status} — ${await ins.text()}`);
    const r = state.rows.find(x => x.id === subId);
    logHist("anexou_documento", "substabelecidos", subId, `Anexou "${titulo}" ao sub ${norm(r && r.nome_subs)}`);
    $("obsArqFile").value = "";
    $("obsArqTitulo").value = "";
    $("obsArqNome").textContent = "";
    toast("Documento anexado", "ok");
    carregarArquivosSub(subId);
  } catch (e) {
    console.error(e);
    toast("Erro ao anexar: " + e.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function excluirArquivoSub(id, path) {
  if (!confirm("Excluir este documento?")) return;
  try {
    const del = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ_SUB}/${path}`, {
      method: "DELETE",
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: "Bearer " + CONFIG.SUPABASE_KEY
      }
    });
    if (!del.ok && del.status !== 404) throw new Error(`Storage HTTP ${del.status} — ${await del.text()}`);
    const res = await fetch(`${REST_SUB_ARQ()}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        ...H(),
        Prefer: "return=representation"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) throw new Error("RLS bloqueou a exclusão na tabela substabelecido_arquivos.");
    toast("Documento excluído", "ok");
    carregarArquivosSub(state.obsSubId);
  } catch (e) {
    console.error(e);
    toast("Erro ao excluir: " + e.message, "err");
  }
}

async function salvarPasso() {
  const id = state.editingPassoId;
  if (!id) return;
  const texto = $("passoTexto").value;
  const btn = $("passoSave");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    const res = await fetch(`${REST_BANCOS()}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        passo_a_passo: texto || null
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const saved = (await res.json())[0];
    const i = state.bancos.findIndex(x => x.id === id);
    if (i > -1) state.bancos[i] = saved;
    logHist("passo_a_passo", "bancos", id, `Atualizou passo a passo do banco ${norm(saved.nome_banco)}`);
    $("passoOverlay").classList.remove("show");
    toast("Passo a passo salvo", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar passo a passo.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

const MESES_PT = [ "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro" ];

function mesLabel(iso) {
  if (!iso) return "—";
  const [y, m] = String(iso).split("-");
  const i = parseInt(m, 10) - 1;
  return (MESES_PT[i] || "?") + "/" + y;
}

function fmtMoeda(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function initProducao() {
  state.prod = state.prod || {
    subId: null,
    sub: null,
    dados: [],
    convenios: [],
    filtroBanco: "",
    filtroMes: ""
  };
  $("prodBuscaSub").oninput = () => renderSugestoesProducao($("prodBuscaSub").value);
  $("prodBuscaSub").onfocus = () => renderSugestoesProducao($("prodBuscaSub").value);
  $("prodLimpar").onclick = limparProducao;
  $("prodFiltroBanco").onchange = () => {
    state.prod.filtroBanco = $("prodFiltroBanco").value;
    renderSinteticoProducao();
    renderTabelaProducao();
    renderConvenioProducao();
  };
  $("prodFiltroMes").onchange = () => {
    state.prod.filtroMes = $("prodFiltroMes").value;
    renderSinteticoProducao();
    renderTabelaProducao();
  };
  if (!state.prod.subId) {
    $("prodVazio").style.display = "block";
    $("prodConteudo").style.display = "none";
  }
}

function renderSugestoesProducao(q) {
  const box = $("prodSugestoes");
  const termo = lower(q || "").trim();
  const vistos = new Set;
  const todos = state.rows.filter(isReal).filter(r => {
    if (!termo) return true;
    const nome = lower(norm(r.nome_subs)), cod = lower(norm(r.cod_substabelecido));
    return nome.includes(termo) || cod.includes(termo);
  }).filter(r => {
    const k = norm(r.cod_substabelecido) || "__semcod__" + r.id;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
  const results = todos;
  if (!results.length) {
    box.innerHTML = '<div class="prod-sug-empty">Nenhum substabelecido encontrado.</div>';
    box.style.display = "block";
    return;
  }
  box.innerHTML = results.map(r => `\n    <button class="prod-sug-item" data-subid="${r.id}">\n      <span class="prod-sug-nome">${escapeHtml(norm(r.nome_subs) || "—")}</span>\n      <span class="prod-sug-cod">${escapeHtml(norm(r.cod_substabelecido) || "Sem código")}</span>\n    </button>`).join("");
  box.style.display = "block";
  box.querySelectorAll("[data-subid]").forEach(btn => {
    btn.onclick = () => selecionarSubProducao(+btn.dataset.subid);
  });
}

async function selecionarSubProducao(subId) {
  const r = state.rows.find(x => x.id === subId);
  if (!r) return;
  state.prod.subId = subId;
  state.prod.sub = r;
  state.prod.filtroBanco = "";
  state.prod.filtroMes = "";
  $("prodBuscaSub").value = norm(r.nome_subs);
  $("prodSugestoes").style.display = "none";
  $("prodSugestoes").innerHTML = "";
  $("prodLimpar").style.display = "";
  $("prodFieldBanco").style.display = "none";
  $("prodFieldMes").style.display = "none";
  $("prodVazio").style.display = "none";
  $("prodConteudo").style.display = "block";
  $("prodSubNome").textContent = norm(r.nome_subs) || "—";
  $("prodSubCodigo").innerHTML = `Cód. <b>${escapeHtml(norm(r.cod_substabelecido) || "—")}</b>`;
  $("prodKpis").innerHTML = '<div class="empty-state"><b>Carregando…</b></div>';
  $("prodPorBanco").innerHTML = $("prodPorConvenio").innerHTML = $("prodPorForma").innerHTML = "";
  $("prodTbody").innerHTML = "";
  $("prodConvKpis").innerHTML = "";
  $("prodConvTbody").innerHTML = "";
  $("prodConvAtualizado").textContent = "";
  const cod = norm(r.cod_substabelecido);
  if (!cod) {
    $("prodKpis").innerHTML = '<div class="empty-state"><b>Sem código de substabelecido</b>Este cadastro não tem "Cód. substabelecido" preenchido, então não é possível vincular a produção.</div>';
    return;
  }
  try {
    const res = await fetch(`${REST_PRODUCAO()}?cod_substabelecido=eq.${encodeURIComponent(cod)}&order=mes_referencia.desc`, {
      headers: H()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    state.prod.dados = await res.json();
  } catch (e) {
    console.error(e);
    state.prod.dados = [];
    toast("Erro ao carregar produção. Veja o console (F12).", "err");
  }
  try {
    const res2 = await fetch(`${REST_PRODUCAO_CONVENIO()}?cod_substabelecido=eq.${encodeURIComponent(cod)}&order=banco.asc,valor_bruto.desc`, {
      headers: H()
    });
    if (!res2.ok) throw new Error(`HTTP ${res2.status} — ${await res2.text()}`);
    state.prod.convenios = await res2.json();
  } catch (e) {
    console.error(e);
    state.prod.convenios = [];
  }
  montarFiltrosProducao();
  if (!state.prod.dados.length && !state.prod.convenios.length) {
    $("prodKpis").innerHTML = `<div class="empty-state">\n      <b>Nenhum dado de produção encontrado</b>\n      Ainda não há lançamentos para o código <b>${escapeHtml(cod)}</b> — nem no histórico mensal, nem no sincronismo por convênio.\n    </div>`;
    $("prodPorBanco").innerHTML = $("prodPorConvenio").innerHTML = $("prodPorForma").innerHTML = "";
    $("prodTabCount").innerHTML = "";
    $("prodTbody").innerHTML = "";
    $("prodConvKpis").innerHTML = "";
    $("prodConvTbody").innerHTML = "";
    $("prodConvAtualizado").textContent = "";
    return;
  }
  renderSinteticoProducao();
  renderTabelaProducao();
  renderConvenioProducao();
}

function montarFiltrosProducao() {
  const dados = state.prod.dados;
  const bancos = [ ...new Set([ ...dados.map(d => norm(d.banco)), ...state.prod.convenios.map(c => norm(c.banco)) ].filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const meses = [ ...new Set(dados.map(d => norm(d.mes_referencia)).filter(Boolean)) ].sort().reverse();
  $("prodFieldBanco").style.display = bancos.length ? "" : "none";
  $("prodFieldMes").style.display = meses.length ? "" : "none";
  $("prodFiltroBanco").innerHTML = `<option value="">Todos os bancos</option>` + bancos.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  $("prodFiltroMes").innerHTML = `<option value="">Todos os meses</option>` + meses.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(mesLabel(m))}</option>`).join("");
}

function dadosProducaoFiltrados() {
  return state.prod.dados.filter(d => (!state.prod.filtroBanco || norm(d.banco) === state.prod.filtroBanco) && (!state.prod.filtroMes || norm(d.mes_referencia) === state.prod.filtroMes));
}

function barrasHTML(mapa, valLabel) {
  const entries = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<div class="dl-empty">Sem dados.</div>';
  const max = entries[0][1];
  return `<div class="k-bars">` + entries.map(([k, v]) => `\n    <div class="k-bar">\n      <span class="n" title="${escapeHtml(k)}">${escapeHtml(k)}</span>\n      <span class="track"><span class="fill" style="width:${Math.round(v / max * 100)}%"></span></span>\n      <span class="v">${valLabel(v)}</span>\n    </div>`).join("") + `</div>`;
}

function renderSinteticoProducao() {
  const dados = dadosProducaoFiltrados();
  const totalValor = dados.reduce((s, d) => s + (Number(d.valor_produzido) || 0), 0);
  const totalContratos = dados.reduce((s, d) => s + (Number(d.qtd_contratos) || 0), 0);
  const nBancos = new Set(dados.map(d => norm(d.banco))).size;
  const nMeses = new Set(dados.map(d => norm(d.mes_referencia))).size;
  $("prodKpis").innerHTML = `\n    <div class="kpi"><div class="k-label">Valor produzido</div><div class="k-val cyan">${fmtMoeda(totalValor)}</div></div>\n    <div class="kpi"><div class="k-label">Contratos</div><div class="k-val">${totalContratos}</div></div>\n    <div class="kpi"><div class="k-label">Bancos</div><div class="k-val">${nBancos}</div></div>\n    <div class="kpi"><div class="k-label">Meses com produção</div><div class="k-val">${nMeses}</div></div>\n  `;
  const porBanco = {}, porConvenio = {}, porForma = {};
  dados.forEach(d => {
    const v = Number(d.valor_produzido) || 0;
    const b = norm(d.banco) || "Sem banco";
    porBanco[b] = (porBanco[b] || 0) + v;
    const c = norm(d.convenio) || "Não informado";
    porConvenio[c] = (porConvenio[c] || 0) + v;
    const f = norm(d.forma_contrato) || "Não informado";
    porForma[f] = (porForma[f] || 0) + v;
  });
  $("prodPorBanco").innerHTML = barrasHTML(porBanco, fmtMoeda);
  $("prodPorConvenio").innerHTML = barrasHTML(porConvenio, fmtMoeda);
  $("prodPorForma").innerHTML = barrasHTML(porForma, fmtMoeda);
}

function convenioProducaoFiltrados() {
  return state.prod.convenios.filter(c => !state.prod.filtroBanco || norm(c.banco) === state.prod.filtroBanco);
}

function renderConvenioProducao() {
  const lista = convenioProducaoFiltrados();
  if (!state.prod.convenios.length) {
    $("prodConvAtualizado").textContent = "";
    $("prodConvKpis").innerHTML = '<div class="empty-state"><b>Sem dados de convênio</b>Ainda não há sincronização da API para este parceiro.</div>';
    $("prodConvTbody").innerHTML = "";
    return;
  }
  const maisRecente = state.prod.convenios.reduce((max, c) => c.atualizado_em > max ? c.atualizado_em : max, "");
  $("prodConvAtualizado").textContent = maisRecente ? `Atualizado em ${fmtData(maisRecente)}` : "";
  const soma = campo => lista.reduce((s, c) => s + (Number(c[campo]) || 0), 0);
  $("prodConvKpis").innerHTML = `\n    <div class="kpi"><div class="k-label">Pago</div><div class="k-val cyan">${fmtMoeda(soma("valor_pago"))}</div></div>\n    <div class="kpi"><div class="k-label">Em andamento</div><div class="k-val">${fmtMoeda(soma("valor_em_andamento"))}</div></div>\n    <div class="kpi"><div class="k-label">Pendente</div><div class="k-val">${fmtMoeda(soma("valor_pendente"))}</div></div>\n    <div class="kpi"><div class="k-label">Cancelado</div><div class="k-val red">${fmtMoeda(soma("valor_cancelado"))}</div></div>\n  `;
  $("prodConvTbody").innerHTML = lista.length ? lista.map(c => `\n    <tr>\n      <td>${escapeHtml(norm(c.banco) || "—")}</td>\n      <td>${escapeHtml(norm(c.convenio_nome) || "—")}</td>\n      <td class="mono">${fmtMoeda(c.valor_pendente)}</td>\n      <td class="mono">${fmtMoeda(c.valor_pago)}</td>\n      <td class="mono">${fmtMoeda(c.valor_em_andamento)}</td>\n      <td class="mono">${fmtMoeda(c.valor_cancelado)}</td>\n      <td class="mono">${fmtMoeda(c.valor_liquido)}</td>\n      <td class="mono">${fmtMoeda(c.valor_bruto)}</td>\n      <td class="mono">${fmtMoeda(c.valor_base_comissao)}</td>\n    </tr>`).join("") : `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:30px">Nenhum convênio para o banco selecionado.</td></tr>`;
}

function renderTabelaProducao() {
  const dados = dadosProducaoFiltrados().slice().sort((a, b) => norm(b.mes_referencia).localeCompare(norm(a.mes_referencia)));
  $("prodTabCount").innerHTML = `<b>${dados.length}</b> lançamento${dados.length !== 1 ? "s" : ""}`;
  $("prodTbody").innerHTML = dados.length ? dados.map(d => `\n    <tr>\n      <td class="mono">${escapeHtml(mesLabel(d.mes_referencia))}</td>\n      <td>${escapeHtml(norm(d.banco) || "—")}</td>\n      <td>${escapeHtml(norm(d.convenio) || "—")}</td>\n      <td>${escapeHtml(norm(d.forma_contrato) || "—")}</td>\n      <td class="mono">${fmtMoeda(d.valor_produzido)}</td>\n      <td class="mono">${escapeHtml(String(d.qtd_contratos ?? "—"))}</td>\n    </tr>`).join("") : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">Nenhum lançamento de produção para este substabelecido.</td></tr>`;
}

function limparProducao() {
  state.prod = {
    subId: null,
    sub: null,
    dados: [],
    convenios: [],
    filtroBanco: "",
    filtroMes: ""
  };
  $("prodBuscaSub").value = "";
  $("prodSugestoes").style.display = "none";
  $("prodSugestoes").innerHTML = "";
  $("prodLimpar").style.display = "none";
  $("prodFieldBanco").style.display = "none";
  $("prodFieldMes").style.display = "none";
  $("prodVazio").style.display = "block";
  $("prodConteudo").style.display = "none";
}

function switchTab(t) {
  $("viewWelcome").style.display = t === "welcome" ? "" : "none";
  $("viewSubs").style.display = t === "subs" ? "" : "none";
  $("viewBancosConsulta").style.display = t === "bancosc" ? "" : "none";
  $("viewBancos").style.display = t === "bancos" ? "" : "none";
  $("viewProducao").style.display = t === "producao" ? "" : "none";
  $("viewAgenda").style.display = t === "agenda" ? "" : "none";
  $("viewHist").style.display = t === "hist" ? "" : "none";
  $("viewDuvidas").style.display = t === "duvidas" ? "" : "none";
  $("viewPainel").style.display = t === "painel" ? "" : "none";
  document.querySelectorAll("#tabs .tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  document.querySelectorAll("#tabsCons .tab").forEach(b => b.classList.toggle("active", b.dataset.consview === t));
  if (t === "bancosc") renderBancosConsulta();
  if (t === "bancos") renderBancos();
  if (t === "producao") initProducao();
  if (t === "agenda") renderAgenda();
  if (t === "hist") renderHistorico();
  if (t === "duvidas") carregarDuvidas();
  if (t === "painel") renderPainel();
  const vid = {
    welcome: "viewWelcome",
    subs: "viewSubs",
    bancosc: "viewBancosConsulta",
    bancos: "viewBancos",
    producao: "viewProducao",
    agenda: "viewAgenda",
    hist: "viewHist",
    duvidas: "viewDuvidas",
    painel: "viewPainel"
  }[t];
  if (vid) {
    const el = $(vid);
    if (el) {
      el.classList.remove("view-enter");
      void el.offsetWidth;
      el.classList.add("view-enter");
    }
  }
}

function validarCnpjSubUI() {
  const v = $("f_cnpj_subs").value.trim(), h = $("cnpjSubHint");
  if (!v) {
    h.textContent = "";
    h.className = "hint";
    return;
  }
  if (validaCNPJ(v)) {
    h.textContent = "CNPJ válido";
    h.className = "hint ok";
  } else {
    h.textContent = "CNPJ inválido";
    h.className = "hint warn";
  }
}

function bindForm() {
  $("novoBtn").onclick = () => abrirForm(null);
  $("formSave").onclick = salvarForm;
  $("f_razao").addEventListener("change", e => {
    const opt = e.target.selectedOptions[0];
    $("f_cnpj").value = opt ? opt.dataset.cnpj || "" : "";
  });
  $("f_cnpj_subs").addEventListener("input", e => {
    e.target.value = mascaraCNPJ(e.target.value);
    validarCnpjSubUI();
  });
  $("f_tipo").addEventListener("change", atualizarObrigatoriedadeComissao);
  $("novoBancoBtn").onclick = () => abrirBanco(null);
  $("bancoSave").onclick = salvarBanco;
  $("b_contato").addEventListener("input", e => {
    e.target.value = mascaraTel(e.target.value);
    validarBancoUI();
  });
  $("b_email").addEventListener("input", validarBancoUI);
  $("b_suporte").addEventListener("input", validarBancoUI);
  $("bancosTbody").addEventListener("click", e => {
    const ed = e.target.closest("[data-editbanco]");
    const ps = e.target.closest("[data-passo]");
    const ina = e.target.closest("[data-inativabanco]");
    const at = e.target.closest("[data-ativabanco]");
    if (ed) abrirBanco(+ed.dataset.editbanco); else if (ps) abrirPasso(+ps.dataset.passo); else if (ina) {
      if (confirm("Inativar este banco?")) mudarStatusBanco(+ina.dataset.inativabanco, "INATIVO");
    } else if (at) mudarStatusBanco(+at.dataset.ativabanco, "ATIVO");
  });
  $("passoSave").onclick = salvarPasso;
  $("passoArqPick").onclick = () => $("passoArqFile").click();
  $("passoArqFile").onchange = () => {
    const f = $("passoArqFile").files[0];
    $("passoArqNome").textContent = f ? f.name : "";
  };
  $("passoArqAdd").onclick = anexarArquivoBanco;
  $("passoArqList").addEventListener("click", e => {
    const d = e.target.closest("[data-arqdel]");
    if (d) excluirArquivoBanco(+d.dataset.arqdel, d.dataset.arqpath);
  });
  $("obsEnviar").onclick = obsEnviar;
  $("obsConcluir").onclick = obsConcluir;
  $("obsInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      obsEnviar();
    }
  });
  $("obsArqPick").onclick = () => $("obsArqFile").click();
  $("obsArqFile").onchange = () => {
    const f = $("obsArqFile").files[0];
    $("obsArqNome").textContent = f ? f.name : "";
  };
  $("obsArqAdd").onclick = anexarArquivoSub;
  $("obsArqList").addEventListener("click", e => {
    const d = e.target.closest("[data-subarqdel]");
    if (d) excluirArquivoSub(+d.dataset.subarqdel, d.dataset.subarqpath);
  });
  $("obsBlocks").addEventListener("click", e => {
    const d = e.target.closest(".obs-del");
    if (d) obsDel(+d.dataset.i);
  });
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
}

function bind() {
  [ "fBusca", "fBanco", "fStatus", "fTipo", "fGerente" ].forEach(id => {
    const ev = id === "fBusca" ? "input" : "change";
    $(id).addEventListener(ev, aplicarFiltros);
  });
  $("limparBtn").onclick = () => {
    $("fBusca").value = "";
    $("fBanco").value = "";
    $("fStatus").value = "ATIVO";
    $("fTipo").value = "";
    $("fGerente").value = "";
    aplicarFiltros();
  };
  $("reloadBtn").onclick = carregar;
  $("histReload").onclick = renderHistorico;
  $("prevBtn").onclick = () => {
    state.page--;
    renderTabela();
  };
  $("nextBtn").onclick = () => {
    state.page++;
    renderTabela();
  };
  $("gestorBtn").onclick = () => {
    $("loginUser").value = "";
    $("loginPass").value = "";
    $("loginHint").textContent = "";
    $("loginOverlay").classList.add("show");
    $("loginUser").focus();
  };
  $("sairBtn").onclick = () => {
    if (confirm("Deseja realmente sair da área do gestor?")) sairGestor();
  };
  $("loginConfirm").onclick = async () => {
    const login = $("loginUser").value.trim(), senha = $("loginPass").value;
    if (!login || !senha) {
      $("loginHint").innerHTML = '<span class="warn">Preencha login e senha.</span>';
      return;
    }
    $("loginHint").textContent = "Verificando…";
    const resultado = await authLogin(login, senha);
    if (resultado) {
      state.gestorNome = resultado.nome;
      $("loginOverlay").classList.remove("show");
      entrarGestor();
    } else $("loginHint").innerHTML = '<span class="warn">Login ou senha incorretos.</span>';
  };
  $("loginPass").addEventListener("keydown", e => {
    if (e.key === "Enter") $("loginConfirm").click();
  });
  $("loginUser").addEventListener("keydown", e => {
    if (e.key === "Enter") $("loginPass").focus();
  });
  bindForm();
  bindAgenda();
  $("viewPainel").addEventListener("click", e => {
    const d = e.target.closest("[data-det-tipo]");
    if (d) {
      abrirDetalhePainel(d.dataset.detTipo, d.dataset.detValor);
      return;
    }
    const c = e.target.closest("[data-filtro]");
    if (c) {
      state.painelFiltro = c.dataset.filtro;
      renderPainel();
    }
  });
  $("detalhePdfBtn").onclick = exportarDetalhePDF;
  $("notifBtn").onclick = e => {
    e.stopPropagation();
    const open = $("notifPanel").classList.toggle("open");
    if (open) marcarHistoricoLido();
  };
  $("notifClear").onclick = e => {
    e.stopPropagation();
    limparHistoricoNotif();
  };
  document.addEventListener("click", e => {
    if (!e.target.closest("#notifWrap")) $("notifPanel").classList.remove("open");
  });
  $("duvidaSend").onclick = enviarDuvida;
  $("minhasBtn").onclick = abrirMinhas;
  $("duvidaBtn").onclick = () => {
    $("duvidaOverlay").classList.add("show");
    $("duvidaNome").focus();
  };
  $("tabsCons").addEventListener("click", e => {
    const b = e.target.closest("[data-consview]");
    if (b) switchTab(b.dataset.consview);
  });
  $("wlSubs").onclick = () => switchTab("subs");
  $("wlBancos").onclick = () => switchTab("bancosc");
  $("wlDuvida").onclick = () => {
    $("duvidaOverlay").classList.add("show");
    $("duvidaNome").focus();
  };
  $("fBancoConsulta").addEventListener("input", renderBancosConsulta);
  $("duvidaMsg").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarDuvida();
    }
  });
  $("fDuvidaStatus").addEventListener("change", renderDuvidas);
  $("duvidasList").addEventListener("click", e => {
    const r = e.target.closest("[data-responder]");
    if (r) {
      abrirResposta(+r.dataset.responder);
      return;
    }
    const a = e.target.closest("[data-apagar]");
    if (a) excluirDuvida(+a.dataset.apagar);
  });
  $("respSalvar").onclick = salvarResposta;
  $("tbody").addEventListener("click", e => {
    const ob = e.target.closest("[data-obs]");
    const ed = e.target.closest("[data-edit]"), sm = e.target.closest("[data-statusmenu]");
    if (ob) {
      abrirObs("edit", +ob.dataset.obs);
    } else if (ed) abrirForm(+ed.dataset.edit); else if (sm) abrirMenuStatus(sm, +sm.dataset.statusmenu); else if (!e.target.closest("a,button")) {
      const tr = e.target.closest("tr[data-rowid]");
      if (tr) abrirFichaSub(+tr.dataset.rowid);
    }
  });
  document.querySelectorAll("#tabelaSubs thead th.sortable").forEach(th => {
    th.onclick = () => ordenarPorColuna(th.dataset.sort);
  });
  $("subPdfBtn").onclick = exportarFichaSubPDF;
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest(".overlay").classList.remove("show"));
  document.addEventListener("click", e => {
    if (!e.target.closest(".prod-field-sub")) {
      const box = $("prodSugestoes");
      if (box) box.style.display = "none";
    }
  });
  document.querySelectorAll(".overlay").forEach(o => {
    o.addEventListener("mousedown", e => {
      o.dataset.downOnOverlay = e.target === o ? "1" : "0";
    });
    o.addEventListener("click", e => {
      if (e.target === o && o.dataset.downOnOverlay === "1") o.classList.remove("show");
    });
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".overlay.show").forEach(o => o.classList.remove("show"));
  });
}

function initClock() {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const tick = () => {
    const el = $("tbClock");
    if (el) el.textContent = fmt.format(new Date);
  };
  tick();
  setInterval(tick, 1e3);
}

const MACEIO = {
  nome: "Maceió",
  lat: -9.6658,
  lon: -35.7353,
  tz: "America/Maceio"
};

function wmoDesc(c) {
  if (c === 0) return "céu limpo";
  if ([ 1, 2 ].includes(c)) return "parc. nublado";
  if (c === 3) return "nublado";
  if ([ 45, 48 ].includes(c)) return "neblina";
  if ([ 51, 53, 55, 56, 57 ].includes(c)) return "garoa";
  if ([ 61, 63, 65, 80, 81, 82 ].includes(c)) return "chuva";
  if ([ 66, 67 ].includes(c)) return "chuva gelada";
  if ([ 71, 73, 75, 77, 85, 86 ].includes(c)) return "neve";
  if ([ 95, 96, 99 ].includes(c)) return "tempestade";
  return "—";
}

async function initTicker() {
  const track = $("tickerTrack");
  if (!track) return;
  const url = `https://api.open-meteo.com/v1/forecast` + `?latitude=${MACEIO.lat}&longitude=${MACEIO.lon}` + `&current=temperature_2m,weather_code` + `&daily=weather_code,temperature_2m_max,temperature_2m_min` + `&forecast_days=7&timezone=${encodeURIComponent(MACEIO.tz)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    const itens = [];
    const tAgora = Math.round(d?.current?.temperature_2m ?? NaN);
    if (!Number.isNaN(tAgora)) itens.push(`<span class="tk-item"><span class="tk-city">${MACEIO.nome} agora</span><span class="tk-temp">${tAgora}°C</span> ${wmoDesc(d.current.weather_code)}</span>`);
    const dia = d?.daily;
    if (dia?.time?.length) {
      const fmt = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        timeZone: MACEIO.tz
      });
      dia.time.forEach((iso, i) => {
        if (i === 0) return;
        const dt = new Date(iso + "T12:00:00");
        const mx = Math.round(dia.temperature_2m_max[i]);
        const mn = Math.round(dia.temperature_2m_min[i]);
        const label = fmt.format(dt).replace(/^\w/, c => c.toUpperCase());
        itens.push(`<span class="tk-item"><span class="tk-city">${label}</span><span class="tk-temp">${mn}°/${mx}°</span> ${wmoDesc(dia.weather_code[i])}</span>`);
      });
    }
    const html = itens.join("");
    track.style.animation = "";
    track.innerHTML = html ? html + html : '<span class="tk-item">Clima indisponível</span>';
  } catch (e) {
    console.error("ticker clima:", e);
    track.innerHTML = '<span class="tk-item">Clima indisponível no momento</span>';
    track.style.animation = "none";
  }
}

(function init() {
  const cfgOk = CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes("SEU-PROJETO") && CONFIG.SUPABASE_KEY && !CONFIG.SUPABASE_KEY.includes("SUA_ANON_KEY");
  if (!cfgOk) {
    $("setupScreen").style.display = "block";
    return;
  }
  $("app").style.display = "flex";
  bind();
  $("tabs").style.display = "none";
  $("tabsCons").style.display = "flex";
  $("sidebar").style.display = "none";
  $("filtrosTop").appendChild($("filtrosWrap"));
  $("filtrosTop").style.display = "flex";
  switchTab("welcome");
  initClock();
  initTicker();
  setInterval(initTicker, 15 * 60 * 1e3);
  carregar();
  renderNotifPanel();
  verificarRespostas();
  setInterval(verificarRespostas, 2e4);
  restaurarSessao().then(resultado => {
    if (resultado) {
      state.gestorNome = resultado.nome;
      entrarGestor();
    }
  });
})();