const CONFIG = {
  SUPABASE_URL: "https://prospecta-proxy.cayonauta.workers.dev",
  TABLE: "substabelecidos",
  TABLE_EMPRESAS: "empresas_grupo",
  TABLE_BANCOS: "bancos",
  TABLE_BANCO_VINCULOS: "banco_vinculos",
  TABLE_HIST: "historico",
  TABLE_AGENDA: "agenda",
  TABLE_MENSAGENS: "mensagem",
  TABLE_PRODUCAO: "producao_mensal",
  TABLE_PRODUCAO_CONVENIO: "producao_convenio",
  TABLE_SUPERINTENDENTES: "superintendentes",
  TABLE_SUPERVISORES: "supervisores",
  TABLE_GERENTES: "gerentes_comerciais",
  VIEW_GERENTES_PUB: "gerentes_publicos",
  AUTH_EMAIL_DOMAIN: "prospecta.local",
  CONSULTOR_EMAIL: "consultor@prospecta.local",
  PAGE_SIZE: 25
};

const state = {
  acessoLiberado: false,
  acaoPendente: null,
  sessions: {
    gestor: null,
    consultor: null
  },
  _refreshTimers: {},
  _persist: {
    gestor: false,
    consultor: false
  },
  _ultimaAtividade: Date.now(),
  rows: [],
  empresas: [],
  superintendentes: [],
  supervisores: [],
  gerentes: [],
  colabCarregado: false,
  colabErro: null,
  colabExpandTudo: false,
  colabEdit: null,
  bancos: [],
  bancoVinculos: [],
  filtered: [],
  page: 1,
  filtrosVisiveis: false,
  gestor: false,
  // Papel "diretor": visão de leitura (painel, subs, pendentes, produção).
  // Nunca escreve — por isso fica separado de `gestor`, que continua sendo o
  // único gate de edição em toda a tela. Ver eh_diretor() no Supabase.
  diretor: false,
  gestorNome: null,
  session: null,
  editingId: null,
  editingBancoId: null,
  bancoVincEdit: [],
  bancoInfoId: null,
  delBancoId: null,
  editingEmpresaId: null,
  editingPassoId: null,
  obsMode: null,
  obsSubId: null,
  delSubId: null,
  obsPendingBody: null,
  hist: [],
  agenda: [],
  agendaRef: new Date,
  editingAgendaId: null,
  alertasVistos: false,
  painelFiltro: "TODOS",
  detalheStatus: "TODOS",
  sortCol: null,
  sortDir: 1,
  duvidas: [],
  duvidasCarregadas: false,
  editingDuvidaId: null
};

const H = () => ({
  // Sem sessão, cai no sentinela "Bearer " (vazio) que o Worker reconhece
  // e remove, virando chamada anônima limpa. NÃO trocar por outro valor:
  // "Bearer undefined"/"Bearer null" não batem com o sentinela e o Supabase
  // responde 401 "Expected 3 parts in JWT". O apikey real é injetado pelo Worker.
  Authorization: "Bearer " + ((state.sessions.gestor && state.sessions.gestor.access_token) || (state.sessions.consultor && state.sessions.consultor.access_token) || ""),
  "Content-Type": "application/json"
});

const REST = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE}`;

const REST_EMP = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_EMPRESAS}`;

const REST_BANCOS = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_BANCOS}`;
const REST_BANCO_VINCULOS = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_BANCO_VINCULOS}`;

const REST_HIST = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_HIST}`;

const REST_AGENDA = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_AGENDA}`;

const REST_PRODUCAO = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_PRODUCAO}`;

const REST_PRODUCAO_CONVENIO = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_PRODUCAO_CONVENIO}`;

const REST_MSG = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_MENSAGENS}`;

const REST_SUPERINTENDENTES = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_SUPERINTENDENTES}`;
const REST_SUPERVISORES = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_SUPERVISORES}`;
const REST_GERENTES = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.TABLE_GERENTES}`;

// View sem dados pessoais (só id/nome/hierarquia). O modo consulta lê daqui;
// a tabela real, com CPF, telefone e e-mail, é restrita ao gestor pela RLS.
const REST_GERENTES_PUB = () => `${CONFIG.SUPABASE_URL}/rest/v1/${CONFIG.VIEW_GERENTES_PUB}`;

const $ = id => document.getElementById(id);

const norm = v => (v == null ? "" : String(v)).trim();

const lower = v => norm(v).toLowerCase();

const maiusc = v => norm(v).toLocaleUpperCase("pt-BR");

// Resolução id -> registro/nome dos colaboradores (tabelas superintendentes /
// supervisores / gerentes_comerciais). O vínculo do sub é por id; o nome é
// sempre lido daqui, nunca mais de coluna de texto.
const superintendenteById = id => id != null ? state.superintendentes.find(s => s.id === +id) || null : null;
const supervisorById = id => id != null ? state.supervisores.find(s => s.id === +id) || null : null;
const gerenteById = id => id != null ? state.gerentes.find(g => g.id === +id) || null : null;
const nomeSuperintendente = id => {
  const s = superintendenteById(id);
  return s ? norm(s.nome) : "";
};
const nomeSupervisor = id => {
  const s = supervisorById(id);
  return s ? norm(s.nome) : "";
};
const nomeGerente = id => {
  const g = gerenteById(id);
  return g ? norm(g.nome) : "";
};

// Hierarquia EFETIVA do sub. Quando há gerente, ele é a fonte da verdade —
// assim, mover um gerente de supervisor na aba Colaboradores reflete na hora
// em todo o app, sem precisar atualizar linha nenhuma de substabelecidos.
// Sem gerente, usa o supervisor gravado (e o superintendente vem dele).
const supervisorDoSub = r => {
  const g = gerenteById(r.gerente_id);
  return g ? g.supervisor_id : r.supervisor_id;
};

const superintendenteDoSub = r => {
  const g = gerenteById(r.gerente_id);
  if (g) return g.superintendente_id;
  const sv = supervisorById(r.supervisor_id);
  return sv ? sv.superintendente_id : r.superintendente_id;
};

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

const NOME_UF = {
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins"
};

let brasilSvgCache = null;

async function carregarSvgBrasil() {
  if (brasilSvgCache) return brasilSvgCache;
  const res = await fetch("brasil-mapa.svg");
  brasilSvgCache = await res.text();
  return brasilSvgCache;
}

async function montarMapaBrasil(porUF) {
  const cont = $("mapaBrasil");
  if (!cont) return;
  let svgTxt;
  try {
    svgTxt = await carregarSvgBrasil();
  } catch (e) {
    console.error("mapa brasil:", e);
    cont.innerHTML = '<div class="dl-empty">Não foi possível carregar o mapa.</div>';
    return;
  }
  if ($("mapaBrasil") !== cont) return;
  cont.innerHTML = svgTxt;
  const svgEl = cont.querySelector("svg");
  if (!svgEl) return;
  const maxVal = Math.max(0, ...Object.keys(NOME_UF).map(uf => porUF[uf] || 0));
  Object.keys(NOME_UF).forEach(uf => {
    const el = svgEl.querySelector("#" + uf);
    if (!el) return;
    const n = porUF[uf] || 0;
    const lvl = n === 0 || maxVal === 0 ? 0 : Math.min(5, Math.ceil(n / maxVal * 5));
    el.classList.add("uf-shape", "lvl-" + lvl);
    el.setAttribute("data-det-tipo", "uf");
    el.setAttribute("data-det-valor", uf);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${NOME_UF[uf]} (${uf}) — ${n} sub${n === 1 ? "" : "s"}`;
    el.appendChild(title);
  });
}

const AUTH_URL = () => `${CONFIG.SUPABASE_URL}/auth/v1`;

const SESSION_KEYS = {
  gestor: "prospecta_session",
  consultor: "prospecta_session_consultor"
};

function loginParaEmail(login) {
  login = login.trim();
  return login.includes("@") ? login : `${login}@${CONFIG.AUTH_EMAIL_DOMAIN}`;
}

// Sessão "persistente" (checkbox "Manter conectado") vai para o localStorage e
// sobrevive ao fechar o navegador. Sessão temporária fica no sessionStorage:
// some ao fechar a aba e ainda expira por inatividade (ver INATIVIDADE_MS).
function salvarSessao(slot, session) {
  state.sessions[slot] = session;
  const alvo = state._persist[slot] ? localStorage : sessionStorage;
  const outro = state._persist[slot] ? sessionStorage : localStorage;
  try {
    alvo.setItem(SESSION_KEYS[slot], JSON.stringify(session));
    outro.removeItem(SESSION_KEYS[slot]);
  } catch (e) {}
  agendarRefreshSessao(slot);
  registrarAtividade();
}

function limparSessao(slot) {
  state.sessions[slot] = null;
  state._persist[slot] = false;
  try {
    sessionStorage.removeItem(SESSION_KEYS[slot]);
    localStorage.removeItem(SESSION_KEYS[slot]);
  } catch (e) {}
  if (state._refreshTimers[slot]) clearTimeout(state._refreshTimers[slot]);
}

// O papel vem do app_metadata, gravado no servidor — o usuário não edita.
// A tela só reflete o que a RLS já impõe; esconder aba não é a proteção.
//
// Menor privilégio: só role = 'gestor' abre a tela de gestor. Qualquer outro
// valor — inclusive papel ausente, como acontece em usuário recém-criado pela
// UI do Supabase — cai na visão de leitura da diretoria. Errar para o lado
// restritivo mostra pouco demais; errar para o outro dá escrita a quem não
// deveria ter.
function papelDoUsuario(user) {
  const r = user && user.app_metadata && user.app_metadata.role;
  return r === "gestor" ? "gestor" : "diretor";
}

async function authLogin(slot, login, senha, persistente) {
  state._persist[slot] = !!persistente;
  try {
    const res = await fetch(`${AUTH_URL()}/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: loginParaEmail(login),
        password: senha
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || `HTTP ${res.status}`);
    salvarSessao(slot, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1e3
    });
    const nome = data.user && data.user.user_metadata && data.user.user_metadata.nome || data.user && data.user.email && data.user.email.split("@")[0] || "Gestor(a)";
    return {
      nome: nome,
      papel: papelDoUsuario(data.user)
    };
  } catch (e) {
    console.error("authLogin:", e);
    return null;
  }
}

async function authRefresh(slot) {
  const sess = state.sessions[slot];
  if (!sess || !sess.refresh_token) return false;
  try {
    const res = await fetch(`${AUTH_URL()}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        refresh_token: sess.refresh_token
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || `HTTP ${res.status}`);
    salvarSessao(slot, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1e3
    });
    return true;
  } catch (e) {
    console.error("authRefresh:", slot, e);
    limparSessao(slot);
    if (slot === "gestor" && state.gestor) {
      toast("Sua sessão expirou. Faça login novamente.", "err");
      sairGestor();
    }
    if (slot === "consultor") state.acessoLiberado = false;
    return false;
  }
}

function agendarRefreshSessao(slot) {
  if (state._refreshTimers[slot]) clearTimeout(state._refreshTimers[slot]);
  const sess = state.sessions[slot];
  if (!sess) return;
  const ms = Math.max(sess.expires_at - Date.now() - 6e4, 5e3);
  state._refreshTimers[slot] = setTimeout(() => authRefresh(slot), ms);
}

// Logout automático por inatividade — só vale para a sessão do gestor quando
// ela NÃO é persistente ("Manter conectado" desmarcado). Sessões persistentes
// (localStorage) nunca expiram por inatividade.
const INATIVIDADE_MS = 20 * 60 * 1e3;

function sessaoGestorTemporaria() {
  return (state.gestor || state.diretor) && !state._persist.gestor;
}

function registrarAtividade() {
  state._ultimaAtividade = Date.now();
}

function checarInatividade() {
  if (sessaoGestorTemporaria() && Date.now() - state._ultimaAtividade > INATIVIDADE_MS) {
    sairGestor();
    toast("Sessão encerrada por inatividade. Faça login novamente.", "err");
  }
}

function iniciarMonitorInatividade() {
  [ "mousemove", "mousedown", "keydown", "scroll", "touchstart" ].forEach(ev => window.addEventListener(ev, registrarAtividade, {
    passive: true
  }));
  setInterval(checarInatividade, 3e4);
}

async function authLogout(slot) {
  const sess = state.sessions[slot];
  if (sess && sess.access_token) {
    try {
      await fetch(`${AUTH_URL()}/logout`, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + sess.access_token
        }
      });
    } catch (e) {
      console.error("authLogout:", e);
    }
  }
  limparSessao(slot);
}

async function restaurarSessao(slot) {
  let saved = null, persistente = false;
  try {
    const doLocal = localStorage.getItem(SESSION_KEYS[slot]);
    if (doLocal) {
      saved = JSON.parse(doLocal);
      persistente = true;
    } else {
      saved = JSON.parse(sessionStorage.getItem(SESSION_KEYS[slot]) || "null");
    }
  } catch (e) {}
  if (!saved) return null;
  state._persist[slot] = persistente;
  state.sessions[slot] = saved;
  if (saved.expires_at - Date.now() < 6e4) {
    const ok = await authRefresh(slot);
    if (!ok) return null;
  } else {
    agendarRefreshSessao(slot);
  }
  try {
    const res = await fetch(`${AUTH_URL()}/user`, {
      headers: {
        Authorization: "Bearer " + state.sessions[slot].access_token
      }
    });
    if (!res.ok) throw new Error("sessão inválida");
    const user = await res.json();
    return {
      nome: user.user_metadata && user.user_metadata.nome || (user.email || "").split("@")[0] || "Gestor(a)",
      papel: papelDoUsuario(user)
    };
  } catch (e) {
    limparSessao(slot);
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
  if (!state.sessions.gestor && !state.sessions.consultor) return;
  $("count").textContent = "carregando…";
  try {
    // Empresas do grupo e agenda são exclusivas do gestor: no modo consulta
    // a requisição nem é feita, para o dado não sair do servidor.
    const soGestor = f => state.gestor ? f() : Promise.resolve(null);
    const [resSubs, resEmp, resBancos, resAgenda, resBancoVinc] = await Promise.all([ fetch(`${REST()}?select=*&order=id.asc`, {
      headers: H()
    }), soGestor(() => fetch(`${REST_EMP()}?select=*&order=razao_social.asc`, {
      headers: H()
    })), fetch(`${REST_BANCOS()}?select=*&order=nome_banco.asc`, {
      headers: H()
    }), soGestor(() => fetch(`${REST_AGENDA()}?select=*&order=data.asc,hora.asc`, {
      headers: H()
    })), fetch(`${REST_BANCO_VINCULOS()}?select=id,banco_id,empresa_grupo_id,codigo_corban,tipo_sub,status&status=eq.ATIVO`, {
      headers: H()
    }) ]);
    if (!resSubs.ok) throw new Error(`subs HTTP ${resSubs.status} — ${await resSubs.text()}`);
    state.rows = await resSubs.json();
    if (!state.gestor) {
      state.empresas = [];
    } else if (resEmp && resEmp.ok) {
      state.empresas = await resEmp.json();
    } else if (resEmp) {
      console.warn("empresas_grupo:", resEmp.status, await resEmp.text());
      toast("Empresas do grupo não carregaram (RLS?).", "err");
    }
    if (resBancos.ok) {
      state.bancos = await resBancos.json();
    } else {
      console.warn("bancos:", resBancos.status, await resBancos.text());
    }
    if (!state.gestor) {
      state.agenda = [];
    } else if (resAgenda && resAgenda.ok) {
      state.agenda = await resAgenda.json();
      checarAlertas();
    } else if (resAgenda) {
      console.warn("agenda:", resAgenda.status, await resAgenda.text());
    }
    if (resBancoVinc.ok) {
      state.bancoVinculos = await resBancoVinc.json();
    } else {
      console.warn("banco_vinculos:", resBancoVinc.status, await resBancoVinc.text());
    }
    // Colaboradores (superintendentes/supervisores/gerentes) são necessários
    // para traduzir os ids em nomes na tabela, ficha e filtros — inclusive no
    // modo consulta. Carrega antes de montar os filtros.
    await carregarColaboradores();
    montarFiltros();
    aplicarFiltros();
    if (!state.gestor && $("viewBancosConsulta").style.display !== "none") renderBancosConsulta();
    atualizarKPIs();
    toast("Dados atualizados", "ok");
  } catch (e) {
    console.error(e);
    $("count").textContent = "erro ao carregar";
    toast("Falha ao carregar do Supabase. Veja o console (F12).", "err");
  }
}

// A empresa do sub deriva do banco: empresas_grupo -> banco_vinculos -> bancos.
// Um banco pode ter varias empresas credenciadas, por isso o select do
// formulario e' remontado a cada troca de banco.
function chaveNome(s) {
  return norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function bancoPorNome(nome) {
  const k = chaveNome(nome);
  return k ? state.bancos.find(b => chaveNome(b.nome_banco) === k) || null : null;
}

// Nome do banco do sub resolvido pela chave. Nao ha mais copia em texto: a
// coluna banco foi aposentada em 22/07/2026, depois que todo sub passou a ter
// banco_id.
function nomeBanco(r) {
  const b = r.banco_id ? state.bancos.find(x => x.id === r.banco_id) : null;
  return b ? norm(b.nome_banco) : "";
}

function empresasDoBanco(bancoId) {
  if (!bancoId) return [];
  const ids = state.bancoVinculos.filter(v => v.banco_id === bancoId).map(v => v.empresa_grupo_id);
  return state.empresas.filter(e => ids.includes(e.id)).sort((a, b) => norm(a.razao_social).localeCompare(norm(b.razao_social), "pt-BR"));
}

function empresaById(id) {
  return id ? state.empresas.find(e => e.id === +id) || null : null;
}

// desejado: id da empresa que deve vir selecionada (edicao). Quando o banco tem
// uma empresa so, ela e' escolhida sozinha — que e' o caso da maioria.
function montarRazaoSelect(desejado) {
  const sel = $("f_razao");
  if (!sel) return;
  const banco = bancoPorNome($("f_banco").value);
  const lista = banco ? empresasDoBanco(banco.id) : [];
  // Sem banco escolhido, ou banco sem vinculo, cai para a lista completa: e'
  // melhor deixar cadastrar do que travar o formulario.
  const semVinculo = !!banco && !lista.length;
  const fonte = lista.length ? lista : state.empresas.filter(e => norm(e.razao_social));
  sel.innerHTML = `<option value="">Selecione…</option>` + fonte.map(e => {
    const label = norm(e.fantasia) ? `${escapeHtml(e.razao_social)} — ${escapeHtml(e.fantasia)}` : escapeHtml(e.razao_social);
    return `<option value="${e.id}" data-cnpj="${escapeHtml(norm(e.cnpj))}">${label}</option>`;
  }).join("");
  const alvo = desejado && fonte.some(e => e.id === +desejado) ? String(desejado) : lista.length === 1 ? String(lista[0].id) : "";
  sel.value = alvo;
  const hint = $("razaoHint");
  if (hint) {
    if (!banco) hint.textContent = "Escolha o banco primeiro.";
    else if (semVinculo) hint.textContent = `${norm(banco.nome_banco)} não tem empresa vinculada — cadastre o vínculo na aba Bancos.`;
    else if (lista.length === 1) hint.textContent = "Preenchido pelo banco.";
    else hint.textContent = `${norm(banco.nome_banco)} opera por ${lista.length} empresas: escolha qual.`;
  }
  sincronizarCnpjGrupo();
}

function sincronizarCnpjGrupo() {
  const opt = $("f_razao").selectedOptions[0];
  $("f_cnpj").value = opt ? opt.dataset.cnpj || "" : "";
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
  // O filtro de banco é montado por montarFiltroBancos(), a partir do
  // resultado atual dos demais filtros — não da lista de bancos cadastrados.
  montarFiltroBancos();
  montarFiltroEmpresas();
  fill("fTipo", distintos("tipo_cadastro"));
  // Filtros de equipe agora por id (value=id, label=nome), lidos das tabelas novas
  montarFiltrosEquipe();
  preencherBancosForm();
}

// Só empresas do grupo, com a contagem de subs de cada uma. Exclusivo do
// gestor: no modo consulta a tabela de empresas nem é carregada.
function montarFiltroEmpresas() {
  const el = $("fEmpresa");
  if (!el) return;
  const atual = el.value;
  const reais = state.rows.filter(isReal);
  const conta = e => reais.filter(r => {
    const emp = empresaGrupoDe(r);
    return emp && emp.id === e.id;
  }).length;
  const ord = state.empresas.slice().sort((a, b) => norm(a.razao_social).localeCompare(norm(b.razao_social), "pt-BR"));
  el.innerHTML = '<option value="">Todas</option>' + ord.map(e => `<option value="${e.id}">${escapeHtml(norm(e.razao_social))} (${conta(e)})</option>`).join("");
  el.value = atual && ord.some(e => String(e.id) === atual) ? atual : "";
}

function fillPorId(sel, lista, desejado) {
  const el = $(sel);
  if (!el) return;
  const atual = desejado != null ? String(desejado) : el.value;
  const ord = lista.slice().sort((a, b) => norm(a.nome).localeCompare(norm(b.nome), "pt-BR"));
  el.innerHTML = '<option value="">Todos</option>' + ord.map(x => `<option value="${x.id}">${escapeHtml(norm(x.nome))}</option>`).join("");
  // Só mantém a seleção se ela ainda existir na lista filtrada; senão limpa.
  el.value = atual && ord.some(x => String(x.id) === atual) ? atual : "";
}

// Filtros de equipe encadeados: o superintendente restringe supervisores e
// gerentes; o supervisor restringe os gerentes. Aceita valores desejados para
// os casos em que a seleção é derivada (ex.: escolher um gerente já define o
// supervisor e o superintendente dele).
function montarFiltrosEquipe(desejado) {
  const d = desejado || {};
  const superSel = d.super !== undefined ? d.super : $("fSuper").value;
  const supvSel = d.supv !== undefined ? d.supv : $("fSupervisor").value;
  const gerSel = d.ger !== undefined ? d.ger : $("fGerente").value;
  fillPorId("fSuper", state.superintendentes, superSel);
  const svs = superSel ? state.supervisores.filter(s => String(s.superintendente_id) === String(superSel)) : state.supervisores;
  fillPorId("fSupervisor", svs, supvSel);
  let gs = state.gerentes;
  if (superSel) gs = gs.filter(g => String(g.superintendente_id) === String(superSel));
  if (supvSel) gs = gs.filter(g => String(g.supervisor_id) === String(supvSel));
  fillPorId("fGerente", gs, gerSel);
}

function preencherBancosForm() {
  const sel = $("f_banco");
  if (!sel) return;
  const atual = sel.value;
  const nomes = [ ...new Set(state.bancos.filter(b => norm(b.status).toUpperCase() !== "INATIVO").map(b => norm(b.nome_banco)).filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  sel.innerHTML = '<option value="">Selecione…</option>' + nomes.map(v => `<option>${escapeHtml(v)}</option>`).join("");
  if (atual && nomes.includes(atual)) sel.value = atual;
}

const ordNome = lista => lista.slice().sort((a, b) => norm(a.nome).localeCompare(norm(b.nome), "pt-BR"));

function montarFormSuperSel(sel) {
  const el = $("f_superintendente");
  el.innerHTML = '<option value="">Selecione…</option>' + ordNome(state.superintendentes).map(s => `<option value="${s.id}">${escapeHtml(norm(s.nome))}</option>`).join("");
  if (sel != null) el.value = String(sel);
}

function montarFormSupervSel(superId, sel) {
  const el = $("f_supervisor");
  const svs = ordNome(state.supervisores.filter(s => String(s.superintendente_id) === String(superId)));
  el.innerHTML = '<option value="">— (sem supervisor)</option>' + svs.map(s => `<option value="${s.id}">${escapeHtml(norm(s.nome))}</option>`).join("");
  if (sel != null) el.value = String(sel);
}

function montarFormGerenteSel(superId, sel) {
  const el = $("f_gerente");
  const gs = ordNome(state.gerentes.filter(g => String(g.superintendente_id) === String(superId)));
  el.innerHTML = '<option value="">— (sem gerente)</option>' + gs.map(g => `<option value="${g.id}">${escapeHtml(norm(g.nome))}</option>`).join("");
  if (sel != null) el.value = String(sel);
}

function aplicarToggleFiltros() {
  const oculto = !state.filtrosVisiveis;
  $("filtrosTop").classList.toggle("force-hide", oculto);
  $("toggleFiltrosBtn").textContent = oculto ? "Mostrar filtros" : "Esconder filtros";
}

// Todos os filtros MENOS o de banco. Serve para dois usos: filtrar a tabela
// (somando o banco) e montar a lista de bancos com o que sobra dos demais.
function passaFiltrosExcetoBanco(r) {
  const q = lower($("fBusca").value), st = $("fStatus").value, tipo = $("fTipo").value, sup = $("fSuper").value, supv = $("fSupervisor").value, ger = $("fGerente").value;
  const emp = $("fEmpresa") ? $("fEmpresa").value : "";
  // Empresa pela chave; subs antigos sem chave caem no CNPJ em texto.
  if (emp) {
    const e = empresaGrupoDe(r);
    if (!e || String(e.id) !== emp) return false;
  }
  if (st && norm(r.status).toUpperCase() !== st) return false;
  if (tipo && norm(r.tipo_cadastro) !== tipo) return false;
  if (sup && String(superintendenteDoSub(r)) !== sup) return false;
  if (supv && String(supervisorDoSub(r)) !== supv) return false;
  if (ger && String(r.gerente_id) !== ger) return false;
  if (q) {
    const blob = [ r.nome_subs, r.cnpj_subs, r.cod_loja_banco, r.cod_substabelecido, r.cod_parceiro, r.responsavel_empresa, nomeBanco(r) ].map(lower).join(" ");
    if (!blob.includes(q)) return false;
  }
  return true;
}

// A lista de bancos mostra só os que têm ao menos um sub no resultado atual.
// Com Status=Ativo, some banco que só tem sub inativo — assim nenhuma opção
// do filtro leva a zero resultados.
function montarFiltroBancos() {
  const el = $("fBanco");
  if (!el) return;
  const atual = el.value;
  const nomes = [ ...new Set(state.rows.filter(isReal).filter(passaFiltrosExcetoBanco).map(r => nomeBanco(r)).filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  el.innerHTML = '<option value="">Todos</option>' + nomes.map(v => `<option>${escapeHtml(v)}</option>`).join("");
  el.value = atual && nomes.includes(atual) ? atual : "";
}

function aplicarFiltros() {
  montarFiltroBancos();
  const banco = $("fBanco").value;
  state.aguardandoBanco = false;
  state.filtered = state.rows.filter(isReal).filter(r => {
    if (banco && nomeBanco(r) !== banco) return false;
    return passaFiltrosExcetoBanco(r);
  });
  ordenarFiltrados();
  state.page = 1;
  renderTabela();
  renderPendentes();
  atualizarBotaoLote();
}

const SORT_COLS = [ "nome_subs", "banco", "tipo_cadastro" ];

function ordenarFiltrados() {
  const col = state.sortCol;
  if (!col) return;
  const dir = state.sortDir;
  // O banco sai da chave, como no resto da tela; os demais campos são do sub.
  const valor = r => col === "banco" ? nomeBanco(r) : norm(r[col]);
  state.filtered.sort((a, b) => {
    const va = valor(a), vb = valor(b);
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

function linhaSubTr(r) {
  const stU = norm(r.status).toUpperCase();
  const badge = badgeStatus(stU);
  const acoes = state.gestor ? `<td><div class="rowact">\n        <button class="btn sm" data-edit="${r.id}">Editar</button>\n        <div class="status-menu-wrap">\n          <button class="btn sm" data-statusmenu="${r.id}">Alterar status</button>\n        </div>\n      </div></td>` : "";
  const nome = escapeHtml(norm(r.nome_subs) || "—");
  const nomeCell = state.gestor ? `<td class="empresa"><span class="linklike" data-obs="${r.id}" title="Observações">${nome}</span>${temObs(r) ? ' <span class="obs-dot" title="tem observação">●</span>' : ""}</td>` : `<td class="empresa">${nome}</td>`;
  return `<tr data-rowid="${r.id}" title="Ver ficha completa">\n      ${nomeCell}\n      <td class="mono">${escapeHtml(norm(r.cnpj_subs) || "—")}</td>\n      <td>${escapeHtml(nomeBanco(r) || "—")}</td>\n      <td>${escapeHtml(norm(r.tipo_cadastro) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(r.cod_loja_banco) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(r.cod_substabelecido) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(r.cod_parceiro) || "—")}</td>\n      <td>${badge}</td>\n      ${acoes}\n    </tr>`;
}

function renderTabela() {
  const {filtered: filtered, page: page} = state, size = CONFIG.PAGE_SIZE;
  const total = filtered.length, pages = Math.max(1, Math.ceil(total / size));
  state.page = Math.min(page, pages);
  const ini = (state.page - 1) * size, slice = filtered.slice(ini, ini + size);
  $("count").innerHTML = state.aguardandoBanco ? "—" : `<b>${total}</b> registro${total !== 1 ? "s" : ""}`;
  const es = $("emptyState");
  if (state.aguardandoBanco) {
    es.innerHTML = "<b>Selecione um banco ou busque um nome</b>Escolha um banco no filtro ao lado, ou digite algo no campo de busca, pra exibir a lista de substabelecidos.";
    es.style.display = "block";
  } else {
    es.innerHTML = "<b>Nada encontrado</b>Ajuste os filtros ou limpe a busca.";
    es.style.display = total ? "none" : "block";
  }
  const tb = $("tbody");
  tb.innerHTML = slice.map(linhaSubTr).join("");
  $("pageInfo").textContent = total ? `Página ${state.page} de ${pages} · exibindo ${slice.length}` : "";
  $("prevBtn").disabled = state.page <= 1;
  $("nextBtn").disabled = state.page >= pages;
}

function renderPendentes() {
  const q = lower($("fBuscaPendentes").value);
  $("thAcoesPendentes").style.display = state.gestor ? "" : "none";
  let list = state.rows.filter(isReal).filter(r => [ "PENDENTE", "EM_ANDAMENTO" ].includes(norm(r.status).toUpperCase()));
  if (q) {
    list = list.filter(r => {
      const blob = [ r.nome_subs, r.cnpj_subs, r.cod_loja_banco, r.cod_substabelecido, r.cod_parceiro, r.responsavel_empresa, nomeBanco(r) ].map(lower).join(" ");
      return blob.includes(q);
    });
  }
  list = [ ...list ].sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
  $("countPendentes").innerHTML = `<b>${list.length}</b> registro${list.length !== 1 ? "s" : ""}`;
  $("tbodyPendentes").innerHTML = list.map(linhaSubTr).join("");
  $("emptyPendentes").style.display = list.length ? "none" : "block";
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
  const inner = `<div class="painel-card-title">${titulo}</div>\n    <div class="donut-wrap${opts.wide ? " wide" : ""}">\n      <div class="donut${opts.wide ? " lg" : ""} reveal" style="background:conic-gradient(${stops || "var(--line) 0 100%"})">\n        <div class="donut-hole"><b>${total}</b><span>total</span></div>\n      </div>\n      <div class="donut-legend${opts.wide ? " wide" : ""}">${legend || '<div class="dl-empty">Sem dados</div>'}</div>\n    </div>`;
  if (opts.bare) return inner;
  return `<div class="painel-card${opts.wide ? " wide" : ""}">\n    ${inner}\n  </div>`;
}

const REGIOES_ORDEM = [ "Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul" ];

function buildRadarCard(titulo, obj, opts) {
  opts = opts || {};
  const eixos = REGIOES_ORDEM.map(reg => [ reg, obj[reg] || 0 ]);
  const total = eixos.reduce((s, [, n]) => s + n, 0);
  const max = Math.max(1, ...eixos.map(([, n]) => n));
  const W = 300, H = 260, cx = W / 2, cy = H / 2 + 6, R = 84;
  const ponto = (i, escala) => {
    const ang = -Math.PI / 2 + i * 2 * Math.PI / eixos.length;
    return [ cx + Math.cos(ang) * R * escala, cy + Math.sin(ang) * R * escala ];
  };
  const aneis = [ .25, .5, .75, 1 ].map(f => {
    const pts = eixos.map((_, i) => ponto(i, f).map(v => v.toFixed(1)).join(",")).join(" ");
    return `<polygon class="rd-grid" points="${pts}"></polygon>`;
  }).join("");
  const raios = eixos.map((_, i) => {
    const [ x, y ] = ponto(i, 1);
    return `<line class="rd-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const areaPts = eixos.map(([, n], i) => ponto(i, n / max).map(v => v.toFixed(1)).join(",")).join(" ");
  const marcas = eixos.map(([reg, n], i) => {
    const [ x, y ] = ponto(i, n / max);
    const det = opts.det ? ` data-det-tipo="${opts.det}" data-det-valor="${escapeHtml(reg)}"` : "";
    return `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"${det}><title>${escapeHtml(reg)} — ${n} sub${n === 1 ? "" : "s"}</title></circle>`;
  }).join("");
  const rotulos = eixos.map(([reg, n], i) => {
    const [ x, y ] = ponto(i, 1.2);
    const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
    const det = opts.det ? ` data-det-tipo="${opts.det}" data-det-valor="${escapeHtml(reg)}"` : "";
    return `<text class="rd-lab${opts.det ? " rd-click" : ""}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle"${det}>${escapeHtml(reg)} <tspan class="rd-num">${n}</tspan></text>`;
  }).join("");
  const inner = `<div class="painel-card-title">${titulo}</div>\n    <div class="radar-wrap">\n      <svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(titulo)}">\n        ${aneis}\n        ${raios}\n        <polygon class="rd-area" points="${areaPts}"></polygon>\n        ${marcas}\n        ${rotulos}\n      </svg>\n      <div class="radar-total"><b>${total}</b><span>total de subs</span></div>\n    </div>`;
  if (opts.bare) return inner;
  return `<div class="painel-card${opts.wide ? " wide" : ""}">\n    ${inner}\n  </div>`;
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
  const incompFn = r => !r.gerente_id || !norm(r.status) || !norm(r.cod_substabelecido) && !norm(r.cod_loja_banco);
  const incompletos = reais.filter(incompFn);
  const filtro = state.painelFiltro || "TODOS";
  let base = reais;
  if (filtro === "ATIVO") base = ativos; else if (filtro === "INATIVO") base = inativos; else if (filtro === "PENDENTE") base = pendentes; else if (filtro === "EM_ANDAMENTO") base = andamento; else if (filtro === "INCOMPLETO") base = incompletos;
  const porBanco = contarPor(base, r => nomeBanco(r), "Sem banco");
  const porUF = {}, porRegiao = {};
  base.forEach(r => {
    const uf = ufDoSub(r);
    if (uf) {
      porUF[uf] = (porUF[uf] || 0) + 1;
      porRegiao[UF_REGIAO[uf]] = (porRegiao[UF_REGIAO[uf]] || 0) + 1;
    } else porUF["Não identificado"] = (porUF["Não identificado"] || 0) + 1;
  });
  const kpi = (label, val, key, colorClass, sub) => `<div class="kpi kpi-click ${filtro === key ? "active" : ""}" data-filtro="${key}">\n    <div class="k-label">${label}</div><div class="k-val ${colorClass || ""}">${val}</div>${sub ? `<div class="k-sub">${sub}</div>` : ""}\n  </div>`;
  // KPIs informativos (sem filtro por clique), herdados da antiga faixa da aba Subs.
  const kpiInfo = (label, val, sub) => `<div class="kpi">\n    <div class="k-label">${label}</div><div class="k-val">${val}</div><div class="k-sub">${sub}</div>\n  </div>`;
  const pctAtivos = reais.length ? Math.round(ativos.length / reais.length * 100) : 0;
  const bancosAtivos = new Set(ativos.map(r => nomeBanco(r)).filter(Boolean));
  const gerentes = new Set(ativos.map(r => r.gerente_id).filter(x => x != null));
  $("viewPainel").innerHTML = `\n    <section class="kpis">\n      ${kpi("Total de cadastros", reais.length, "TODOS")}\n      ${kpi("Ativos", ativos.length, "ATIVO", "cyan", `${pctAtivos}% do total`)}\n      ${kpi("Pendentes", pendentes.length, "PENDENTE")}\n      ${kpi("Em andamento", andamento.length, "EM_ANDAMENTO")}\n      ${kpi("Inativos", inativos.length, "INATIVO", "red")}\n      ${kpi("Incompletos", incompletos.length, "INCOMPLETO")}\n      ${kpiInfo("Bancos ativos", bancosAtivos.size, "com ao menos 1 sub")}\n      ${kpiInfo("Gerentes", gerentes.size, "carteiras distintas")}\n    </section>\n    <div class="painel-grid">\n      <div class="painel-card wide painel-split-card">\n        <div class="painel-split">\n          <div class="painel-split-col">\n            <div class="painel-card-title">Mapa do Brasil <span class="painel-mapa-hint">clique em um estado para ver os subs</span></div>\n            <div id="mapaBrasil" class="mapa-brasil"></div>\n          </div>\n          <div class="painel-split-col">\n            ${buildRadarCard("Por região (UF do Cód. sub)", porRegiao, {
    det: "regiao",
    bare: true
  })}\n          </div>\n        </div>\n      </div>\n      ${buildTowerCard("Por banco", porBanco, {
    limite: 10,
    det: "banco"
  })}\n      ${buildTowerCard("Por UF", porUF, {
    colorful: true,
    limite: 14,
    det: "uf"
  })}\n    </div>`;
  montarMapaBrasil(porUF);
}

// Predicado dos filtros do painel — os mesmos usados pelos KPIs e pelas barras
// de status dos modais de detalhe.
function filtroPainel(f) {
  if (f === "INCOMPLETO") return r => !r.gerente_id || !norm(r.status) || !norm(r.cod_substabelecido) && !norm(r.cod_loja_banco);
  if (f && f !== "TODOS") return r => norm(r.status).toUpperCase() === f;
  return () => true;
}

function painelBase() {
  return state.rows.filter(isReal).filter(filtroPainel(state.painelFiltro || "TODOS"));
}

const DETALHE_STATUS = [ [ "TODOS", "Total" ], [ "ATIVO", "Ativos" ], [ "PENDENTE", "Pendentes" ], [ "EM_ANDAMENTO", "Em andamento" ], [ "INATIVO", "Inativos" ], [ "INCOMPLETO", "Incompletos" ] ];

// Base dos modais de detalhe: ignora o filtro dos KPIs e usa o da barra própria
// do modal (que abre já sincronizada com ele), para os dois não se anularem.
function detalheBase() {
  return state.rows.filter(isReal).filter(filtroPainel(state.detalheStatus || "TODOS"));
}

function barraStatusDetalhe() {
  const atual = state.detalheStatus || "TODOS";
  return `<div class="det-status">\n    ${DETALHE_STATUS.map(([ k, lab ]) => `<button class="det-toggle-btn ${atual === k ? "active" : ""}" data-det-status="${k}">${lab}</button>`).join("")}\n  </div>`;
}

function renderDetalheBanco(valor) {
  const base = detalheBase();
  const badgeDe = r => badgeStatus(norm(r.status).toUpperCase());
  const subs = base.filter(r => (nomeBanco(r) || "Sem banco") === valor).sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
  const ativos = subs.filter(r => norm(r.status).toUpperCase() === "ATIVO").length;
  $("detalheKicker").textContent = "Banco";
  $("detalheTitle").textContent = valor;
  $("detalheBody").innerHTML = `\n      <div class="det-resumo">\n        <div class="det-kpi"><b>${subs.length}</b><span>sub${subs.length !== 1 ? "s" : ""}</span></div>\n        <div class="det-kpi"><b class="ok">${ativos}</b><span>ativos</span></div>\n        <div class="det-kpi"><b class="off">${subs.length - ativos}</b><span>demais</span></div>\n      </div>\n      <div class="det-sec det-sec-toggle">Substabelecidos deste banco</div>\n      ${barraStatusDetalhe()}\n      <div class="det-list">\n        ${subs.map(r => `\n          <div class="det-item" data-rowid="${r.id}" title="Ver ficha completa">\n            <div class="det-main">\n              <span class="det-nome">${escapeHtml(norm(r.nome_subs) || "—")}</span>\n              ${badgeDe(r)}\n            </div>\n            <div class="det-meta">\n              <span>CNPJ <b>${escapeHtml(norm(r.cnpj_subs) || "—")}</b></span>\n              <span>Tipo <b>${escapeHtml(norm(r.tipo_cadastro) || "—")}</b></span>\n              <span>Cód. sub <b>${escapeHtml(norm(r.cod_substabelecido) || "—")}</b></span>\n              <span>Gerente <b>${escapeHtml(norm(r.gerente) || "—")}</b></span>\n            </div>\n          </div>`).join("") || '<div class="dl-empty">Nenhum substabelecido neste filtro.</div>'}\n      </div>`;
}

function renderDetalheUf(valor) {
  const base = detalheBase();
  const badgeDe = r => badgeStatus(norm(r.status).toUpperCase());
  const subs = valor === "Não identificado" ? base.filter(r => !ufDoSub(r)) : base.filter(r => ufDoSub(r) === valor);
  const porBanco = {};
  subs.forEach(r => {
    const b = nomeBanco(r) || "Sem banco";
    porBanco[b] = (porBanco[b] || 0) + 1;
  });
  const entries = Object.entries(porBanco).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  const view = state.ufDetalheView || "bancos";
  $("detalheKicker").textContent = "Unidade federativa";
  $("detalheTitle").textContent = valor === "Não identificado" ? "UF não identificada" : valor + (UF_REGIAO[valor] ? ` · ${UF_REGIAO[valor]}` : "");
  const bancosBlock = `<div class="k-bars det-bars">\n    ${entries.map(([b, n]) => `<div class="k-bar">\n      <span class="n" title="${escapeHtml(b)}">${escapeHtml(b)}</span>\n      <span class="track"><span class="fill" style="width:${Math.round(n / max * 100)}%"></span></span>\n      <span class="v">${n}</span></div>`).join("") || '<div class="dl-empty">Sem dados.</div>'}\n  </div>`;
  const subsBlock = `<div class="det-list">\n    ${subs.slice().sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR")).map(r => `\n      <div class="det-item" data-rowid="${r.id}" title="Ver ficha completa">\n        <div class="det-main">\n          <span class="det-nome">${escapeHtml(norm(r.nome_subs) || "—")}</span>\n          ${badgeDe(r)}\n        </div>\n        <div class="det-meta">\n          <span>Banco <b>${escapeHtml(nomeBanco(r) || "—")}</b></span>\n          <span>Cód. sub <b>${escapeHtml(norm(r.cod_substabelecido) || "—")}</b></span>\n          <span>Gerente <b>${escapeHtml(norm(r.gerente) || "—")}</b></span>\n        </div>\n      </div>`).join("") || '<div class="dl-empty">Nenhum substabelecido neste filtro.</div>'}\n  </div>`;
  $("detalheBody").innerHTML = `\n    <div class="det-resumo">\n      <div class="det-kpi"><b>${subs.length}</b><span>sub${subs.length !== 1 ? "s" : ""} na UF</span></div>\n      <div class="det-kpi"><b>${entries.length}</b><span>banco${entries.length !== 1 ? "s" : ""}</span></div>\n    </div>\n    <div class="det-sec det-sec-toggle">\n      <span class="det-toggle" id="ufDetalheToggle">\n        <button class="det-toggle-btn ${view === "bancos" ? "active" : ""}" data-uf-view="bancos">Bancos com mais subs nesta UF</button>\n        <button class="det-toggle-btn ${view === "subs" ? "active" : ""}" data-uf-view="subs">Subs dessa UF</button>\n      </span>\n    </div>\n    ${barraStatusDetalhe()}\n    ${view === "subs" ? subsBlock : bancosBlock}`;
}

function abrirDetalhePainel(tipo, valor) {
  const base = painelBase();
  state.detalheAtual = {
    tipo: tipo,
    valor: valor
  };
  // A barra de status do modal abre alinhada com o KPI selecionado no painel;
  // daí em diante ela manda sozinha, sem depender do filtro de fora.
  state.detalheStatus = state.painelFiltro || "TODOS";
  const badgeDe = r => badgeStatus(norm(r.status).toUpperCase());
  if (tipo === "banco") {
    renderDetalheBanco(valor);
  } else if (tipo === "uf") {
    state.ufDetalheView = "bancos";
    renderDetalheUf(valor);
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
    $("detalheBody").innerHTML = `\n      <div class="det-resumo">\n        <div class="det-kpi"><b>${subs.length}</b><span>sub${subs.length !== 1 ? "s" : ""} na região</span></div>\n        <div class="det-kpi"><b>${entriesUF.length}</b><span>estado${entriesUF.length !== 1 ? "s" : ""}</span></div>\n      </div>\n      <div class="det-sec">Estados dentro de ${escapeHtml(valor)}</div>\n      <div class="k-bars det-bars">\n        ${entriesUF.map(([uf, n]) => `<div class="k-bar">\n          <span class="n" title="${escapeHtml(uf)}">${escapeHtml(uf)}</span>\n          <span class="track"><span class="fill" style="width:${Math.round(n / maxUF * 100)}%"></span></span>\n          <span class="v">${n}</span></div>`).join("") || '<div class="dl-empty">Sem dados.</div>'}\n      </div>\n      <div class="det-sec">Substabelecidos da região</div>\n      <div class="det-list">\n        ${subs.map(r => `\n          <div class="det-item" data-rowid="${r.id}" title="Ver ficha completa">\n            <div class="det-main">\n              <span class="det-nome">${escapeHtml(norm(r.nome_subs) || "—")}</span>\n              ${badgeDe(r)}\n            </div>\n            <div class="det-meta">\n              <span>UF <b>${escapeHtml(ufDoSub(r) || "—")}</b></span>\n              <span>Banco <b>${escapeHtml(nomeBanco(r) || "—")}</b></span>\n              <span>Cód. sub <b>${escapeHtml(norm(r.cod_substabelecido) || "—")}</b></span>\n              <span>Gerente <b>${escapeHtml(norm(r.gerente) || "—")}</b></span>\n            </div>\n          </div>`).join("") || '<div class="dl-empty">Nenhum substabelecido.</div>'}\n      </div>`;
  } else return;
  $("detalheOverlay").classList.add("show");
}

// Empresa do sub pela chave, como em nomeBanco(): renomear a empresa reflete
// na hora, sem copia em texto para sair de sincronia.
function empresaGrupoDe(r) {
  return r.empresa_grupo_id ? empresaById(r.empresa_grupo_id) : null;
}

// Razao social e CNPJ ja resolvidos, para uso direto nas telas.
function razaoEmpresaDoSub(r) {
  const e = empresaGrupoDe(r);
  return e ? norm(e.razao_social) : "";
}

function cnpjEmpresaDoSub(r) {
  const e = empresaGrupoDe(r);
  return e ? norm(e.cnpj) : "";
}

function camposFichaSub(r) {
  const emp = empresaGrupoDe(r);
  const uf = ufDoSub(r);
  return {
    identificacao: [ [ "Nome do sub", norm(r.nome_subs) ], [ "CNPJ do sub", norm(r.cnpj_subs) ], [ "Empresa do grupo (razão)", razaoEmpresaDoSub(r) ], [ "CNPJ do grupo", cnpjEmpresaDoSub(r) ] ],
    vinculo: [ [ "Banco", nomeBanco(r) ], [ "Tipo de cadastro", norm(r.tipo_cadastro) ], [ "Cód. loja banco", norm(r.cod_loja_banco) ], [ "Cód. substabelecido", norm(r.cod_substabelecido) ], [ "Cód. parceiro", norm(r.cod_parceiro) ], [ "UF / Região", uf ? `${uf} · ${UF_REGIAO[uf]}` : "" ] ],
    gestao: [ [ "Responsável (empresa)", norm(r.responsavel_empresa) ], [ "Superintendente", nomeSuperintendente(superintendenteDoSub(r)) ], [ "Supervisor", nomeSupervisor(supervisorDoSub(r)) ], [ "Gerente", nomeGerente(r.gerente_id) ], [ "Comissão", norm(r.comissao) ], [ "Status", (STATUS_SUB[norm(r.status).toUpperCase()] || {}).label || norm(r.status) ] ]
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
  }).classe}">${escapeHtml((STATUS_SUB[stU] || {}).label || "—")}</b><span>status</span></div>\n      <div class="det-kpi sub-box"><b>${escapeHtml(nomeBanco(r) || "—")}</b><span>banco</span></div>\n      <div class="det-kpi sub-box"><b>${uf || "—"}</b><span>UF</span></div>\n      <div class="det-kpi sub-box"><b>${obs.length}</b><span>observaç${obs.length === 1 ? "ão" : "ões"}</span></div>\n    </div>\n\n    <div class="det-sec">Identificação</div>\n    ${grid(campos.identificacao)}\n\n    <div class="det-sec">Vínculo bancário</div>\n    ${grid(campos.vinculo)}\n\n    <div class="det-sec">Gestão comercial</div>\n    ${grid(campos.gestao)}\n\n    ${obs.length ? `\n      <div class="det-sec">Observações</div>\n      <div class="sub-obs-list">\n        ${obs.map(b => `<div class="obs-block">\n          <div class="obs-head">\n            <span class="obs-quem">${escapeHtml(norm(b.quem) || "—")}</span>\n            <span class="obs-quando">${escapeHtml(b.em ? fmtData(b.em) : "")}</span>\n          </div>\n          <div class="obs-text">${escapeHtml(norm(b.texto))}</div>\n        </div>`).join("")}\n      </div>` : ""}\n  `;
  $("subDelBtn").style.display = state.gestor ? "" : "none";
  $("subOverlay").classList.add("show");
}

const FRASE_EXCLUSAO = "confirmar exclusão";

function abrirConfirmExclusaoSub() {
  const r = state.rows.find(x => x.id === state.fichaSubId);
  if (!r || !state.gestor) return;
  state.delSubId = r.id;
  $("delSubNome").textContent = norm(r.nome_subs) || "sem nome";
  $("delSubInput").value = "";
  $("delSubConfirm").disabled = true;
  $("delSubOverlay").classList.add("show");
  $("delSubInput").focus();
}

function validarFraseExclusao() {
  const ok = lower($("delSubInput").value) === FRASE_EXCLUSAO;
  $("delSubConfirm").disabled = !ok;
  return ok;
}

// Apaga o sub de vez: primeiro os anexos (storage + tabela), depois a linha.
// Sem isso, as linhas de substabelecido_arquivos ficariam órfãs e os arquivos
// no bucket, sem dono.
async function excluirSubDefinitivo() {
  const id = state.delSubId;
  if (!id || !state.gestor || !validarFraseExclusao()) return;
  const r = state.rows.find(x => x.id === id);
  if (!r) return;
  const btn = $("delSubConfirm");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> Excluindo…';
  try {
    const resArq = await fetch(`${REST_SUB_ARQ()}?substabelecido_id=eq.${id}&select=id,path`, {
      headers: H()
    });
    if (!resArq.ok) throw new Error(`anexos HTTP ${resArq.status} — ${await resArq.text()}`);
    const anexos = await resArq.json();
    if (anexos.length) {
      const { "Content-Type": _ct, ...delHeaders } = H();
      for (const a of anexos) {
        const del = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ_SUB}/${a.path}`, {
          method: "DELETE",
          headers: delHeaders
        });
        if (!del.ok && del.status !== 404) throw new Error(`Storage HTTP ${del.status} — ${await del.text()}`);
      }
      const delRows = await fetch(`${REST_SUB_ARQ()}?substabelecido_id=eq.${id}`, {
        method: "DELETE",
        headers: H()
      });
      if (!delRows.ok) throw new Error(`anexos HTTP ${delRows.status} — ${await delRows.text()}`);
    }
    const res = await fetch(`${REST()}?id=eq.${id}`, {
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
    state.rows = state.rows.filter(x => x.id !== id);
    state.delSubId = null;
    state.fichaSubId = null;
    $("delSubOverlay").classList.remove("show");
    $("subOverlay").classList.remove("show");
    montarFiltros();
    aplicarFiltros();
    renderPendentes();
    atualizarKPIs();
    logHist("excluiu_sub", "substabelecidos", id, `Excluiu definitivamente o sub ${norm(r.nome_subs)} (${nomeBanco(r)})`);
    toast("Substabelecido excluído definitivamente", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao excluir: " + e.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
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

// Descreve os filtros ativos, para o PDF dizer de onde veio o recorte.
function filtrosAtivosDescricao() {
  const p = [];
  const emp = $("fEmpresa") && $("fEmpresa").value ? empresaById($("fEmpresa").value) : null;
  if (emp) p.push(`Empresa: ${norm(emp.razao_social)} (${norm(emp.cnpj)})`);
  if ($("fBanco").value) p.push(`Banco: ${$("fBanco").value}`);
  const st = $("fStatus").value;
  if (st) p.push(`Status: ${(STATUS_SUB[st] || {}).label || st}`);
  if ($("fTipo").value) p.push(`Tipo: ${$("fTipo").value}`);
  const sup = $("fSuper").value, supv = $("fSupervisor").value, ger = $("fGerente").value;
  if (sup) p.push(`Superintendente: ${nomeSuperintendente(+sup)}`);
  if (supv) p.push(`Supervisor: ${nomeSupervisor(+supv)}`);
  if (ger) p.push(`Gerente: ${nomeGerente(+ger)}`);
  if ($("fBusca").value.trim()) p.push(`Busca: "${$("fBusca").value.trim()}"`);
  return p;
}

// Exporta a tabela como ela esta na tela: mesmo recorte, mesma ordenacao.
async function exportarTabelaSubsPDF() {
  const linhas = state.filtered.slice();
  if (!linhas.length) {
    toast("Nada para exportar com os filtros atuais.", "err");
    return;
  }
  const btn = $("tabelaPdfBtn");
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Gerando…';
  try {
    await loadPdfLibs();
    const { jsPDF: jsPDF } = window.jspdf;
    // Paisagem: sao muitas colunas para caber em retrato sem apertar.
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const W = doc.internal.pageSize.getWidth();
    const NAVY = [ 15, 31, 56 ], BLUE = [ 26, 86, 196 ], LINE = [ 200, 212, 229 ], TXT = [ 18, 33, 53 ], MUT = [ 84, 104, 127 ], VERDE = [ 14, 138, 95 ], VERM = [ 201, 58, 63 ];
    const agora = (new Date).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    const filtros = filtrosAtivosDescricao();
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 24, "F");
    doc.setFillColor(...BLUE);
    doc.rect(0, 24, W, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Prospecta", 14, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(154, 171, 201);
    doc.text("G E S T Ã O   D E   S U B S T A B E L E C I D O S", 14, 16.5);
    doc.setFontSize(8);
    doc.text("Gerado em " + agora, W - 14, 11, { align: "right" });
    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("RELATÓRIO · SUBSTABELECIDOS", 14, 34);
    doc.setTextColor(...TXT);
    doc.setFontSize(16);
    doc.text(`${linhas.length} substabelecido${linhas.length !== 1 ? "s" : ""}`, 14, 42);
    let y = 47;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUT);
    if (filtros.length) {
      const txt = doc.splitTextToSize("Filtros aplicados — " + filtros.join(" · "), W - 28);
      doc.text(txt, 14, y);
      y += txt.length * 4;
    } else {
      doc.text("Sem filtros — todos os cadastros.", 14, y);
      y += 4;
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(.4);
    doc.line(14, y + 1, W - 14, y + 1);
    const nAtivos = linhas.filter(r => norm(r.status).toUpperCase() === "ATIVO").length;
    doc.autoTable({
      startY: y + 6,
      head: [ [ "Substabelecido", "CNPJ", "Empresa do grupo", "Banco", "Tipo", "Cód. sub", "Gerente", "Status" ] ],
      body: linhas.map(r => {
        return [
          norm(r.nome_subs) || "—",
          norm(r.cnpj_subs) || "—",
          razaoEmpresaDoSub(r) || "—",
          nomeBanco(r) || "—",
          norm(r.tipo_cadastro) || "—",
          norm(r.cod_substabelecido) || "—",
          nomeGerente(r.gerente_id) || "—",
          (STATUS_SUB[norm(r.status).toUpperCase()] || {}).label || "—"
        ];
      }),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.6, textColor: TXT, lineColor: LINE, lineWidth: .2, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: [ 255, 255, 255 ], fontSize: 7.2, fontStyle: "bold", cellPadding: 2.4 },
      alternateRowStyles: { fillColor: [ 249, 251, 254 ] },
      columnStyles: { 1: { cellWidth: 32 }, 4: { cellWidth: 26 }, 5: { cellWidth: 22 }, 7: { cellWidth: 22 } },
      margin: { left: 14, right: 14, top: 16 },
      didParseCell: d => {
        if (d.section === "body" && d.column.index === 7) {
          const v = lower(d.cell.raw);
          if (v === "ativo") d.cell.styles.textColor = VERDE;
          else if (v === "inativo") d.cell.styles.textColor = VERM;
        }
      },
      didDrawPage: () => {
        const p = doc.internal.getNumberOfPages();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MUT);
        doc.text(`Página ${p}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        doc.text(`${nAtivos} ativo(s) de ${linhas.length}`, 14, doc.internal.pageSize.getHeight() - 8);
      }
    });
    const empSel = $("fEmpresa") && $("fEmpresa").value ? empresaById($("fEmpresa").value) : null;
    const sufixo = empSel ? "-" + soDigitos(empSel.cnpj) : "";
    doc.save(`substabelecidos${sufixo}-${(new Date).toISOString().slice(0, 10)}.pdf`);
    toast("PDF gerado com sucesso", "ok");
  } catch (err) {
    console.error(err);
    toast("Erro ao gerar PDF: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

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
      INCOMPLETO: "Somente incompletos"
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
      const subs = base.filter(r => (nomeBanco(r) || "Sem banco") === det.valor).sort((a, b) => norm(a.nome_subs).localeCompare(norm(b.nome_subs), "pt-BR"));
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
        body: subs.map((r, i) => [ i + 1, norm(r.nome_subs) || "—", norm(r.cnpj_subs) || "—", norm(r.tipo_cadastro) || "—", norm(r.cod_substabelecido) || "—", nomeGerente(r.gerente_id) || "—", norm(r.status).toUpperCase() || "—" ]),
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
        const b = nomeBanco(r) || "Sem banco";
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
        body: subs.map((r, i) => [ i + 1, norm(r.nome_subs) || "—", ufDoSub(r) || "—", nomeBanco(r) || "—", norm(r.status).toUpperCase() || "—" ]),
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

// Os KPIs vivem no Painel Sintético. Depois de mexer nos dados basta redesenhar
// o painel quando ele estiver à vista — em outra aba, o switchTab já o refaz.
function atualizarKPIs() {
  if ((state.gestor || state.diretor) && $("viewPainel").style.display !== "none") renderPainel();
}

// ---------- Definir empresa em lote ----------
// Serve para bancos que operam por varias empresas (o C6 BANK tem 3): a
// migracao nao tem como adivinhar qual, entao a escolha e' feita aqui, em
// bloco, sobre o resultado filtrado na tela.
function subsDoLote() {
  return state.filtered.filter(r => isReal(r) && !r.empresa_grupo_id);
}

function atualizarBotaoLote() {
  const btn = $("loteEmpresaBtn");
  if (!btn) return;
  const n = state.gestor ? subsDoLote().length : 0;
  btn.style.display = n ? "" : "none";
  btn.textContent = `Definir empresa em lote (${n})`;
}

function abrirLoteEmpresa() {
  const alvos = subsDoLote();
  if (!alvos.length) return;
  // Se o filtro atual isolou um banco so, oferece apenas as empresas dele.
  const bancosAlvo = [ ...new Set(alvos.map(r => chaveNome(nomeBanco(r)))) ];
  const banco = bancosAlvo.length === 1 ? bancoPorNome(nomeBanco(alvos[0])) : null;
  const lista = banco ? empresasDoBanco(banco.id) : [];
  const fonte = lista.length ? lista : state.empresas;
  $("loteResumo").innerHTML = `Serão alterados <b>${alvos.length}</b> substabelecido${alvos.length !== 1 ? "s" : ""} sem empresa, do resultado filtrado atual.` + (bancosAlvo.length > 1 ? ` <b>Atenção:</b> o filtro inclui ${bancosAlvo.length} bancos diferentes.` : "");
  $("loteEmpresa").innerHTML = '<option value="">Selecione…</option>' + fonte.map(e => `<option value="${e.id}">${escapeHtml(norm(e.razao_social))}</option>`).join("");
  $("loteHint").textContent = banco && lista.length ? `Empresas credenciadas em ${norm(banco.nome_banco)}.` : "Filtre por um banco para ver só as empresas credenciadas nele.";
  $("loteOverlay").classList.add("show");
}

async function aplicarLoteEmpresa() {
  const emp = empresaById($("loteEmpresa").value);
  if (!emp) {
    toast("Escolha a empresa.", "err");
    return;
  }
  const alvos = subsDoLote();
  if (!confirm(`Definir "${norm(emp.razao_social)}" como empresa de ${alvos.length} substabelecido(s)?`)) return;
  const btn = $("loteAplicar");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Aplicando';
  try {
    const ids = alvos.map(r => r.id);
    const res = await fetch(`${REST()}?id=in.(${ids.join(",")})`, {
      method: "PATCH",
      headers: { ...H(), Prefer: "return=representation" },
      body: JSON.stringify({ empresa_grupo_id: emp.id })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const salvos = await res.json();
    salvos.forEach(s => {
      const i = state.rows.findIndex(x => x.id === s.id);
      if (i > -1) state.rows[i] = s;
    });
    $("loteOverlay").classList.remove("show");
    aplicarFiltros();
    atualizarKPIs();
    logHist("empresa_lote", "substabelecidos", null, `Definiu ${norm(emp.razao_social)} em ${salvos.length} sub(s)`);
    toast(`${salvos.length} substabelecido(s) atualizados`, "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao aplicar em lote. Veja o console (F12).", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
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
  set("f_cnpj", cnpjEmpresaDoSub(r));
  // Banco antes da empresa: e' o banco que define quais empresas sao possiveis.
  preencherBancosForm();
  setBanco(nomeBanco(r));
  montarRazaoSelect(r.empresa_grupo_id);
  setTipo(r.tipo_cadastro);
  set("f_codloja", r.cod_loja_banco);
  set("f_codsub", r.cod_substabelecido);
  set("f_codparc", r.cod_parceiro);
  set("f_resp", r.responsavel_empresa);
  // Equipe por id, com cascata, usando a hierarquia efetiva (derivada do gerente
  // quando houver), para o formulário nunca abrir com um vínculo desatualizado.
  const superId = superintendenteDoSub(r) || "";
  montarFormSuperSel(superId || null);
  montarFormSupervSel(superId, supervisorDoSub(r) || null);
  montarFormGerenteSel(superId, r.gerente_id || null);
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
  const G = el => {
    const v = g(el);
    return v === null ? null : maiusc(v);
  };
  const idSel = el => {
    const v = $(el).value;
    return v ? +v : null;
  };
  // Vínculos por id, mantidos coerentes: se há gerente, super/supervisor vêm
  // dele; se só há supervisor, o superintendente vem do supervisor.
  let gerId = idSel("f_gerente"), supId = idSel("f_supervisor"), superId = idSel("f_superintendente");
  const g2 = gerenteById(gerId);
  if (g2) {
    superId = g2.superintendente_id;
    supId = g2.supervisor_id;
  } else {
    const sv2 = supervisorById(supId);
    if (sv2) superId = sv2.superintendente_id;
  }
  // Grava a chave (empresa_grupo_id / banco_id) e, junto, o texto que as telas
  // e relatorios ainda leem — os dois precisam sair coerentes.
  const emp = empresaById($("f_razao").value);
  const banco = bancoPorNome($("f_banco").value);
  return {
    nome_subs: G("f_sub"),
    cnpj_subs: g("f_cnpj_subs"),
    empresa_grupo_id: emp ? emp.id : null,
    banco_id: banco ? banco.id : null,
    tipo_cadastro: G("f_tipo"),
    cod_loja_banco: G("f_codloja"),
    cod_substabelecido: G("f_codsub"),
    cod_parceiro: G("f_codparc"),
    responsavel_empresa: G("f_resp"),
    superintendente_id: superId,
    supervisor_id: supId,
    gerente_id: gerId,
    comissao: G("f_comissao")
  };
}

async function salvarForm() {
  const nomeSub = $("f_sub").value.trim(), cnpjSub = $("f_cnpj_subs").value.trim(), razao = $("f_razao").value.trim(), banco = $("f_banco").value.trim(), tipo = $("f_tipo").value.trim(), comissao = $("f_comissao").value.trim();
  const faltando = [];
  if (!nomeSub) faltando.push("Nome do sub");
  if (!cnpjSub) faltando.push("CNPJ do sub");
  if (!razao) faltando.push("Empresa (razão)");
  if (!banco) faltando.push("Banco");
  if (!tipo) faltando.push("Tipo de cadastro");
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
    atualizarKPIs();
    logHist("editou_sub", "substabelecidos", saved.id, `Editou sub ${norm(saved.nome_subs)} (${nomeBanco(saved)})`);
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
    atualizarKPIs();
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
  $("duvidasDot").classList.toggle("show", abertas > 0);
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
  if (state.gestor || state.diretor) return;
  const pend = getPendentes();
  if (!pend.length) return;
  if (!state.sessions.consultor) return;
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
  carregar();
  $("modePill").innerHTML = `Gestor(a) <b>${escapeHtml(state.gestorNome || "")}</b>`;
  $("gestorBtn").style.display = "none";
  $("sairBtn").style.display = "";
  $("novoBtn").style.display = "";
  $("thAcoes").style.display = "";
  $("tabs").style.display = "flex";
  $("tabsCons").style.display = "none";
  $("notifWrap").style.display = "none";
  $("sidebar").style.display = "none";
  $("filtrosTop").appendChild($("filtrosWrap"));
  $("filtrosTop").style.display = "flex";
  $("fldEmpresa").style.display = "";
  $("fldTipo").style.display = "";
  $("fldSuper").style.display = "";
  $("fldSupervisor").style.display = "";
  $("fldGerente").style.display = "";
  aplicarToggleFiltros();
  switchTab("painel");
  aplicarFiltros();
  checarAlertas();
  carregarDuvidas();
  // force: o modo consulta pode ter carregado a view reduzida; o gestor
  // precisa da tabela completa (com código, CPF, telefone e e-mail).
  carregarColaboradores(true);
  toast(`Bem-vindo(a), ${escapeHtml(state.gestorNome || "")}`, "ok");
}

// Diretoria: leitura de Painel, Substabelecidos, Pendentes/Andamento e
// Produção. Sem Colaboradores, Bancos, Empresas, Agenda, Histórico e Dúvidas —
// e sem criar/editar nada. A RLS já barra tudo isso; aqui é só a navegação.
function entrarDiretor() {
  state.diretor = true;
  carregar();
  $("modePill").innerHTML = `Diretoria <b>${escapeHtml(state.gestorNome || "")}</b>`;
  $("gestorBtn").style.display = "none";
  $("sairBtn").style.display = "";
  $("novoBtn").style.display = "none";
  $("thAcoes").style.display = "none";
  $("tabs").style.display = "none";
  $("tabsCons").style.display = "none";
  $("tabsDir").style.display = "flex";
  $("notifWrap").style.display = "none";
  $("sidebar").style.display = "none";
  $("filtrosTop").appendChild($("filtrosWrap"));
  $("filtrosTop").style.display = "flex";
  // Empresas do grupo é gestor-only na RLS, então o select ficaria vazio.
  $("fldEmpresa").style.display = "none";
  $("fEmpresa").value = "";
  $("fldTipo").style.display = "";
  $("fldSuper").style.display = "";
  $("fldSupervisor").style.display = "";
  $("fldGerente").style.display = "";
  aplicarToggleFiltros();
  switchTab("painel");
  aplicarFiltros();
  toast(`Bem-vindo(a), ${escapeHtml(state.gestorNome || "")}`, "ok");
}

function entrarPorPapel(papel) {
  if (papel === "diretor") entrarDiretor(); else entrarGestor();
}

function sairGestor() {
  authLogout("gestor");
  state.gestor = false;
  state.diretor = false;
  $("tabsDir").style.display = "none";
  state.gestorNome = null;
  $("modePill").innerHTML = "Modo <b>Consulta</b>";
  $("gestorBtn").style.display = "";
  $("sairBtn").style.display = "none";
  $("novoBtn").style.display = "none";
  $("thAcoes").style.display = "none";
  $("tabs").style.display = "none";
  $("tabsCons").style.display = "flex";
  $("agendaAlert").style.display = "none";
  $("notifWrap").style.display = "";
  $("filtrosTop").appendChild($("filtrosWrap"));
  $("filtrosTop").style.display = "flex";
  $("sidebar").style.display = "none";
  $("fldEmpresa").style.display = "none";
  $("fEmpresa").value = "";
  $("fldTipo").style.display = "none";
  $("fldSuper").style.display = "none";
  $("fldSupervisor").style.display = "none";
  $("fldGerente").style.display = "none";
  aplicarToggleFiltros();
  switchTab("welcome");
  aplicarFiltros();
  verificarRespostas();
  state.superintendentes = [];
  state.supervisores = [];
  state.gerentes = [];
  state.colabCarregado = false;
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

function vinculosDoBanco(bancoId) {
  return state.bancoVinculos.filter(v => v.banco_id === bancoId);
}

function abrirBancoInfo(id) {
  const b = state.bancos.find(x => x.id === id);
  if (!b) return;
  state.bancoInfoId = id;
  $("bancoDelBtn").style.display = state.gestor ? "" : "none";
  $("bancoEditBtn").style.display = state.gestor ? "" : "none";
  const vincs = vinculosDoBanco(id);
  const v = vincs[0] || null;
  const st = norm(b.status).toUpperCase() === "INATIVO" ? "INATIVO" : "ATIVO";
  $("bancoInfoTitle").textContent = norm(b.nome_banco) || "Banco";
  const grid = pares => `<div class="sub-grid">\n    ${pares.map(([lab, val]) => `<div class="sub-field">\n      <span class="sf-label">${escapeHtml(lab)}</span>\n      <span class="sf-val${/CNPJ|Cód\./.test(lab) ? " mono" : ""}">${escapeHtml(val || "—")}</span>\n    </div>`).join("")}\n  </div>`;
  // A empresa credenciada só é exibida ao gestor — no modo consulta a tabela
  // de empresas nem é carregada, então a seção sairia vazia e o aviso de
  // "sem vínculo" seria enganoso.
  // Um banco pode operar por varias empresas do grupo: lista todas.
  const secEmpresa = state.gestor && vincs.length ? `\n    <div class="det-sec">Empresa${vincs.length > 1 ? "s" : ""} credenciada${vincs.length > 1 ? "s" : ""}</div>\n    ` + vincs.map(x => {
    const e = empresaById(x.empresa_grupo_id);
    return grid([ [ "Razão social", e ? norm(e.razao_social) : "" ], [ "CNPJ", e ? norm(e.cnpj) : "" ], [ "Cód. corban", norm(x.codigo_corban) ], [ "Tipo", norm(x.tipo_sub) ] ]);
  }).join("") : "";
  const avisoVinculo = state.gestor && !vincs.length ? '<div class="dl-empty">Nenhuma empresa vinculada a este banco. Os subs dele ficam sem empresa — cadastre o vínculo ao editar o banco.</div>' : "";
  $("bancoInfoBody").innerHTML = `\n    <div class="det-resumo">\n      <div class="det-kpi sub-box"><b class="st-${st === "ATIVO" ? "ok" : "off"}">${st}</b><span>status</span></div>\n      <div class="det-kpi sub-box"><b>${escapeHtml(norm(v && v.codigo_corban) || "—")}</b><span>cód. corban</span></div>\n      <div class="det-kpi sub-box"><b>${escapeHtml(norm(v && v.tipo_sub) || "—")}</b><span>tipo</span></div>\n    </div>\n${secEmpresa}\n    <div class="det-sec">Contato do banco</div>\n    ${grid([ [ "Gerente", norm(b.gerente_banco) ], [ "Contato", norm(b.contato_gerente) ], [ "E-mail", norm(b.email_gerente) ], [ "Suporte", norm(b.suporte_banco) ] ])}\n\n    ${avisoVinculo}\n  `;
  $("bancoInfoOverlay").classList.add("show");
}

// ---------- Exclusão de banco ----------
// Subs apontam para bancos(id) sem ON DELETE, entao a exclusao falharia no
// banco de dados se houvesse sub vinculado: o bloqueio abaixo explica antes.
function subsDoBanco(id) {
  const b = state.bancos.find(x => x.id === id);
  return state.rows.filter(isReal).filter(r => r.banco_id === id);
}

function abrirConfirmExclusaoBanco() {
  const id = state.bancoInfoId;
  const b = id ? state.bancos.find(x => x.id === id) : null;
  if (!b || !state.gestor) return;
  state.delBancoId = id;
  const presos = subsDoBanco(id);
  $("delBancoNome").textContent = norm(b.nome_banco) || "sem nome";
  const bloq = $("delBancoBloqueio");
  bloq.innerHTML = presos.length ? `<div class="del-warn"><b>Não é possível excluir:</b> ${presos.length} substabelecido${presos.length !== 1 ? "s" : ""} ainda ${presos.length !== 1 ? "apontam" : "aponta"} para este banco. Mova-os para outro banco antes, ou apenas inative este.</div>` : "";
  $("delBancoInput").value = "";
  $("delBancoInput").disabled = !!presos.length;
  $("delBancoConfirm").disabled = true;
  $("delBancoOverlay").classList.add("show");
  if (!presos.length) $("delBancoInput").focus();
}

function validarFraseExclusaoBanco() {
  const ok = lower($("delBancoInput").value) === FRASE_EXCLUSAO && !subsDoBanco(state.delBancoId).length;
  $("delBancoConfirm").disabled = !ok;
  return ok;
}

async function excluirBancoDefinitivo() {
  const id = state.delBancoId;
  if (!id || !state.gestor || !validarFraseExclusaoBanco()) return;
  const b = state.bancos.find(x => x.id === id);
  if (!b) return;
  const btn = $("delBancoConfirm");
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> Excluindo…';
  try {
    // Anexos do passo a passo: storage antes da linha, senao o arquivo fica
    // no bucket sem dono.
    const resArq = await fetch(`${REST_BANCO_ARQ()}?banco_id=eq.${id}&select=id,path`, {
      headers: H()
    });
    if (!resArq.ok) throw new Error(`anexos HTTP ${resArq.status} — ${await resArq.text()}`);
    const anexos = await resArq.json();
    if (anexos.length) {
      const { "Content-Type": _ct, ...delHeaders } = H();
      for (const a of anexos) {
        const del = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ}/${a.path}`, {
          method: "DELETE",
          headers: delHeaders
        });
        if (!del.ok && del.status !== 404) throw new Error(`Storage HTTP ${del.status} — ${await del.text()}`);
      }
      const delRows = await fetch(`${REST_BANCO_ARQ()}?banco_id=eq.${id}`, {
        method: "DELETE",
        headers: H()
      });
      if (!delRows.ok) throw new Error(`anexos HTTP ${delRows.status} — ${await delRows.text()}`);
    }
    // Os vinculos saem por ON DELETE CASCADE da FK.
    const res = await fetch(`${REST_BANCOS()}?id=eq.${id}`, {
      method: "DELETE",
      headers: { ...H(), Prefer: "return=representation" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const del = await res.json();
    if (!Array.isArray(del) || !del.length) throw new Error("Nada foi excluído. Verifique a policy de DELETE no Supabase.");
    state.bancos = state.bancos.filter(x => x.id !== id);
    state.bancoVinculos = state.bancoVinculos.filter(v => v.banco_id !== id);
    $("delBancoOverlay").classList.remove("show");
    $("bancoInfoOverlay").classList.remove("show");
    renderBancos();
    preencherBancosForm();
    logHist("excluiu_banco", "bancos", id, `Excluiu definitivamente o banco ${norm(b.nome_banco)}`);
    toast("Banco excluído", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao excluir o banco. Veja o console (F12).", "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function renderBancos() {
  const fst = $("fBancoStatus").value;
  const tb = $("bancosTbody"), list = state.bancos.filter(b => !fst || (norm(b.status).toUpperCase() === "INATIVO" ? "INATIVO" : "ATIVO") === fst);
  $("bancosCount").innerHTML = `<b>${list.length}</b> banco${list.length !== 1 ? "s" : ""}`;
  $("bancosEmpty").style.display = list.length ? "none" : "block";
  tb.innerHTML = list.map(b => {
    const st = norm(b.status).toUpperCase() === "INATIVO" ? "INATIVO" : "ATIVO";
    const badge = st === "ATIVO" ? `<span class="badge ativo">ATIVO</span>` : `<span class="badge inativo">INATIVO</span>`;
    return `<tr class="row-click" data-bancoinfo="${b.id}" title="Ver informações do banco">\n    <td class="empresa">${escapeHtml(norm(b.nome_banco) || "—")}</td>\n    <td>${escapeHtml(norm(b.gerente_banco) || "—")}</td>\n    <td class="mono">${linkWhats(b.contato_gerente)}</td>\n    <td>${escapeHtml(norm(b.email_gerente) || "—")}</td>\n    <td>${badge}</td>\n    <td><div class="rowact">\n      <button class="btn sm" data-editbanco="${b.id}">Editar</button>\n      <button class="btn sm" data-passo="${b.id}">Passo a passo</button>\n      ${st === "ATIVO" ? `<button class="btn sm danger" data-inativabanco="${b.id}">Inativar</button>` : `<button class="btn sm" data-ativabanco="${b.id}">Reativar</button>`}\n    </div></td>\n  </tr>`;
  }).join("");
}

function renderBancosConsulta() {
  const q = lower($("fBancoConsulta").value);
  const list = state.bancos.filter(b => norm(b.status).toUpperCase() !== "INATIVO").filter(b => !q || lower(b.nome_banco).includes(q));
  $("bancoscCount").innerHTML = `<b>${list.length}</b> banco${list.length !== 1 ? "s" : ""}`;
  $("bancoscEmpty").style.display = list.length ? "none" : "block";
  $("bancoscTbody").innerHTML = list.map(b => `<tr class="row-click" data-bancoinfo="${b.id}" title="Ver informações do banco">\n    <td class="empresa">${escapeHtml(norm(b.nome_banco) || "—")}</td>\n    <td>${escapeHtml(norm(b.gerente_banco) || "—")}</td>\n    <td class="mono">${linkWhats(b.contato_gerente)}</td>\n    <td>${escapeHtml(norm(b.email_gerente) || "—")}</td>\n    <td>${escapeHtml(norm(b.suporte_banco) || "—")}</td>\n  </tr>`).join("");
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
  // Vinculos editados numa lista local; so vao para o banco no salvar.
  state.bancoVincEdit = (id ? state.bancoVinculos.filter(x => x.banco_id === id) : []).map(x => ({
    id: x.id,
    empresa_grupo_id: x.empresa_grupo_id,
    codigo_corban: norm(x.codigo_corban),
    tipo_sub: norm(x.tipo_sub)
  }));
  renderVinculosBanco();
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

// Tipos de vínculo aceitos — lista fechada, a mesma no formulário e na lista.
const TIPOS_VINCULO = [ "MASTER", "INDICADO", "SUBSTABELECIDO", "SUBZERO" ];

function renderVinculosBanco() {
  const el = $("b_vincList");
  if (!el) return;
  const lista = state.bancoVincEdit || [];
  el.innerHTML = lista.length ? lista.map((v, i) => {
    const e = empresaById(v.empresa_grupo_id);
    return `<div class="vinc-item">
      <span class="vinc-nome" title="${escapeHtml(e ? norm(e.cnpj) : "")}">${escapeHtml(e ? norm(e.razao_social) : "empresa removida")}</span>
      <input class="vinc-in" data-vincfield="codigo_corban" data-vinci="${i}" value="${escapeHtml(norm(v.codigo_corban))}" placeholder="CÓD. CORBAN">
      <select class="vinc-in" data-vincfield="tipo_sub" data-vinci="${i}">
        <option value="">TIPO…</option>
        ${TIPOS_VINCULO.map(t => `<option${chaveNome(v.tipo_sub) === t ? " selected" : ""}>${t}</option>`).join("")}
      </select>
      <button type="button" class="vinc-x" data-vincdel="${i}" title="Remover vínculo">&times;</button>
    </div>`;
  }).join("") : '<div class="vinc-vazio">Nenhuma empresa vinculada — os subs deste banco ficam sem empresa.</div>';
  // O select de adicionar só oferece empresas que ainda não estão na lista.
  const usados = lista.map(v => v.empresa_grupo_id);
  const sel = $("b_empresa");
  const livres = state.empresas.filter(e => !usados.includes(e.id));
  sel.innerHTML = '<option value="">Selecione a empresa…</option>' + livres.map(e => `<option value="${e.id}" data-cnpj="${escapeHtml(norm(e.cnpj))}">${escapeHtml(norm(e.razao_social))}</option>`).join("");
  $("b_vincAdd").disabled = !livres.length;
}

function adicionarVinculoBanco() {
  const id = $("b_empresa").value;
  if (!id) {
    toast("Escolha a empresa.", "err");
    return;
  }
  state.bancoVincEdit = state.bancoVincEdit || [];
  state.bancoVincEdit.push({
    id: null,
    empresa_grupo_id: +id,
    codigo_corban: maiusc($("b_codigo_corban").value.trim()),
    tipo_sub: maiusc($("b_tipo_sub").value.trim())
  });
  $("b_codigo_corban").value = "";
  $("b_tipo_sub").value = "";
  renderVinculosBanco();
}

// Sincroniza a lista editada com o banco: apaga o que saiu, insere o que
// entrou e atualiza o que mudou.
async function salvarVinculoBanco(bancoId) {
  const lista = state.bancoVincEdit || [];
  const antes = state.bancoVinculos.filter(v => v.banco_id === bancoId);
  const mantidos = lista.filter(v => v.id).map(v => v.id);
  try {
    for (const v of antes.filter(a => !mantidos.includes(a.id))) {
      const res = await fetch(`${REST_BANCO_VINCULOS()}?id=eq.${v.id}`, {
        method: "DELETE",
        headers: H()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    }
    for (const v of lista) {
      const body = {
        banco_id: bancoId,
        empresa_grupo_id: v.empresa_grupo_id,
        codigo_corban: v.codigo_corban || null,
        tipo_sub: v.tipo_sub || null,
        status: "ATIVO"
      };
      const res = v.id ? await fetch(`${REST_BANCO_VINCULOS()}?id=eq.${v.id}`, {
        method: "PATCH",
        headers: { ...H(), Prefer: "return=representation" },
        body: JSON.stringify(body)
      }) : await fetch(REST_BANCO_VINCULOS(), {
        method: "POST",
        headers: { ...H(), Prefer: "return=representation" },
        body: JSON.stringify([ body ])
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    }
    // Releitura para o estado local refletir ids novos e remoções.
    const res = await fetch(`${REST_BANCO_VINCULOS()}?select=id,banco_id,empresa_grupo_id,codigo_corban,tipo_sub,status&status=eq.ATIVO`, {
      headers: H()
    });
    if (res.ok) state.bancoVinculos = await res.json();
  } catch (e) {
    console.error(e);
    toast("Banco salvo, mas os vínculos não foram salvos por completo.", "err");
  }
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
    nome_banco: maiusc(nome),
    gerente_banco: maiusc(gerente),
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
    await salvarVinculoBanco(saved.id);
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
    atualizarKPIs();
    logHist("criou_sub", "substabelecidos", saved.id, `Criou sub ${norm(saved.nome_subs)} (${nomeBanco(saved)})`);
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

const MAX_ARQ_MB = 20;

// Gera um link temporário (assinado) e abre o arquivo. Os buckets são
// privados: não há mais URL pública. O link expira em 5 min e só é
// emitido para quem está autenticado (a RLS de storage.objects valida).
// A janela é aberta ANTES do await para não ser barrada por bloqueador
// de pop-up; a URL é preenchida quando o link volta.
async function abrirArquivoAssinado(bucket, path) {
  const win = window.open("", "_blank");
  try {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
      method: "POST",
      headers: H(),
      body: JSON.stringify({ expiresIn: 300 })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    const data = await res.json();
    const url = /^https?:/.test(data.signedURL) ? data.signedURL : `${CONFIG.SUPABASE_URL}/storage/v1${data.signedURL}`;
    if (win) win.location = url; else window.open(url, "_blank");
  } catch (e) {
    console.error(e);
    if (win) win.close();
    toast("Não foi possível abrir o arquivo.", "err");
  }
}

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
  el.innerHTML = list.map(a => `\n    <div class="pa-item">\n      <span class="pa-ic">${iconeArquivo(norm(a.nome_arquivo))}</span>\n      <div class="pa-info">\n        <a class="pa-titulo" href="#" data-arqopen="${escapeHtml(a.path)}" data-arqbucket="${BUCKET_ARQ}" title="Abrir ${escapeHtml(norm(a.nome_arquivo))}">${escapeHtml(norm(a.titulo) || norm(a.nome_arquivo))}</a>\n        <span class="pa-nome">${escapeHtml(norm(a.nome_arquivo))}</span>\n      </div>\n      <button class="pa-del" title="Excluir anexo" data-arqdel="${a.id}" data-arqpath="${escapeHtml(a.path)}">&times;</button>\n    </div>`).join("");
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
        ...H(),
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
    const { "Content-Type": _ct, ...delHeaders } = H();
    const del = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ}/${path}`, {
      method: "DELETE",
      headers: delHeaders
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
  el.innerHTML = list.map(a => `\n    <div class="pa-item">\n      <span class="pa-ic">${iconeArquivo(norm(a.nome_arquivo))}</span>\n      <div class="pa-info">\n        <a class="pa-titulo" href="#" data-arqopen="${escapeHtml(a.path)}" data-arqbucket="${BUCKET_ARQ_SUB}" title="Abrir ${escapeHtml(norm(a.nome_arquivo))}">${escapeHtml(norm(a.titulo) || norm(a.nome_arquivo))}</a>\n        <span class="pa-nome">${escapeHtml(norm(a.nome_arquivo))}</span>\n      </div>\n      <button class="pa-del" title="Excluir documento" data-subarqdel="${a.id}" data-subarqpath="${escapeHtml(a.path)}">&times;</button>\n    </div>`).join("");
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
        ...H(),
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
    const { "Content-Type": _ct, ...delHeaders } = H();
    const del = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${BUCKET_ARQ_SUB}/${path}`, {
      method: "DELETE",
      headers: delHeaders
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

function exigirAcesso(fn) {
  return (...args) => {
    if (state.gestor || state.diretor || state.acessoLiberado) {
      fn(...args);
      return;
    }
    state.acaoPendente = () => fn(...args);
    $("acessoSenha").value = "";
    $("acessoErro").textContent = "";
    $("acessoErro").className = "hint";
    $("acessoOverlay").classList.add("show");
    setTimeout(() => $("acessoSenha").focus(), 50);
  };
}

async function verificarAcesso() {
  const senha = $("acessoSenha").value;
  if (!senha) {
    $("acessoErro").textContent = "Digite a senha.";
    $("acessoErro").className = "hint warn";
    return;
  }
  const btn = $("acessoEntrar");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "Verificando…";
  const resultado = await authLogin("consultor", CONFIG.CONSULTOR_EMAIL, senha);
  btn.disabled = false;
  btn.textContent = orig;
  if (resultado) {
    state.acessoLiberado = true;
    $("acessoOverlay").classList.remove("show");
    await carregar();
    const acao = state.acaoPendente;
    state.acaoPendente = null;
    if (acao) acao();
  } else {
    $("acessoErro").textContent = "Senha incorreta.";
    $("acessoErro").className = "hint warn";
    $("acessoSenha").focus();
  }
}

async function carregarColaboradores(force) {
  if (state.colabCarregado && !force) return;
  state.colabErro = null;
  try {
    const [ rSup, rSv, rGer ] = await Promise.all([ fetch(`${REST_SUPERINTENDENTES()}?select=*&order=nome.asc`, {
      headers: H()
    }), fetch(`${REST_SUPERVISORES()}?select=*&order=nome.asc`, {
      headers: H()
    }), fetch(`${(state.gestor ? REST_GERENTES() : REST_GERENTES_PUB())}?select=*&order=nome.asc`, {
      headers: H()
    }) ]);
    // Cada lista é tratada em separado: se uma falhar, as outras continuam
    // valendo (antes, um erro em qualquer uma zerava as três).
    const erros = [];
    if (rSup.ok) state.superintendentes = await rSup.json(); else erros.push(`superintendentes HTTP ${rSup.status} — ${await rSup.text()}`);
    if (rSv.ok) state.supervisores = await rSv.json(); else erros.push(`supervisores HTTP ${rSv.status} — ${await rSv.text()}`);
    if (rGer.ok) state.gerentes = await rGer.json(); else erros.push(`${state.gestor ? CONFIG.TABLE_GERENTES : CONFIG.VIEW_GERENTES_PUB} HTTP ${rGer.status} — ${await rGer.text()}`);
    if (erros.length) throw new Error(erros.join(" | "));
    state.colabCarregado = true;
    // 200 com lista vazia = tabela existe mas nada voltou; quase sempre RLS
    // sem policy de SELECT ou falta de GRANT para o papel autenticado.
    console.info("Colaboradores carregados:", {
      superintendentes: state.superintendentes.length,
      supervisores: state.supervisores.length,
      gerentes: state.gerentes.length
    });
  } catch (e) {
    console.error(e);
    state.colabErro = e.message || String(e);
    toast("Erro ao carregar colaboradores. Veja o console (F12).", "err");
  }
}

const colabNomeCmp = (a, b) => norm(a.nome).localeCompare(norm(b.nome), "pt-BR");

const colabBlob = g => [ g.nome, g.codigo_parceiro, g.estado, g.email, g.fone_celular, g.cpf_cnpj ].map(lower).join(" ");

function colabActs(tipo, id) {
  if (!state.gestor) return "";
  return `<span class="col-acts"><button class="col-act" data-coledit="${tipo}:${id}" title="Editar" aria-label="Editar">&#9998;</button><button class="col-act del" data-coldel="${tipo}:${id}" title="Excluir" aria-label="Excluir">&times;</button></span>`;
}

function colabGerenteRow(g, qtdSubs) {
  const email = norm(g.email) ? `<a href="mailto:${escapeHtml(norm(g.email))}">${escapeHtml(norm(g.email))}</a>` : "—";
  const n = qtdSubs || 0;
  const pill = n ? `<span class="cg-subs" title="${n} substabelecido${n !== 1 ? "s" : ""} vinculado${n !== 1 ? "s" : ""}">${n} sub${n !== 1 ? "s" : ""}</span>` : `<span class="cg-subs zero" title="Nenhum substabelecido vinculado">sem subs</span>`;
  return `<div class="col-ger">\n    <span class="cg-nome">${escapeHtml(norm(g.nome) || "—")}${pill}</span>\n    <span class="cg-cod mono">${escapeHtml(norm(g.codigo_parceiro) || "—")}</span>\n    <span class="cg-uf">${escapeHtml(norm(g.estado) || "—")}</span>\n    <span class="cg-fone mono">${linkWhats(g.fone_celular)}</span>\n    <span class="cg-email">${email}</span>\n    ${colabActs("ger", g.id)}\n  </div>`;
}

function renderColaboradores() {
  const nS = state.superintendentes.length, nV = state.supervisores.length, nG = state.gerentes.length;
  $("colabCount").innerHTML = `<b>${nS}</b> superintendente${nS !== 1 ? "s" : ""} · <b>${nV}</b> supervisor${nV !== 1 ? "es" : ""} · <b>${nG}</b> gerente${nG !== 1 ? "s" : ""}`;
  // Estados especiais antes de montar a árvore: erro, carregando, ou vazio.
  if (state.colabErro) {
    $("colabEmpty").style.display = "none";
    $("colabTree").innerHTML = `<div class="col-vazio" style="padding:22px;line-height:1.6">Não foi possível carregar. Detalhe técnico:<br><code style="font-size:12px">${escapeHtml(state.colabErro)}</code></div>`;
    return;
  }
  if (!state.colabCarregado) {
    $("colabEmpty").style.display = "none";
    $("colabTree").innerHTML = '<div class="col-vazio" style="padding:22px">Carregando…</div>';
    return;
  }
  const q = lower($("colabBusca").value.trim());
  const abrir = !!q || state.colabExpandTudo;
  const supers = state.superintendentes.slice().sort(colabNomeCmp);
  const svBySuper = {}, gerBySv = {}, gerDiretoBySuper = {}, totalGerBySuper = {};
  state.supervisores.forEach(sv => (svBySuper[sv.superintendente_id] = svBySuper[sv.superintendente_id] || []).push(sv));
  state.gerentes.forEach(g => {
    totalGerBySuper[g.superintendente_id] = (totalGerBySuper[g.superintendente_id] || 0) + 1;
    if (g.supervisor_id != null) (gerBySv[g.supervisor_id] = gerBySv[g.supervisor_id] || []).push(g); else (gerDiretoBySuper[g.superintendente_id] = gerDiretoBySuper[g.superintendente_id] || []).push(g);
  });
  const temDados = state.superintendentes.length || state.supervisores.length || state.gerentes.length;
  $("colabEmpty").style.display = temDados ? "none" : "block";
  // Quantos substabelecidos estão vinculados a cada colaborador. Usa a
  // hierarquia efetiva, então um gerente movido de supervisor já conta no
  // supervisor novo.
  const subsPorGer = {}, subsPorSv = {}, subsPorSuper = {};
  state.rows.filter(isReal).forEach(r => {
    if (r.gerente_id) subsPorGer[r.gerente_id] = (subsPorGer[r.gerente_id] || 0) + 1;
    const sv = supervisorDoSub(r);
    if (sv) subsPorSv[sv] = (subsPorSv[sv] || 0) + 1;
    const sp = superintendenteDoSub(r);
    if (sp) subsPorSuper[sp] = (subsPorSuper[sp] || 0) + 1;
  });
  const nSubs = n => `${n || 0} sub${(n || 0) !== 1 ? "s" : ""}`;
  const blocos = supers.map(sup => {
    const superMatch = q && lower(sup.nome).includes(q);
    const svs = (svBySuper[sup.id] || []).slice().sort(colabNomeCmp);
    const svHtml = svs.map(sv => {
      const svMatch = q && lower(sv.nome).includes(q);
      const gers = (gerBySv[sv.id] || []).slice().sort(colabNomeCmp);
      const vis = !q || superMatch || svMatch ? gers : gers.filter(g => colabBlob(g).includes(q));
      if (q && !superMatch && !svMatch && !vis.length) return null;
      return `<details class="col-superv"${abrir ? " open" : ""}>\n        <summary><span class="cs-nome">${escapeHtml(norm(sv.nome))}</span><span class="cs-meta">${gers.length} gerente${gers.length !== 1 ? "s" : ""} · ${nSubs(subsPorSv[sv.id])}</span>${colabActs("superv", sv.id)}</summary>\n        <div class="col-gers">${vis.length ? vis.map(g => colabGerenteRow(g, subsPorGer[g.id])).join("") : '<div class="col-vazio">Nenhum gerente vinculado.</div>'}</div>\n      </details>`;
    }).filter(Boolean);
    const diretos = (gerDiretoBySuper[sup.id] || []).slice().sort(colabNomeCmp);
    const visDiretos = !q || superMatch ? diretos : diretos.filter(g => colabBlob(g).includes(q));
    const diretosHtml = visDiretos.length ? `<details class="col-superv sem-sup"${abrir ? " open" : ""}>\n      <summary><span class="cs-nome">Sem supervisor</span><span class="cs-meta">${visDiretos.length} gerente${visDiretos.length !== 1 ? "s" : ""}</span></summary>\n      <div class="col-gers">${visDiretos.map(g => colabGerenteRow(g, subsPorGer[g.id])).join("")}</div>\n    </details>` : "";
    if (q && !superMatch && !svHtml.length && !visDiretos.length) return null;
    const nSv = svs.length, nGer = totalGerBySuper[sup.id] || 0;
    const corpo = svHtml.join("") + diretosHtml || '<div class="col-vazio">Nenhum supervisor ou gerente vinculado.</div>';
    return `<details class="col-super"${abrir ? " open" : ""}>\n      <summary>\n        <span class="csup-nome">${escapeHtml(norm(sup.nome))}</span>\n        <span class="csup-meta">${nSv} supervisor${nSv !== 1 ? "es" : ""} · ${nGer} gerente${nGer !== 1 ? "s" : ""} · ${nSubs(subsPorSuper[sup.id])}</span>\n        ${colabActs("super", sup.id)}\n      </summary>\n      <div class="col-super-body">${corpo}</div>\n    </details>`;
  }).filter(Boolean);
  if (temDados) $("colabTree").innerHTML = blocos.join("") || '<div class="col-vazio" style="padding:22px">Nada encontrado para a busca.</div>'; else $("colabTree").innerHTML = "";
}

// ---------- Empresas do grupo ----------
// Atenção: os substabelecidos apontam para a empresa pelo CNPJ em texto
// (cnpj_empresa), não por FK. Por isso mudar o CNPJ aqui precisa propagar
// para os subs, senão o vínculo se perde silenciosamente.
function empresaSubsCount(e) {
  if (!e || !e.id) return 0;
  return state.rows.filter(isReal).filter(r => {
    const emp = empresaGrupoDe(r);
    return emp && emp.id === e.id;
  }).length;
}

async function recarregarEmpresas() {
  const res = await fetch(`${REST_EMP()}?select=*&order=razao_social.asc`, {
    headers: H()
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  state.empresas = await res.json();
}

function renderEmpresas() {
  const q = lower($("empresaBusca").value.trim()), qd = soDigitos(q);
  let list = state.empresas.slice().sort((a, b) => norm(a.razao_social).localeCompare(norm(b.razao_social), "pt-BR"));
  if (q) list = list.filter(e => [ e.razao_social, e.fantasia, e.cnpj ].map(lower).join(" ").includes(q) || qd && soDigitos(e.cnpj).includes(qd));
  $("empresasCount").innerHTML = `<b>${list.length}</b> empresa${list.length !== 1 ? "s" : ""}`;
  $("empresasEmpty").style.display = list.length ? "none" : "block";
  $("empresasTbody").innerHTML = list.map(e => {
    const n = empresaSubsCount(e);
    return `<tr>\n      <td class="empresa">${escapeHtml(norm(e.razao_social) || "—")}</td>\n      <td>${escapeHtml(norm(e.fantasia) || "—")}</td>\n      <td class="mono">${escapeHtml(norm(e.cnpj) || "—")}</td>\n      <td>${n ? `<b>${n}</b>` : '<span style="color:var(--dim)">—</span>'}</td>\n      <td><div class="rowact">\n        <button class="btn sm" data-empedit="${e.id}">Editar</button>\n        <button class="btn sm danger" data-empdel="${e.id}">Excluir</button>\n      </div></td>\n    </tr>`;
  }).join("");
}

function abrirEmpresa(id) {
  if (!state.gestor) return;
  state.editingEmpresaId = id || null;
  const e = id ? state.empresas.find(x => x.id === id) || {} : {};
  $("empresaModalTitle").textContent = id ? "Editar empresa" : "Nova empresa";
  $("emp_razao").value = norm(e.razao_social);
  $("emp_fantasia").value = norm(e.fantasia);
  $("emp_cnpj").value = mascaraCNPJ(norm(e.cnpj));
  $("empresaHint").textContent = "";
  $("empresaHint").className = "hint";
  $("emp_cnpj_hint").textContent = "";
  const n = id ? empresaSubsCount(e) : 0;
  const av = $("empresaVinculo");
  if (n) {
    av.innerHTML = `Esta empresa está vinculada a <b>${n}</b> substabelecido${n !== 1 ? "s" : ""}. O vínculo é por referência, então alterar a razão social ou o CNPJ aqui passa a valer para ${n !== 1 ? "todos eles" : "ele"} automaticamente.`;
    av.style.display = "";
  } else av.style.display = "none";
  $("empresaOverlay").classList.add("show");
  $("emp_razao").focus();
}

async function salvarEmpresa() {
  if (!state.gestor) return;
  const razao = $("emp_razao").value.trim(), fantasia = $("emp_fantasia").value.trim(), cnpj = $("emp_cnpj").value.trim();
  const hint = $("empresaHint");
  const erro = m => hint.innerHTML = `<span class="warn">${escapeHtml(m)}</span>`;
  hint.className = "hint";
  if (!razao) return erro("Informe a razão social.");
  if (!cnpj) return erro("Informe o CNPJ.");
  if (!validaCNPJ(cnpj)) return erro("CNPJ inválido.");
  const id = state.editingEmpresaId;
  const anterior = id ? state.empresas.find(x => x.id === id) : null;
  // Trocar o CNPJ nao exige mais tocar nos subs (eles apontam por id), mas o
  // aviso continua: e' uma mudanca que muda o que aparece na ficha de todos.
  const cnpjMudou = !!anterior && soDigitos(anterior.cnpj) !== soDigitos(cnpj);
  const nVinc = anterior ? empresaSubsCount(anterior) : 0;
  if (cnpjMudou && nVinc && !confirm(`O CNPJ desta empresa vai mudar e ${nVinc} substabelecido${nVinc !== 1 ? "s" : ""} ${nVinc !== 1 ? "estão" : "está"} vinculado${nVinc !== 1 ? "s" : ""} a ela.\n\n${nVinc !== 1 ? "Todos passarão" : "Ele passará"} a exibir o CNPJ novo. Continuar?`)) return;
  const btn = $("empresaSalvar");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    const res = await fetch(id ? `${REST_EMP()}?id=eq.${id}` : REST_EMP(), {
      method: id ? "PATCH" : "POST",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        razao_social: maiusc(razao),
        fantasia: fantasia ? maiusc(fantasia) : null,
        cnpj: cnpj
      })
    });
    if (!res.ok) {
      const t = await res.text();
      if (/duplicate key|unique/i.test(t)) throw new Error("Já existe uma empresa com esse CNPJ.");
      throw new Error(`HTTP ${res.status} — ${t}`);
    }
    const saved = (await res.json())[0];
    if (!saved) throw new Error("Nada foi salvo. Verifique a policy de INSERT/UPDATE no Supabase.");
    // Nao ha mais o que propagar: os subs apontam para a empresa por
    // empresa_grupo_id, entao renomear ou trocar o CNPJ aparece sozinho.
    await recarregarEmpresas();
    renderEmpresas();
    aplicarFiltros();
    $("empresaOverlay").classList.remove("show");
    logHist(id ? "editou_empresa" : "criou_empresa", CONFIG.TABLE_EMPRESAS, saved.id, `${id ? "Editou" : "Criou"} empresa ${norm(saved.razao_social)}`);
    toast(id ? "Empresa atualizada" : "Empresa criada", "ok");
  } catch (e) {
    console.error(e);
    erro(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function excluirEmpresa(id) {
  if (!state.gestor) return;
  const e = state.empresas.find(x => x.id === id);
  if (!e) return;
  const nBanco = state.bancoVinculos.filter(v => v.empresa_grupo_id === id).length;
  if (nBanco) {
    toast(`Não é possível excluir: esta empresa tem ${nBanco} vínculo(s) ativo(s) com banco. Remova-os antes.`, "err");
    return;
  }
  const n = empresaSubsCount(e);
  const aviso = `Excluir a empresa "${norm(e.razao_social)}"?` + (n ? `\n\n${n} substabelecido${n !== 1 ? "s" : ""} aponta${n !== 1 ? "m" : ""} para o CNPJ dela e ficará${n !== 1 ? "o" : ""} sem empresa correspondente (o CNPJ continua gravado neles).` : "");
  if (!confirm(aviso)) return;
  try {
    const res = await fetch(`${REST_EMP()}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        ...H(),
        Prefer: "return=representation"
      }
    });
    if (!res.ok) {
      const t = await res.text();
      if (/foreign key|violates/i.test(t)) throw new Error("Há registros vinculados que impedem a exclusão.");
      throw new Error(`HTTP ${res.status} — ${t}`);
    }
    const del = await res.json();
    if (!Array.isArray(del) || !del.length) {
      toast("Nada foi apagado. Falta a policy de DELETE para 'authenticated' no Supabase.", "err");
      return;
    }
    await recarregarEmpresas();
    renderEmpresas();
    logHist("excluiu_empresa", CONFIG.TABLE_EMPRESAS, id, `Excluiu empresa ${norm(e.razao_social)}`);
    toast("Empresa excluída", "ok");
  } catch (err) {
    console.error(err);
    toast("Erro ao excluir: " + err.message, "err");
  }
}

const COLAB_TIPOS = {
  super: "Superintendente",
  superv: "Supervisor",
  ger: "Gerente comercial"
};

const COLAB_REST = {
  super: REST_SUPERINTENDENTES,
  superv: REST_SUPERVISORES,
  ger: REST_GERENTES
};

const COLAB_TABELA = {
  super: CONFIG.TABLE_SUPERINTENDENTES,
  superv: CONFIG.TABLE_SUPERVISORES,
  ger: CONFIG.TABLE_GERENTES
};

function montarColabSuperSel(sel) {
  const supers = state.superintendentes.slice().sort(colabNomeCmp);
  $("colabSuperSel").innerHTML = '<option value="">Selecione…</option>' + supers.map(s => `<option value="${s.id}">${escapeHtml(norm(s.nome))}</option>`).join("");
  if (sel != null) $("colabSuperSel").value = String(sel);
}

function montarColabSupervSel(superId, sel) {
  const svs = state.supervisores.filter(sv => String(sv.superintendente_id) === String(superId)).sort(colabNomeCmp);
  $("colabSupervSel").innerHTML = '<option value="">Sem supervisor (direto ao superintendente)</option>' + svs.map(sv => `<option value="${sv.id}">${escapeHtml(norm(sv.nome))}</option>`).join("");
  if (sel != null) $("colabSupervSel").value = String(sel);
}

function atualizarColabCampos() {
  const t = $("colabTipo").value;
  $("colabSuperField").style.display = t === "superv" || t === "ger" ? "" : "none";
  $("colabSupervField").style.display = t === "ger" ? "" : "none";
  [ "colabCodigoField", "colabCpfField", "colabEstadoField", "colabFoneField", "colabEmailField" ].forEach(id => $(id).style.display = t === "ger" ? "" : "none");
  $("colabSepGerente").style.display = t === "ger" ? "" : "none";
}

function abrirColabForm(tipo, id) {
  if (!state.gestor) return;
  state.colabEdit = id ? {
    tipo: tipo,
    id: id
  } : null;
  [ "colabNome", "colabCodigo", "colabCpf", "colabFone", "colabEmail" ].forEach(k => $(k).value = "");
  $("colabEstado").value = "";
  $("colabHint").textContent = "";
  $("colabHint").className = "hint";
  $("colabTipo").value = tipo || "super";
  $("colabTipo").disabled = !!id;
  $("colabTipoField").style.display = id ? "none" : "";
  montarColabSuperSel();
  montarColabSupervSel("");
  atualizarColabCampos();
  if (id) {
    if (tipo === "super") {
      const r = state.superintendentes.find(x => x.id === id);
      if (r) $("colabNome").value = norm(r.nome);
    } else if (tipo === "superv") {
      const r = state.supervisores.find(x => x.id === id);
      if (r) {
        $("colabNome").value = norm(r.nome);
        montarColabSuperSel(r.superintendente_id);
      }
    } else if (tipo === "ger") {
      const r = state.gerentes.find(x => x.id === id);
      if (r) {
        $("colabNome").value = norm(r.nome);
        $("colabCodigo").value = norm(r.codigo_parceiro);
        $("colabCpf").value = norm(r.cpf_cnpj);
        $("colabEstado").value = norm(r.estado);
        $("colabFone").value = mascaraTel(r.fone_celular);
        $("colabEmail").value = norm(r.email);
        montarColabSuperSel(r.superintendente_id);
        montarColabSupervSel(r.superintendente_id, r.supervisor_id);
      }
    }
  }
  $("colabModalTitle").textContent = id ? `Editar ${COLAB_TIPOS[tipo].toLowerCase()}` : "Novo colaborador";
  $("colabOverlay").classList.add("show");
  $("colabNome").focus();
}

async function salvarColab() {
  if (!state.gestor) return;
  const t = $("colabTipo").value;
  const nome = $("colabNome").value.trim();
  const hint = $("colabHint");
  const erro = msg => hint.innerHTML = `<span class="warn">${escapeHtml(msg)}</span>`;
  hint.className = "hint";
  if (!nome) return erro("Informe o nome.");
  let body;
  if (t === "super") {
    body = {
      nome: maiusc(nome)
    };
  } else if (t === "superv") {
    const superId = $("colabSuperSel").value;
    if (!superId) return erro("Selecione o superintendente.");
    body = {
      nome: maiusc(nome),
      superintendente_id: +superId
    };
  } else {
    const superId = $("colabSuperSel").value;
    const codigo = $("colabCodigo").value.trim();
    const email = $("colabEmail").value.trim();
    if (!codigo) return erro("Informe o código do parceiro.");
    if (!superId) return erro("Selecione o superintendente.");
    if (email && !validaEmail(email)) return erro("E-mail inválido.");
    const supervId = $("colabSupervSel").value;
    body = {
      codigo_parceiro: codigo,
      nome: maiusc(nome),
      cpf_cnpj: $("colabCpf").value.trim() || null,
      estado: $("colabEstado").value || null,
      fone_celular: soDigitos($("colabFone").value) || null,
      email: email || null,
      superintendente_id: +superId,
      supervisor_id: supervId ? +supervId : null
    };
  }
  const editing = state.colabEdit;
  const btn = $("colabSalvar");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.innerHTML = '<span class="spin"></span> Salvando';
  try {
    const url = editing ? `${COLAB_REST[t]()}?id=eq.${editing.id}` : COLAB_REST[t]();
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: {
        ...H(),
        Prefer: "return=representation"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      if (/duplicate key|unique/i.test(txt)) throw new Error(t === "ger" ? "Já existe um colaborador com esse código de parceiro." : "Já existe um colaborador com esse nome.");
      throw new Error(`HTTP ${res.status} — ${txt}`);
    }
    const saved = (await res.json())[0];
    if (!saved) throw new Error("Nada foi salvo. Verifique a policy de INSERT/UPDATE no Supabase.");
    await carregarColaboradores(true);
    renderColaboradores();
    // Nome pode ter mudado: reflete nos filtros e nas telas que exibem o vínculo.
    montarFiltros();
    aplicarFiltros();
    $("colabOverlay").classList.remove("show");
    logHist(editing ? "editou_colaborador" : "cadastrou_colaborador", COLAB_TABELA[t], saved.id, `${editing ? "Editou" : "Cadastrou"} ${COLAB_TIPOS[t].toLowerCase()} ${norm(saved.nome)}`);
    toast(editing ? "Colaborador atualizado" : "Colaborador cadastrado", "ok");
  } catch (e) {
    console.error(e);
    erro(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function excluirColab(tipo, id) {
  if (!state.gestor) return;
  let r, aviso;
  // Impacto nos substabelecidos: as FKs são "on delete set null", então apagar
  // um colaborador desvincula os subs em silêncio. Avisa antes.
  const plural = (n, s, p) => `${n} substabelecido${n === 1 ? "" : "s"} ${n === 1 ? s : p}`;
  if (tipo === "super") {
    r = state.superintendentes.find(x => x.id === id);
    if (!r) return;
    const nSv = state.supervisores.filter(s => s.superintendente_id === id).length;
    const nGer = state.gerentes.filter(g => g.superintendente_id === id).length;
    if (nSv || nGer) {
      toast(`Não é possível excluir: há ${nSv} supervisor(es) e ${nGer} gerente(s) vinculados. Realoque-os ou exclua-os antes.`, "err");
      return;
    }
    const nSubs = state.rows.filter(x => x.superintendente_id === id).length;
    aviso = `Excluir o superintendente "${norm(r.nome)}"?` + (nSubs ? `\n\n${plural(nSubs, "ficará", "ficarão")} sem superintendente.` : "");
  } else if (tipo === "superv") {
    r = state.supervisores.find(x => x.id === id);
    if (!r) return;
    const nGer = state.gerentes.filter(g => g.supervisor_id === id).length;
    const nSubs = state.rows.filter(x => x.supervisor_id === id).length;
    const partes = [];
    if (nGer) partes.push(`${nGer} gerente${nGer === 1 ? "" : "s"} ${nGer === 1 ? "ficará" : "ficarão"} sem supervisor (não serão apagados).`);
    if (nSubs) partes.push(`${plural(nSubs, "perderá", "perderão")} o vínculo com este supervisor.`);
    aviso = `Excluir o supervisor "${norm(r.nome)}"?` + (partes.length ? "\n\n" + partes.join("\n") : "");
  } else {
    r = state.gerentes.find(x => x.id === id);
    if (!r) return;
    const nSubs = state.rows.filter(x => x.gerente_id === id).length;
    aviso = `Excluir o gerente "${norm(r.nome)}" (código ${norm(r.codigo_parceiro)})?` + (nSubs ? `\n\n${plural(nSubs, "ficará", "ficarão")} sem gerente e ${nSubs === 1 ? "precisará" : "precisarão"} ser reatribuído${nSubs === 1 ? "" : "s"}.` : "");
  }
  if (!confirm(aviso)) return;
  try {
    const res = await fetch(`${COLAB_REST[tipo]()}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        ...H(),
        Prefer: "return=representation"
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      if (/foreign key|violates|restrict/i.test(txt)) throw new Error("Há registros vinculados que impedem a exclusão.");
      throw new Error(`HTTP ${res.status} — ${txt}`);
    }
    const del = await res.json();
    if (!Array.isArray(del) || !del.length) {
      toast("Nada foi apagado. Falta a policy de DELETE para 'authenticated' no Supabase.", "err");
      return;
    }
    // Espelha na memória o que o "on delete set null" fez no banco, senão a
    // tela continuaria mostrando o vínculo antigo até um F5.
    const campo = tipo === "ger" ? "gerente_id" : tipo === "superv" ? "supervisor_id" : "superintendente_id";
    let desvinculados = 0;
    state.rows.forEach(x => {
      if (x[campo] === id) {
        x[campo] = null;
        desvinculados++;
      }
    });
    await carregarColaboradores(true);
    renderColaboradores();
    montarFiltros();
    aplicarFiltros();
    atualizarKPIs();
    logHist("excluiu_colaborador", COLAB_TABELA[tipo], id, `Excluiu ${COLAB_TIPOS[tipo].toLowerCase()} ${norm(r.nome)}${desvinculados ? ` (${desvinculados} sub(s) desvinculados)` : ""}`);
    toast(desvinculados ? `Colaborador excluído — ${desvinculados} sub(s) ficaram sem vínculo` : "Colaborador excluído", "ok");
  } catch (e) {
    console.error(e);
    toast("Erro ao excluir: " + e.message, "err");
  }
}

function switchTab(t) {
  $("viewWelcome").style.display = t === "welcome" ? "" : "none";
  $("viewSubs").style.display = t === "subs" ? "" : "none";
  $("viewPendentes").style.display = t === "pendentes" ? "" : "none";
  $("viewBancosConsulta").style.display = t === "bancosc" ? "" : "none";
  $("viewBancos").style.display = t === "bancos" ? "" : "none";
  $("viewEmpresas").style.display = t === "empresas" ? "" : "none";
  $("viewColab").style.display = t === "colab" ? "" : "none";
  $("viewProducao").style.display = t === "producao" ? "" : "none";
  $("viewAgenda").style.display = t === "agenda" ? "" : "none";
  $("viewHist").style.display = t === "hist" ? "" : "none";
  $("viewDuvidas").style.display = t === "duvidas" ? "" : "none";
  $("viewPainel").style.display = t === "painel" ? "" : "none";
  document.querySelectorAll("#tabs .tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  document.querySelectorAll("#tabsCons .tab").forEach(b => b.classList.toggle("active", b.dataset.consview === t));
  document.querySelectorAll("#tabsDir .tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  if (t === "pendentes") renderPendentes();
  if (t === "bancosc") renderBancosConsulta();
  if (t === "bancos") renderBancos();
  if (t === "empresas") renderEmpresas();
  if (t === "colab") {
    $("colabExpandir").textContent = state.colabExpandTudo ? "Recolher tudo" : "Expandir tudo";
    renderColaboradores();
    carregarColaboradores().then(renderColaboradores);
  }
  if (t === "producao") initProducao();
  if (t === "agenda") renderAgenda();
  if (t === "hist") renderHistorico();
  if (t === "duvidas") carregarDuvidas();
  if (t === "painel") renderPainel();
  const vid = {
    welcome: "viewWelcome",
    subs: "viewSubs",
    pendentes: "viewPendentes",
    bancosc: "viewBancosConsulta",
    bancos: "viewBancos",
    empresas: "viewEmpresas",
    colab: "viewColab",
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
  $("f_razao").addEventListener("change", sincronizarCnpjGrupo);
  // Trocar o banco redefine quais empresas sao possiveis.
  $("f_banco").addEventListener("change", () => montarRazaoSelect(null));
  $("bancoDelBtn").onclick = abrirConfirmExclusaoBanco;
  $("bancoEditBtn").onclick = () => {
    $("bancoInfoOverlay").classList.remove("show");
    abrirBanco(state.bancoInfoId);
  };
  $("delBancoInput").addEventListener("input", validarFraseExclusaoBanco);
  $("delBancoInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && validarFraseExclusaoBanco()) excluirBancoDefinitivo();
  });
  $("delBancoConfirm").onclick = excluirBancoDefinitivo;
  $("tabelaPdfBtn").onclick = exportarTabelaSubsPDF;
  $("loteEmpresaBtn").onclick = abrirLoteEmpresa;
  $("loteAplicar").onclick = aplicarLoteEmpresa;
  $("b_vincAdd").onclick = adicionarVinculoBanco;
  $("b_vincList").addEventListener("click", e => {
    const del = e.target.closest("[data-vincdel]");
    if (!del) return;
    state.bancoVincEdit.splice(+del.dataset.vincdel, 1);
    renderVinculosBanco();
  });
  // Edicao do cod. corban e do tipo direto na linha. Sem redesenhar a lista,
  // senao o campo perderia o foco a cada tecla.
  // "input" cobre o texto e "change" o select, sem redesenhar a lista.
  [ "input", "change" ].forEach(ev => $("b_vincList").addEventListener(ev, e => {
    const el = e.target.closest("[data-vincfield]");
    if (!el) return;
    const v = state.bancoVincEdit[+el.dataset.vinci];
    if (v) v[el.dataset.vincfield] = maiusc(el.value.trim());
  }));
  $("f_cnpj_subs").addEventListener("input", e => {
    e.target.value = mascaraCNPJ(e.target.value);
    validarCnpjSubUI();
  });
  $("f_tipo").addEventListener("change", atualizarObrigatoriedadeComissao);
  // Cascata da equipe no formulário do sub
  $("f_superintendente").addEventListener("change", () => {
    const superId = $("f_superintendente").value;
    montarFormSupervSel(superId, null);
    montarFormGerenteSel(superId, null);
  });
  $("f_gerente").addEventListener("change", () => {
    const g = gerenteById($("f_gerente").value);
    if (g) $("f_supervisor").value = g.supervisor_id ? String(g.supervisor_id) : "";
  });
  $("novoBancoBtn").onclick = () => abrirBanco(null);
  $("fBancoStatus").addEventListener("change", renderBancos);
  $("bancoSave").onclick = salvarBanco;
  $("b_contato").addEventListener("input", e => {
    e.target.value = mascaraTel(e.target.value);
    validarBancoUI();
  });
  $("b_email").addEventListener("input", validarBancoUI);
  $("b_suporte").addEventListener("input", validarBancoUI);
  $("bancosTbody").addEventListener("click", e => {
    if (e.target.closest("a")) return; // link do WhatsApp segue seu caminho
    const ed = e.target.closest("[data-editbanco]");
    const ps = e.target.closest("[data-passo]");
    const ina = e.target.closest("[data-inativabanco]");
    const at = e.target.closest("[data-ativabanco]");
    const bi = e.target.closest("[data-bancoinfo]");
    if (ed) abrirBanco(+ed.dataset.editbanco); else if (ps) abrirPasso(+ps.dataset.passo); else if (ina) {
      if (confirm("Inativar este banco?")) mudarStatusBanco(+ina.dataset.inativabanco, "INATIVO");
    } else if (at) mudarStatusBanco(+at.dataset.ativabanco, "ATIVO"); else if (bi) abrirBancoInfo(+bi.dataset.bancoinfo);
  });
  $("bancoscTbody").addEventListener("click", e => {
    if (e.target.closest("a")) return;
    const bi = e.target.closest("[data-bancoinfo]");
    if (bi) abrirBancoInfo(+bi.dataset.bancoinfo);
  });
  $("passoSave").onclick = salvarPasso;
  $("passoArqPick").onclick = () => $("passoArqFile").click();
  $("passoArqFile").onchange = () => {
    const f = $("passoArqFile").files[0];
    $("passoArqNome").textContent = f ? f.name : "";
  };
  $("passoArqAdd").onclick = anexarArquivoBanco;
  $("passoArqList").addEventListener("click", e => {
    const o = e.target.closest("[data-arqopen]");
    if (o) {
      e.preventDefault();
      abrirArquivoAssinado(o.dataset.arqbucket, o.dataset.arqopen);
      return;
    }
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
    const o = e.target.closest("[data-arqopen]");
    if (o) {
      e.preventDefault();
      abrirArquivoAssinado(o.dataset.arqbucket, o.dataset.arqopen);
      return;
    }
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
  $("sidebarToggleBtn").onclick = () => {
    document.querySelector(".sidebar-col").classList.toggle("expanded");
  };
  $("toggleFiltrosBtn").onclick = () => {
    state.filtrosVisiveis = !state.filtrosVisiveis;
    aplicarToggleFiltros();
  };
  [ "fBusca", "fBanco", "fStatus", "fTipo", "fEmpresa" ].forEach(id => {
    const ev = id === "fBusca" ? "input" : "change";
    $(id).addEventListener(ev, aplicarFiltros);
  });
  // Equipe: cascata para baixo (restringe) e para cima (preenche o superior)
  $("fSuper").addEventListener("change", () => {
    montarFiltrosEquipe({
      super: $("fSuper").value
    });
    aplicarFiltros();
  });
  $("fSupervisor").addEventListener("change", () => {
    const sv = supervisorById($("fSupervisor").value);
    montarFiltrosEquipe({
      super: sv ? String(sv.superintendente_id) : $("fSuper").value,
      supv: $("fSupervisor").value
    });
    aplicarFiltros();
  });
  $("fGerente").addEventListener("change", () => {
    const g = gerenteById($("fGerente").value);
    // Um gerente tem exatamente um supervisor e um superintendente: ao
    // escolhê-lo, os dois níveis acima são preenchidos sozinhos.
    if (g) montarFiltrosEquipe({
      super: String(g.superintendente_id),
      supv: g.supervisor_id ? String(g.supervisor_id) : "",
      ger: String(g.id)
    }); else montarFiltrosEquipe({
      ger: ""
    });
    aplicarFiltros();
  });
  $("limparBtn").onclick = () => {
    $("fBusca").value = "";
    $("fBanco").value = "";
    $("fStatus").value = "ATIVO";
    $("fTipo").value = "";
    // Reconstrói as listas completas (a cascata pode tê-las deixado filtradas)
    montarFiltrosEquipe({
      super: "",
      supv: "",
      ger: ""
    });
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
    $("loginKeep").checked = false;
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
    const resultado = await authLogin("gestor", login, senha, $("loginKeep").checked);
    if (resultado) {
      state.gestorNome = resultado.nome;
      registrarAtividade();
      $("loginOverlay").classList.remove("show");
      entrarPorPapel(resultado.papel);
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
  $("duvidaBtn").onclick = exigirAcesso(() => {
    $("duvidaOverlay").classList.add("show");
    $("duvidaNome").focus();
  });
  $("minhasBtn").onclick = exigirAcesso(abrirMinhas);
  $("tabsCons").addEventListener("click", e => {
    const b = e.target.closest("[data-consview]");
    if (!b) return;
    const t = b.dataset.consview;
    if (t === "welcome") switchTab(t); else exigirAcesso(() => switchTab(t))();
  });
  $("wlSubs").onclick = exigirAcesso(() => switchTab("subs"));
  $("wlBancos").onclick = exigirAcesso(() => switchTab("bancosc"));
  $("wlDuvida").onclick = exigirAcesso(() => {
    $("duvidaOverlay").classList.add("show");
    $("duvidaNome").focus();
  });
  $("acessoEntrar").onclick = verificarAcesso;
  $("acessoSenha").addEventListener("keydown", e => {
    if (e.key === "Enter") verificarAcesso();
  });
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
  $("tbodyPendentes").addEventListener("click", e => {
    const ob = e.target.closest("[data-obs]");
    const ed = e.target.closest("[data-edit]"), sm = e.target.closest("[data-statusmenu]");
    if (ob) {
      abrirObs("edit", +ob.dataset.obs);
    } else if (ed) abrirForm(+ed.dataset.edit); else if (sm) abrirMenuStatus(sm, +sm.dataset.statusmenu); else if (!e.target.closest("a,button")) {
      const tr = e.target.closest("tr[data-rowid]");
      if (tr) abrirFichaSub(+tr.dataset.rowid);
    }
  });
  $("fBuscaPendentes").addEventListener("input", renderPendentes);
  $("colabBusca").addEventListener("input", renderColaboradores);
  $("colabExpandir").onclick = () => {
    state.colabExpandTudo = !state.colabExpandTudo;
    $("colabExpandir").textContent = state.colabExpandTudo ? "Recolher tudo" : "Expandir tudo";
    renderColaboradores();
  };
  $("empresaBusca").addEventListener("input", renderEmpresas);
  $("novaEmpresaBtn").onclick = () => abrirEmpresa(null);
  $("empresaSalvar").onclick = salvarEmpresa;
  $("emp_cnpj").addEventListener("input", e => {
    e.target.value = mascaraCNPJ(e.target.value);
    const v = e.target.value.trim(), h = $("emp_cnpj_hint");
    if (!v) {
      h.textContent = "";
      h.className = "hint";
    } else if (validaCNPJ(v)) {
      h.textContent = "CNPJ válido";
      h.className = "hint ok";
    } else {
      h.textContent = "CNPJ inválido";
      h.className = "hint warn";
    }
  });
  $("empresasTbody").addEventListener("click", e => {
    const ed = e.target.closest("[data-empedit]"), dl = e.target.closest("[data-empdel]");
    if (ed) abrirEmpresa(+ed.dataset.empedit); else if (dl) excluirEmpresa(+dl.dataset.empdel);
  });
  $("colabEstado").innerHTML = '<option value="">—</option>' + Object.keys(NOME_UF).sort().map(uf => `<option value="${uf}">${uf} — ${escapeHtml(NOME_UF[uf])}</option>`).join("");
  $("colabNovo").onclick = () => abrirColabForm(null, null);
  $("colabSalvar").onclick = salvarColab;
  $("colabTipo").addEventListener("change", atualizarColabCampos);
  $("colabSuperSel").addEventListener("change", () => montarColabSupervSel($("colabSuperSel").value));
  $("colabFone").addEventListener("input", e => e.target.value = mascaraTel(e.target.value));
  $("colabTree").addEventListener("click", e => {
    const ed = e.target.closest("[data-coledit]"), dl = e.target.closest("[data-coldel]");
    if (ed) {
      e.preventDefault();
      const [ tipo, id ] = ed.dataset.coledit.split(":");
      abrirColabForm(tipo, +id);
    } else if (dl) {
      e.preventDefault();
      const [ tipo, id ] = dl.dataset.coldel.split(":");
      excluirColab(tipo, +id);
    }
  });
  document.querySelectorAll("#tabelaSubs thead th.sortable").forEach(th => {
    th.onclick = () => ordenarPorColuna(th.dataset.sort);
  });
  $("subPdfBtn").onclick = exportarFichaSubPDF;
  $("subDelBtn").onclick = abrirConfirmExclusaoSub;
  $("delSubInput").addEventListener("input", validarFraseExclusao);
  $("delSubInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && validarFraseExclusao()) excluirSubDefinitivo();
  });
  $("delSubConfirm").onclick = excluirSubDefinitivo;
  $("detalheBody").addEventListener("click", e => {
    const toggle = e.target.closest("[data-uf-view]");
    if (toggle) {
      state.ufDetalheView = toggle.dataset.ufView;
      renderDetalheUf(state.detalheAtual.valor);
      return;
    }
    const st = e.target.closest("[data-det-status]");
    if (st) {
      state.detalheStatus = st.dataset.detStatus;
      const d = state.detalheAtual || {};
      if (d.tipo === "uf") renderDetalheUf(d.valor); else if (d.tipo === "banco") renderDetalheBanco(d.valor);
      return;
    }
    const item = e.target.closest("[data-rowid]");
    if (item) abrirFichaSub(+item.dataset.rowid);
  });
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
  const cfgOk = CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes("SEU-PROJETO");
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
  aplicarToggleFiltros();
  switchTab("welcome");
  initClock();
  initTicker();
  setInterval(initTicker, 15 * 60 * 1e3);
  carregar();
  renderNotifPanel();
  verificarRespostas();
  setInterval(verificarRespostas, 2e4);
  setInterval(() => {
    if (state.gestor) carregarDuvidas();
  }, 2e4);
  iniciarMonitorInatividade();
  restaurarSessao("gestor").then(resultado => {
    if (resultado) {
      state.gestorNome = resultado.nome;
      registrarAtividade();
      entrarPorPapel(resultado.papel);
    }
  });
  restaurarSessao("consultor").then(resultado => {
    if (resultado) {
      state.acessoLiberado = true;
      carregar();
    }
  });
})();