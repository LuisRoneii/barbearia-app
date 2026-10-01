/* ==========================================================================
   ZT BARBER CLUB — painel.js
   Painel dos donos: login, agenda do dia, bloqueios e faturamento.
   Conversa com as rotas /api/:slug/admin da API (pasta backend/).
   ========================================================================== */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------
     Configuração (mesma lógica do script.js do site)
  --------------------------------------------------------------------- */
  const SLUG = "zt-barber";
  const ehLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const API_URL = ehLocal ? `http://localhost:3000/api/${SLUG}` : `/api/${SLUG}`;
  const LS_SESSAO = "zt_painel_sessao";

  const FORMAS = [
    ["pix", "PIX"], ["dinheiro", "Dinheiro"], ["debito", "Débito"], ["credito", "Crédito"],
  ];
  const NOME_FORMA = Object.fromEntries(FORMAS);
  const NOME_STATUS = {
    confirmado: "Confirmado", concluido: "Concluído", cancelado: "Cancelado", nao_compareceu: "Não veio",
  };

  const $ = (id) => document.getElementById(id);

  /* ---------------------------------------------------------------------
     Sessão (token guardado neste aparelho)
  --------------------------------------------------------------------- */
  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(LS_SESSAO)); } catch (e) { sessao = null; }

  function salvarSessao(s) {
    sessao = s;
    try { s ? localStorage.setItem(LS_SESSAO, JSON.stringify(s)) : localStorage.removeItem(LS_SESSAO); } catch (e) { /* ok */ }
  }

  /* ---------------------------------------------------------------------
     API
  --------------------------------------------------------------------- */
  async function api(caminho, { metodo = "GET", corpo, admin = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (admin && sessao) headers.Authorization = `Bearer ${sessao.token}`;
    let resp;
    try {
      resp = await fetch(API_URL + (admin ? "/admin" : "") + caminho, {
        method: metodo,
        headers,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      throw new Error("Não foi possível falar com a API. Ela está ligada?");
    }
    if (resp.status === 204) return null;
    const dados = await resp.json().catch(() => ({}));
    if (resp.status === 401 && admin && caminho !== "/login") {
      sair("Sua sessão expirou. Entre de novo.");
      throw new Error(dados.erro || "Sessão expirada.");
    }
    if (!resp.ok) throw new Error(dados.erro || "Algo deu errado.");
    return dados;
  }

  /* ---------------------------------------------------------------------
     Utilitários
  --------------------------------------------------------------------- */
  function esc(t) {
    return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const reais = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  function msg(el, texto, erro = true) {
    el.textContent = texto;
    el.classList.toggle("is-error", erro);
    el.classList.toggle("is-ok", !erro);
  }
  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function somarDias(iso, n) {
    const [a, m, d] = iso.split("-").map(Number);
    const dt = new Date(a, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  const dataBR = (iso) => iso.split("-").reverse().join("/");
  const linkWhats = (tel) => `https://wa.me/${tel.startsWith("55") ? tel : "55" + tel}`;
  function formatarTelefone(t) {
    const d = String(t || "").replace(/^55/, "");
    return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
      : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t;
  }
  function vazio(ul, texto) {
    ul.innerHTML = `<li class="painel__vazio">${esc(texto)}</li>`;
  }

  /* ---------------------------------------------------------------------
     Login / sair
  --------------------------------------------------------------------- */
  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const botao = e.submitter;
    botao.disabled = true;
    try {
      const dados = await api("/login", {
        metodo: "POST",
        corpo: { email: $("login-email").value, senha: $("login-senha").value },
      });
      salvarSessao(dados);
      $("login-senha").value = "";
      $("msg-login").textContent = "";
      entrar();
    } catch (err) {
      msg($("msg-login"), err.message);
    } finally {
      botao.disabled = false;
    }
  });

  function sair(aviso) {
    salvarSessao(null);
    $("tela-app").classList.add("hidden");
    $("usuario").classList.add("hidden");
    $("tela-login").classList.remove("hidden");
    if (aviso) msg($("msg-login"), aviso);
  }
  $("btn-sair").addEventListener("click", () => sair());

  /* ---------------------------------------------------------------------
     Abas
  --------------------------------------------------------------------- */
  const carregarAba = { agenda: carregarAgenda, bloqueios: carregarBloqueios, faturamento: carregarFaturamento };

  document.querySelectorAll(".painel__aba").forEach((aba) => {
    aba.addEventListener("click", () => {
      document.querySelectorAll(".painel__aba").forEach((a) => a.classList.toggle("is-ativa", a === aba));
      document.querySelectorAll(".painel__painel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.painel !== aba.dataset.aba);
      });
      carregarAba[aba.dataset.aba]();
    });
  });

  /* ---------------------------------------------------------------------
     Dados de apoio: barbeiros e serviços (rotas públicas)
  --------------------------------------------------------------------- */
  let BARBEIROS = [];
  let SERVICOS = [];

  async function carregarApoio() {
    [BARBEIROS, SERVICOS] = await Promise.all([
      api("/barbeiros", { admin: false }),
      api("/servicos", { admin: false }),
    ]);
    const opcoesBarbeiros = BARBEIROS.map((b) => `<option value="${b.id}">${esc(b.nome)}</option>`).join("");
    $("agenda-barbeiro").innerHTML = `<option value="">Todos os barbeiros</option>${opcoesBarbeiros}`;
    $("enc-barbeiro").innerHTML = opcoesBarbeiros;
    $("blq-barbeiro").innerHTML = `<option value="">Barbearia toda</option>${opcoesBarbeiros}`;
    $("enc-servico").innerHTML = SERVICOS
      .map((s) => `<option value="${s.id}">${esc(s.nome)} · ${s.duracao_min} min</option>`).join("");
    if (sessao.barbeiro_id) {
      $("enc-barbeiro").value = sessao.barbeiro_id;
      $("blq-barbeiro").value = "";
    }
  }

  /* ---------------------------------------------------------------------
     AGENDA
  --------------------------------------------------------------------- */
  const inputData = $("agenda-data");
  const listaAgenda = $("agenda-lista");

  $("dia-anterior").addEventListener("click", () => { inputData.value = somarDias(inputData.value, -1); carregarAgenda(); });
  $("dia-seguinte").addEventListener("click", () => { inputData.value = somarDias(inputData.value, 1); carregarAgenda(); });
  $("agenda-hoje").addEventListener("click", () => { inputData.value = hojeISO(); carregarAgenda(); });
  inputData.addEventListener("change", () => inputData.value && carregarAgenda());
  $("agenda-barbeiro").addEventListener("change", carregarAgenda);

  async function carregarAgenda() {
    msg($("msg-agenda"), "", false);
    vazio(listaAgenda, "Carregando…");
    let dados;
    try {
      dados = await api(`/agenda?data=${inputData.value}`);
    } catch (err) {
      listaAgenda.innerHTML = "";
      return msg($("msg-agenda"), err.message);
    }

    const filtro = Number($("agenda-barbeiro").value) || null;
    const itens = dados.agendamentos.filter((a) => !filtro || a.barbeiro_id === filtro);

    $("agenda-bloqueios").innerHTML = dados.bloqueios
      .filter((b) => !filtro || !b.barbeiro_id || b.barbeiro_id === filtro)
      .map((b) => `<div class="agenda__aviso">${esc(b.barbeiro || "Barbearia toda")}: ${esc(b.motivo)}
        (${esc(b.inicio.slice(11))} → ${esc(b.fim.slice(0, 10) === inputData.value ? b.fim.slice(11) : "fim do dia")})</div>`)
      .join("");

    if (!itens.length) return vazio(listaAgenda, "Nenhum agendamento neste dia.");
    listaAgenda.innerHTML = "";
    itens.forEach((a) => listaAgenda.appendChild(itemAgenda(a)));
  }

  function itemAgenda(a) {
    const li = document.createElement("li");
    li.className = `ag ag--${a.status}`;
    const contato = a.cliente_telefone
      ? ` · <a href="${linkWhats(a.cliente_telefone)}" target="_blank" rel="noopener">${esc(formatarTelefone(a.cliente_telefone))}</a>`
      : "";
    const pagamento = a.status === "concluido" && a.forma_pagamento ? ` · ${NOME_FORMA[a.forma_pagamento]}` : "";
    li.innerHTML = `
      <div class="ag__hora">${esc(a.inicio)}<small>até ${esc(a.fim)}</small></div>
      <div>
        <p class="ag__cliente">${esc(a.cliente_nome)}</p>
        <p class="ag__detalhe">${esc(a.servico)} · ${esc(a.barbeiro)}${a.origem === "encaixe" ? " · encaixe" : ""}${contato}</p>
      </div>
      <div class="ag__lado">
        <p class="ag__valor">${reais(a.preco_cobrado)}${pagamento}</p>
        <span class="ag__status ag__status--${a.status}">${NOME_STATUS[a.status]}</span>
      </div>
      <div class="ag__botoes"></div>`;

    const botoes = li.querySelector(".ag__botoes");
    const botao = (texto, classe, acao) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `btn ${classe}`;
      b.textContent = texto;
      b.addEventListener("click", acao);
      botoes.appendChild(b);
    };

    if (a.status === "confirmado") {
      botao("Concluir", "btn--primary", () => abrirConcluir(li, a));
      botao("Não veio", "btn--outline", () => mudarStatus(a, "nao_compareceu"));
      botao("Cancelar", "btn--perigo", () => {
        if (confirm(`Cancelar o horário de ${a.cliente_nome} às ${a.inicio}? O horário volta a ficar livre no site.`)) {
          mudarStatus(a, "cancelar");
        }
      });
    } else if (a.status === "concluido") {
      botao("Editar valor", "btn--outline", () => abrirConcluir(li, a));
      botao("Desfazer", "btn--ghost", () => mudarStatus(a, "reabrir"));
    } else {
      botao("Desfazer", "btn--ghost", () => mudarStatus(a, "reabrir"));
    }
    return li;
  }

  function abrirConcluir(li, a) {
    if (li.querySelector(".ag__concluir")) return;
    let forma = a.forma_pagamento || null;
    const caixa = document.createElement("div");
    caixa.className = "ag__concluir";
    caixa.innerHTML = `
      <label>Valor cobrado<input type="number" min="0" step="0.5" value="${Number(a.preco_cobrado)}"></label>
      <div class="ag__formas">${FORMAS.map(([v, t]) =>
        `<button type="button" class="ag__forma${v === forma ? " is-sel" : ""}" data-forma="${v}">${t}</button>`).join("")}</div>
      <button type="button" class="btn btn--primary">Salvar</button>`;
    caixa.querySelectorAll(".ag__forma").forEach((b) => b.addEventListener("click", () => {
      forma = b.dataset.forma;
      caixa.querySelectorAll(".ag__forma").forEach((x) => x.classList.toggle("is-sel", x === b));
    }));
    caixa.querySelector(".btn--primary").addEventListener("click", () => {
      if (!forma) return msg($("msg-agenda"), "Escolha a forma de pagamento.");
      mudarStatus(a, "concluir", {
        preco_cobrado: Number(caixa.querySelector("input").value),
        forma_pagamento: forma,
      });
    });
    li.appendChild(caixa);
    caixa.querySelector("input").select();
  }

  async function mudarStatus(a, acao, extra = {}) {
    try {
      await api(`/agendamentos/${a.id}`, { metodo: "PATCH", corpo: { acao, ...extra } });
      await carregarAgenda();
    } catch (err) {
      msg($("msg-agenda"), err.message);
    }
  }

  /* Encaixe */
  $("btn-encaixe").addEventListener("click", () => {
    const form = $("form-encaixe");
    form.classList.toggle("hidden");
    const agora = new Date();
    const min = Math.ceil(agora.getMinutes() / 5) * 5;
    agora.setMinutes(min, 0, 0);
    $("enc-horario").value = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    $("enc-nome").focus();
  });
  $("cancelar-encaixe").addEventListener("click", () => $("form-encaixe").classList.add("hidden"));

  $("form-encaixe").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/encaixe", {
        metodo: "POST",
        corpo: {
          barbeiro_id: Number($("enc-barbeiro").value),
          servico_id: Number($("enc-servico").value),
          data: inputData.value,
          horario: $("enc-horario").value,
          nome: $("enc-nome").value,
          telefone: $("enc-telefone").value || undefined,
        },
      });
      $("enc-nome").value = "";
      $("enc-telefone").value = "";
      $("form-encaixe").classList.add("hidden");
      carregarAgenda();
    } catch (err) {
      msg($("msg-encaixe"), err.message);
    }
  });

  /* ---------------------------------------------------------------------
     BLOQUEIOS
  --------------------------------------------------------------------- */
  $("blq-dia-inteiro").addEventListener("change", (e) => {
    document.querySelectorAll(".blq-horas").forEach((el) => el.classList.toggle("hidden", e.target.checked));
  });
  $("blq-inicio").addEventListener("change", () => {
    if (!$("blq-fim").value || $("blq-fim").value < $("blq-inicio").value) $("blq-fim").value = $("blq-inicio").value;
  });

  $("form-bloqueio").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tipo = $("blq-tipo").value;
    const descricao = $("blq-descricao").value.trim();
    const diaInteiro = $("blq-dia-inteiro").checked;
    $("blq-conflitos").innerHTML = "";
    try {
      const r = await api("/bloqueios", {
        metodo: "POST",
        corpo: {
          barbeiro_id: Number($("blq-barbeiro").value) || null,
          data_inicio: $("blq-inicio").value,
          data_fim: $("blq-fim").value || $("blq-inicio").value,
          hora_inicio: diaInteiro ? undefined : $("blq-hora-inicio").value,
          hora_fim: diaInteiro ? undefined : $("blq-hora-fim").value,
          motivo: descricao ? `${tipo}: ${descricao}` : tipo,
        },
      });
      msg($("msg-bloqueio"), "Bloqueio criado. Esses horários já sumiram do site.", false);
      $("blq-descricao").value = "";
      if (r.conflitos.length) {
        $("blq-conflitos").innerHTML = `<div class="conflitos">
          <p>Já havia ${r.conflitos.length} cliente(s) marcado(s) nesse período. Avise e cancele na agenda:</p>
          <ul>${r.conflitos.map((c) => `<li>${esc(c.quando)} · ${esc(c.cliente_nome)} (${esc(c.barbeiro)})
            ${c.cliente_telefone ? `· <a href="${linkWhats(c.cliente_telefone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</li>`).join("")}</ul>
        </div>`;
      }
      carregarBloqueios();
    } catch (err) {
      msg($("msg-bloqueio"), err.message);
    }
  });

  async function carregarBloqueios() {
    const ul = $("bloqueios-lista");
    vazio(ul, "Carregando…");
    let lista;
    try {
      lista = await api("/bloqueios");
    } catch (err) {
      return vazio(ul, err.message);
    }
    if (!lista.length) return vazio(ul, "Nenhum bloqueio futuro.");
    ul.innerHTML = "";
    lista.forEach((b) => {
      const periodo = b.dia_inteiro
        ? (b.data_inicio === b.data_fim ? dataBR(b.data_inicio) : `${dataBR(b.data_inicio)} a ${dataBR(b.data_fim)}`)
        : `${dataBR(b.data_inicio)}, ${b.hora_inicio} às ${b.hora_fim}`;
      const li = document.createElement("li");
      li.className = "blq";
      li.innerHTML = `
        <div>
          <p class="blq__quando">${esc(periodo)}</p>
          <p class="blq__motivo">${esc(b.barbeiro || "Barbearia toda")} · ${esc(b.motivo)}</p>
        </div>
        <button type="button" class="btn btn--perigo">Remover</button>`;
      li.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Remover o bloqueio de ${periodo}? Os horários voltam a aparecer no site.`)) return;
        try {
          await api(`/bloqueios/${b.id}`, { metodo: "DELETE" });
          carregarBloqueios();
        } catch (err) {
          msg($("msg-bloqueio"), err.message);
        }
      });
      ul.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------------
     FATURAMENTO
  --------------------------------------------------------------------- */
  $("fat-mes").addEventListener("change", () => $("fat-mes").value && carregarFaturamento());

  async function carregarFaturamento() {
    msg($("msg-faturamento"), "", false);
    let f;
    try {
      f = await api(`/faturamento?mes=${$("fat-mes").value}`);
    } catch (err) {
      return msg($("msg-faturamento"), err.message);
    }
    const [ano, mes] = f.mes.split("-");
    const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const nomeMesMaiusculo = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
    $("fat-total").innerHTML = `${reais(f.total)}<small>Total da barbearia em ${esc(nomeMesMaiusculo)}</small>`;
    $("fat-cards").innerHTML = f.barbeiros.map((b) => `
      <article class="fat__card">
        <h3>${esc(b.barbeiro)}</h3>
        <p class="fat__valor">${reais(b.total)}</p>
        <ul class="fat__linhas">
          <li><span>Atendimentos</span><span>${b.atendimentos}</span></li>
          <li><span>Ticket médio</span><span>${b.atendimentos ? reais(b.total / b.atendimentos) : "—"}</span></li>
          ${FORMAS.map(([v, t]) => `<li><span>${t}</span><span>${reais(b.por_forma[v])}</span></li>`).join("")}
          <li><span>Faltas</span><span>${b.faltas}</span></li>
          <li><span>Cancelados</span><span>${b.cancelados}</span></li>
          <li><span>Ainda sem concluir</span><span>${b.pendentes}</span></li>
        </ul>
      </article>`).join("");
  }

  /* ---------------------------------------------------------------------
     Início
  --------------------------------------------------------------------- */
  async function entrar() {
    $("tela-login").classList.add("hidden");
    $("tela-app").classList.remove("hidden");
    $("usuario").classList.remove("hidden");
    $("usuario-nome").textContent = sessao.nome;
    inputData.value = hojeISO();
    $("blq-inicio").value = hojeISO();
    $("blq-fim").value = hojeISO();
    $("fat-mes").value = hojeISO().slice(0, 7);
    try {
      await carregarApoio();
    } catch (err) {
      return msg($("msg-agenda"), err.message);
    }
    carregarAgenda();
  }

  if (sessao && sessao.token) entrar();
})();
