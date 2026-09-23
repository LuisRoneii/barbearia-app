/* ==========================================================================
   TRAIN BARBER — script.js
   Cadastro, login e agendamento rodando 100% no navegador via localStorage.
   ⚠️ Isso é uma simulação para portfólio/demo: os dados ficam só neste
   navegador. Para uso real em produção, troque as funções db*() abaixo
   por chamadas a um backend de verdade (Node/Express, Firebase, etc).
   ========================================================================== */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------
     "Banco de dados" local
  --------------------------------------------------------------------- */
  const DB_USERS = "tb_users";
  const DB_APPOINTMENTS = "tb_appointments";
  const DB_SESSION = "tb_session";

  function dbGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function dbSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getUsers() { return dbGet(DB_USERS, []); }
  function saveUsers(users) { dbSet(DB_USERS, users); }

  function getAppointments() { return dbGet(DB_APPOINTMENTS, []); }
  function saveAppointments(list) { dbSet(DB_APPOINTMENTS, list); }

  function getSession() { return dbGet(DB_SESSION, null); }
  function setSession(email) { dbSet(DB_SESSION, email); }
  function clearSession() { localStorage.removeItem(DB_SESSION); }

  // hash simples só para não guardar a senha em texto puro no localStorage.
  // NÃO é criptografia segura — trocar por hash real (bcrypt etc) no backend.
  function hashSenha(senha) {
    let hash = 0;
    for (let i = 0; i < senha.length; i++) {
      hash = (hash << 5) - hash + senha.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  /* ---------------------------------------------------------------------
     Serviços (mesmos dados usados no HTML)
  --------------------------------------------------------------------- */
  const SERVICOS = [
    { id: "corte", nome: "Corte Masculino", duracao: 30, preco: 45 },
    { id: "barba", nome: "Barba", duracao: 25, preco: 35 },
    { id: "combo", nome: "Combo Corte + Barba", duracao: 55, preco: 70 },
    { id: "sobrancelha", nome: "Sobrancelha", duracao: 15, preco: 20 },
    { id: "pigmentacao", nome: "Pigmentação", duracao: 40, preco: 50 },
    { id: "infantil", nome: "Corte Infantil", duracao: 25, preco: 30 },
  ];

  const HORARIO_INICIO = 9;  // 09:00
  const HORARIO_FIM = 19;    // 19:00
  const INTERVALO_MIN = 30;  // grade de horários de 30 em 30 min

  /* ---------------------------------------------------------------------
     Elementos
  --------------------------------------------------------------------- */
  const header = document.getElementById("header");
  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobile-nav");

  const modalOverlay = document.getElementById("modal-overlay");
  const modalFechar = document.getElementById("modal-fechar");
  const tabLogin = document.getElementById("tab-login");
  const tabCadastro = document.getElementById("tab-cadastro");
  const formLogin = document.getElementById("form-login");
  const formCadastro = document.getElementById("form-cadastro");
  const msgLogin = document.getElementById("msg-login");
  const msgCadastro = document.getElementById("msg-cadastro");

  const btnConta = document.getElementById("btn-conta");
  const btnAbrirCadastro = document.getElementById("btn-abrir-cadastro");
  const btnAbrirLogin = document.getElementById("btn-abrir-login");
  const btnSair = document.getElementById("btn-sair");

  const boxLogadoFora = document.getElementById("box-logado-fora");
  const boxLogadoDentro = document.getElementById("box-logado-dentro");
  const nomeUsuarioLogado = document.getElementById("nome-usuario-logado");

  const formAgendamento = document.getElementById("form-agendamento");
  const selectServico = document.getElementById("ag-servico");
  const inputData = document.getElementById("ag-data");
  const selectHorario = document.getElementById("ag-horario");
  const msgAgendamento = document.getElementById("msg-agendamento");
  const listaAgendamentos = document.getElementById("lista-agendamentos");

  /* ---------------------------------------------------------------------
     Menu mobile
  --------------------------------------------------------------------- */
  hamburger.addEventListener("click", () => {
    const aberto = mobileNav.classList.toggle("is-open");
    hamburger.setAttribute("aria-expanded", String(aberto));
  });
  mobileNav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      mobileNav.classList.remove("is-open");
      hamburger.setAttribute("aria-expanded", "false");
    });
  });

  window.addEventListener("scroll", () => {
    header.style.borderBottomColor = window.scrollY > 4 ? "#232323" : "#232323";
  });

  /* ---------------------------------------------------------------------
     Modal login / cadastro
  --------------------------------------------------------------------- */
  function abrirModal(aba) {
    modalOverlay.classList.add("is-open");
    trocarAba(aba || "login");
  }
  function fecharModal() {
    modalOverlay.classList.remove("is-open");
    msgLogin.textContent = "";
    msgCadastro.textContent = "";
  }
  function trocarAba(aba) {
    const isLogin = aba === "login";
    tabLogin.classList.toggle("is-active", isLogin);
    tabCadastro.classList.toggle("is-active", !isLogin);
    formLogin.classList.toggle("hidden", !isLogin);
    formCadastro.classList.toggle("hidden", isLogin);
  }

  tabLogin.addEventListener("click", () => trocarAba("login"));
  tabCadastro.addEventListener("click", () => trocarAba("cadastro"));
  modalFechar.addEventListener("click", fecharModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) fecharModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModal();
  });

  btnAbrirCadastro.addEventListener("click", () => abrirModal("cadastro"));
  btnAbrirLogin.addEventListener("click", () => abrirModal("login"));

  btnConta.addEventListener("click", () => {
    if (getSession()) {
      document.getElementById("agendar").scrollIntoView({ behavior: "smooth" });
    } else {
      abrirModal("login");
    }
  });

  /* ---------------------------------------------------------------------
     Cadastro
  --------------------------------------------------------------------- */
  formCadastro.addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = document.getElementById("cad-nome").value.trim();
    const email = document.getElementById("cad-email").value.trim().toLowerCase();
    const telefone = document.getElementById("cad-telefone").value.trim();
    const senha = document.getElementById("cad-senha").value;

    if (!nome || !email || !telefone || senha.length < 4) {
      mostrarMsg(msgCadastro, "Preencha todos os campos (senha com 4+ caracteres).", true);
      return;
    }

    const users = getUsers();
    if (users.some((u) => u.email === email)) {
      mostrarMsg(msgCadastro, "Já existe uma conta com esse e-mail.", true);
      return;
    }

    users.push({ nome, email, telefone, senhaHash: hashSenha(senha) });
    saveUsers(users);
    setSession(email);

    mostrarMsg(msgCadastro, "Conta criada com sucesso!", false);
    setTimeout(() => {
      fecharModal();
      atualizarEstadoConta();
    }, 500);
  });

  /* ---------------------------------------------------------------------
     Login
  --------------------------------------------------------------------- */
  formLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const senha = document.getElementById("login-senha").value;

    const users = getUsers();
    const user = users.find((u) => u.email === email);

    if (!user || user.senhaHash !== hashSenha(senha)) {
      mostrarMsg(msgLogin, "E-mail ou senha incorretos.", true);
      return;
    }

    setSession(email);
    mostrarMsg(msgLogin, "Login realizado!", false);
    setTimeout(() => {
      fecharModal();
      atualizarEstadoConta();
    }, 400);
  });

  btnSair.addEventListener("click", () => {
    clearSession();
    atualizarEstadoConta();
  });

  function mostrarMsg(el, texto, erro) {
    el.textContent = texto;
    el.classList.toggle("is-error", !!erro);
    el.classList.toggle("is-ok", !erro);
  }

  /* ---------------------------------------------------------------------
     Estado da conta / seção de agendamento
  --------------------------------------------------------------------- */
  function usuarioAtual() {
    const email = getSession();
    if (!email) return null;
    return getUsers().find((u) => u.email === email) || null;
  }

  function atualizarEstadoConta() {
    const user = usuarioAtual();
    if (user) {
      boxLogadoFora.classList.add("hidden");
      boxLogadoDentro.classList.remove("hidden");
      nomeUsuarioLogado.textContent = user.nome.split(" ")[0];
      btnConta.textContent = "Minha agenda";
      renderizarMeusAgendamentos();
    } else {
      boxLogadoFora.classList.remove("hidden");
      boxLogadoDentro.classList.add("hidden");
      btnConta.textContent = "Minha conta";
    }
  }

  /* ---------------------------------------------------------------------
     Preencher select de serviços
  --------------------------------------------------------------------- */
  function preencherServicos() {
    selectServico.innerHTML = "";
    SERVICOS.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.nome} — R$ ${s.preco} (${s.duracao} min)`;
      selectServico.appendChild(opt);
    });
  }

  /* ---------------------------------------------------------------------
     Gerar horários disponíveis para a data escolhida
  --------------------------------------------------------------------- */
  function gerarHorarios(data) {
    const horarios = [];
    for (let h = HORARIO_INICIO; h < HORARIO_FIM; h++) {
      for (let m = 0; m < 60; m += INTERVALO_MIN) {
        horarios.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
        );
      }
    }

    const ocupados = getAppointments()
      .filter((a) => a.data === data)
      .map((a) => a.horario);

    return horarios.filter((h) => !ocupados.includes(h));
  }

  inputData.addEventListener("change", () => {
    const data = inputData.value;
    selectHorario.innerHTML = "";

    if (!data) {
      selectHorario.innerHTML = "<option value=''>Escolha a data primeiro</option>";
      return;
    }

    const disponiveis = gerarHorarios(data);
    if (disponiveis.length === 0) {
      selectHorario.innerHTML = "<option value=''>Sem horários livres nesse dia</option>";
      return;
    }

    disponiveis.forEach((h) => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      selectHorario.appendChild(opt);
    });
  });

  /* ---------------------------------------------------------------------
     Enviar agendamento
  --------------------------------------------------------------------- */
  formAgendamento.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = usuarioAtual();
    if (!user) {
      abrirModal("login");
      return;
    }

    const servicoId = selectServico.value;
    const data = inputData.value;
    const horario = selectHorario.value;

    if (!servicoId || !data || !horario) {
      mostrarMsg(msgAgendamento, "Preencha serviço, data e horário.", true);
      return;
    }

    const hoje = new Date().toISOString().split("T")[0];
    if (data < hoje) {
      mostrarMsg(msgAgendamento, "Escolha uma data a partir de hoje.", true);
      return;
    }

    const agendamentos = getAppointments();
    const conflito = agendamentos.some((a) => a.data === data && a.horario === horario);
    if (conflito) {
      mostrarMsg(msgAgendamento, "Esse horário acabou de ser reservado. Escolha outro.", true);
      inputData.dispatchEvent(new Event("change"));
      return;
    }

    const servico = SERVICOS.find((s) => s.id === servicoId);
    agendamentos.push({
      id: Date.now().toString(36),
      clienteEmail: user.email,
      clienteNome: user.nome,
      servico: servico.nome,
      data,
      horario,
    });
    saveAppointments(agendamentos);

    mostrarMsg(msgAgendamento, "Horário confirmado!", false);
    formAgendamento.reset();
    selectHorario.innerHTML = "<option value=''>Escolha a data primeiro</option>";
    preencherServicos();
    renderizarMeusAgendamentos();
  });

  /* ---------------------------------------------------------------------
     Listar meus agendamentos
  --------------------------------------------------------------------- */
  function renderizarMeusAgendamentos() {
    const user = usuarioAtual();
    if (!user) return;

    const meus = getAppointments()
      .filter((a) => a.clienteEmail === user.email)
      .sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));

    listaAgendamentos.innerHTML = "";

    if (meus.length === 0) {
      const li = document.createElement("li");
      li.className = "vazio";
      li.textContent = "Nenhum horário marcado ainda.";
      listaAgendamentos.appendChild(li);
      return;
    }

    meus.forEach((a) => {
      const li = document.createElement("li");
      const dataFormatada = formatarData(a.data);
      li.innerHTML = `<span>${a.servico}</span><span>${dataFormatada} · ${a.horario}</span>`;
      listaAgendamentos.appendChild(li);
    });
  }

  function formatarData(iso) {
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
  }

  /* ---------------------------------------------------------------------
     Inicialização
  --------------------------------------------------------------------- */
  function init() {
    document.getElementById("ano").textContent = new Date().getFullYear();
    inputData.min = new Date().toISOString().split("T")[0];
    preencherServicos();
    atualizarEstadoConta();
  }

  init();
})();