/* ==========================================================================
   TRAIN BARBER — script.js
   Cadastro, login e agendamento (por profissional) rodando 100% no
   navegador via localStorage.
   ⚠️ Simulação para portfólio/demo: os dados ficam só neste navegador.
   Para produção real, troque as funções db*() por chamadas a um backend
   de verdade (Node/Express, Firebase, etc) e mova BARBEIROS/SERVICOS
   pra vir de uma API.
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
  function dbSet(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function getUsers() { return dbGet(DB_USERS, []); }
  function saveUsers(users) { dbSet(DB_USERS, users); }
  function getAppointments() { return dbGet(DB_APPOINTMENTS, []); }
  function saveAppointments(list) { dbSet(DB_APPOINTMENTS, list); }
  function getSession() { return dbGet(DB_SESSION, null); }
  function setSession(email) { dbSet(DB_SESSION, email); }
  function clearSession() { localStorage.removeItem(DB_SESSION); }

  // hash simples só pra não guardar a senha em texto puro no localStorage.
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
     Dados: serviços, barbeiros, portfólio, depoimentos, FAQ
  --------------------------------------------------------------------- */
  const SERVICOS = [
    { id: "corte", nome: "Corte Masculino", duracao: 30, preco: 45 },
    { id: "barba", nome: "Barba", duracao: 25, preco: 35 },
    { id: "combo", nome: "Combo Corte + Barba", duracao: 55, preco: 70 },
    { id: "sobrancelha", nome: "Sobrancelha", duracao: 15, preco: 20 },
    { id: "pigmentacao", nome: "Pigmentação", duracao: 40, preco: 50 },
    { id: "infantil", nome: "Corte Infantil", duracao: 25, preco: 30 },
  ];

  // troque nomes/especialidades/iniciais pelos barbeiros reais
  const BARBEIROS = [
    { id: "lucas", nome: "Lucas Train", especialidade: "Degradê e barba desenhada" },
    { id: "rafael", nome: "Rafael Nunes", especialidade: "Cortes clássicos e navalhado" },
    { id: "enzo", nome: "Enzo Lima", especialidade: "Coloração e platinado" },
  ];

  const PORTFOLIO_PLACEHOLDERS = [
    "Degradê navalhado", "Barba desenhada", "Corte social", "Platinado",
    "Combo completo", "Pompadour", "Risco lateral", "Infantil",
  ];

  const DEPOIMENTOS = [
    { texto: "Marquei pelo site, cheguei e já fui atendido no horário certo. Corte impecável.", autor: "Gabriel M." },
    { texto: "O Lucas entende exatamente o que eu peço. Não troco de barbeiro há 2 anos.", autor: "Diego A." },
    { texto: "Ambiente simples, sem enrolação, e o resultado sempre vem melhor do que eu esperava.", autor: "Rafael S." },
  ];

  const FAQ = [
    { pergunta: "Preciso criar conta pra agendar?", resposta: "Sim. É rápido: nome, e-mail, telefone e senha. Assim você acompanha seus horários marcados." },
    { pergunta: "Posso escolher o barbeiro?", resposta: "Sim, o agendamento é feito escolhendo o profissional e depois vendo só os horários livres na agenda dele." },
    { pergunta: "Como cancelo ou remarco um horário?", resposta: "Chame no WhatsApp com o máximo de antecedência possível — o link está na seção de contato." },
    { pergunta: "Quais as formas de pagamento?", resposta: "Dinheiro, PIX e cartão de débito/crédito." },
  ];

  // dias da semana em que a barbearia funciona (0 = domingo ... 6 = sábado)
  const DIAS_FUNCIONAMENTO = [2, 3, 4, 5, 6]; // terça a sábado
  const HORARIO_INICIO = 9;   // 09:00
  const HORARIO_FIM = 19;     // 19:00
  const INTERVALO_MIN = 30;   // grade de horários de 30 em 30 min
  const DIAS_PARA_MOSTRAR = 7; // quantos dias futuros oferecer no passo 3

  const NOME_DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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

  const wizardSteps = document.getElementById("wizard-steps");
  const wizardServicos = document.getElementById("wizard-servicos");
  const wizardBarbeiros = document.getElementById("wizard-barbeiros");
  const wizardDias = document.getElementById("wizard-dias");
  const wizardHorarios = document.getElementById("wizard-horarios");
  const wizardResumo = document.getElementById("wizard-resumo");
  const btnConfirmarAgendamento = document.getElementById("btn-confirmar-agendamento");
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
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) fecharModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

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
     Cadastro / login
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
    setTimeout(() => { fecharModal(); atualizarEstadoConta(); }, 500);
  });

  formLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const senha = document.getElementById("login-senha").value;
    const user = getUsers().find((u) => u.email === email);
    if (!user || user.senhaHash !== hashSenha(senha)) {
      mostrarMsg(msgLogin, "E-mail ou senha incorretos.", true);
      return;
    }
    setSession(email);
    mostrarMsg(msgLogin, "Login realizado!", false);
    setTimeout(() => { fecharModal(); atualizarEstadoConta(); }, 400);
  });

  btnSair.addEventListener("click", () => { clearSession(); atualizarEstadoConta(); });

  function mostrarMsg(el, texto, erro) {
    el.textContent = texto;
    el.classList.toggle("is-error", !!erro);
    el.classList.toggle("is-ok", !erro);
  }

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
      resetarWizard();
      renderizarMeusAgendamentos();
    } else {
      boxLogadoFora.classList.remove("hidden");
      boxLogadoDentro.classList.add("hidden");
      btnConta.textContent = "Minha conta";
    }
  }

  /* ---------------------------------------------------------------------
     Render: equipe (seção estática) / serviços / portfólio / depoimentos / faq
  --------------------------------------------------------------------- */
  function renderizarEquipeEstatica() {
    const ul = document.getElementById("lista-equipe");
    ul.innerHTML = "";
    BARBEIROS.forEach((b) => {
      const li = document.createElement("li");
      li.className = "barbeiro-card";
      li.innerHTML = `
        <div class="barbeiro-card__foto">${iniciais(b.nome)}</div>
        <p class="barbeiro-card__nome">${b.nome}</p>
        <p class="barbeiro-card__especialidade">${b.especialidade}</p>`;
      ul.appendChild(li);
    });
  }

  function iniciais(nome) {
    return nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }

  function renderizarServicosEstatico() {
    const ul = document.getElementById("lista-servicos");
    ul.innerHTML = "";
    SERVICOS.forEach((s) => {
      const li = document.createElement("li");
      li.className = "servico";
      li.innerHTML = `
        <div class="servico__nome">${s.nome}</div>
        <div class="servico__desc">${s.duracao} minutos de atendimento dedicado.</div>
        <div class="servico__meta"><span>${s.duracao} min</span><span class="servico__preco">R$ ${s.preco}</span></div>`;
      ul.appendChild(li);
    });
  }

  function renderizarPortfolio() {
    const ul = document.getElementById("lista-portfolio");
    ul.innerHTML = "";
    PORTFOLIO_PLACEHOLDERS.forEach((legenda) => {
      const li = document.createElement("li");
      li.textContent = legenda;
      ul.appendChild(li);
    });
  }

  function renderizarDepoimentos() {
    const ul = document.getElementById("lista-depoimentos");
    ul.innerHTML = "";
    DEPOIMENTOS.forEach((d) => {
      const li = document.createElement("li");
      li.className = "depoimento";
      li.innerHTML = `
        <div class="depoimento__estrelas">★★★★★</div>
        <p class="depoimento__texto">"${d.texto}"</p>
        <p class="depoimento__autor">${d.autor}</p>`;
      ul.appendChild(li);
    });
  }

  function renderizarFaq() {
    const ul = document.getElementById("lista-faq");
    ul.innerHTML = "";
    FAQ.forEach((item) => {
      const li = document.createElement("li");
      li.className = "faq-item";
      li.innerHTML = `
        <button class="faq-item__pergunta" type="button">
          <span>${item.pergunta}</span>
          <span class="faq-item__icone">+</span>
        </button>
        <div class="faq-item__resposta"><p>${item.resposta}</p></div>`;
      li.querySelector(".faq-item__pergunta").addEventListener("click", () => {
        li.classList.toggle("is-aberto");
      });
      ul.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------------
     Wizard de agendamento
  --------------------------------------------------------------------- */
  const estado = { servico: null, barbeiro: null, data: null, horario: null };

  function irParaPasso(n) {
    wizardSteps.querySelectorAll("li").forEach((li) => {
      const passo = Number(li.dataset.step);
      li.classList.toggle("is-active", passo === n);
      li.classList.toggle("is-done", passo < n);
    });
    document.querySelectorAll(".wizard__step").forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.stepPanel) === n);
    });
  }

  document.querySelectorAll(".link-voltar").forEach((btn) => {
    btn.addEventListener("click", () => irParaPasso(Number(btn.dataset.voltar)));
  });

  function resetarWizard() {
    estado.servico = null;
    estado.barbeiro = null;
    estado.data = null;
    estado.horario = null;
    msgAgendamento.textContent = "";
    wizardResumo.classList.remove("is-visivel");
    renderizarPassoServicos();
    irParaPasso(1);
  }

  function renderizarPassoServicos() {
    wizardServicos.innerHTML = "";
    SERVICOS.forEach((s) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<span class="op__nome">${s.nome}</span><span class="op__meta">R$ ${s.preco} · ${s.duracao} min</span>`;
      btn.addEventListener("click", () => {
        estado.servico = s;
        renderizarPassoBarbeiros();
        irParaPasso(2);
      });
      li.appendChild(btn);
      wizardServicos.appendChild(li);
    });
  }

  function renderizarPassoBarbeiros() {
    wizardBarbeiros.innerHTML = "";
    BARBEIROS.forEach((b) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<span class="op__nome">${b.nome}</span><span class="op__especialidade">${b.especialidade}</span>`;
      btn.addEventListener("click", () => {
        estado.barbeiro = b;
        renderizarPassoDias();
        irParaPasso(3);
      });
      li.appendChild(btn);
      wizardBarbeiros.appendChild(li);
    });
  }

  // gera a grade fixa de horários do dia (independente de ocupação)
  function gradeDeHorarios() {
    const horarios = [];
    for (let h = HORARIO_INICIO; h < HORARIO_FIM; h++) {
      for (let m = 0; m < 60; m += INTERVALO_MIN) {
        horarios.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return horarios;
  }

  // "09:30" -> 570 (minutos desde meia-noite)
  function paraMinutos(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  // duração de um agendamento salvo (registros antigos não tinham o campo)
  function duracaoDoAgendamento(a) {
    if (a.duracao) return a.duracao;
    const s = SERVICOS.find((x) => x.nome === a.servico);
    return s ? s.duracao : INTERVALO_MIN;
  }

  // dois intervalos [inicio, fim) se sobrepõem?
  function sobrepoe(inicioA, fimA, inicioB, fimB) {
    return inicioA < fimB && inicioB < fimA;
  }

  // horários em que cabe um serviço de `duracao` minutos com esse barbeiro nesse dia
  function horariosLivres(barbeiroId, dataISO, duracao) {
    const ocupados = getAppointments()
      .filter((a) => a.barbeiroId === barbeiroId && a.data === dataISO)
      .map((a) => {
        const ini = paraMinutos(a.horario);
        return { ini, fim: ini + duracaoDoAgendamento(a) };
      });

    const fimExpediente = HORARIO_FIM * 60;
    const agora = new Date();
    const ehHoje = dataISO === paraISO(agora);
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

    return gradeDeHorarios().filter((h) => {
      const ini = paraMinutos(h);
      const fim = ini + duracao;
      if (fim > fimExpediente) return false;            // não termina depois de fechar
      if (ehHoje && ini <= minutosAgora) return false;  // não oferece horário que já passou
      return !ocupados.some((o) => sobrepoe(ini, fim, o.ini, o.fim));
    });
  }

  function proximosDiasUteis(qtd) {
    const dias = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (dias.length < qtd) {
      if (DIAS_FUNCIONAMENTO.includes(cursor.getDay())) {
        dias.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dias;
  }

  // AAAA-MM-DD no fuso local (toISOString usa UTC e, no Brasil,
  // depois das 21h devolvia o dia seguinte)
  function paraISO(date) {
    const a = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${a}-${m}-${d}`;
  }

  function renderizarPassoDias() {
    wizardDias.innerHTML = "";
    const dias = proximosDiasUteis(DIAS_PARA_MOSTRAR);

    dias.forEach((date) => {
      const iso = paraISO(date);
      const livres = horariosLivres(estado.barbeiro.id, iso, estado.servico.duracao);
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.disabled = livres.length === 0;
      if (livres.length === 0) btn.style.opacity = "0.35";
      btn.innerHTML = `
        <span class="dia__semana">${NOME_DIA_SEMANA[date.getDay()]}</span>
        <span class="dia__numero">${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}</span>`;
      btn.addEventListener("click", () => {
        estado.data = iso;
        renderizarPassoHorarios();
        irParaPasso(4);
      });
      li.appendChild(btn);
      wizardDias.appendChild(li);
    });
  }

  function renderizarPassoHorarios() {
    estado.horario = null;
    wizardResumo.classList.remove("is-visivel");
    msgAgendamento.textContent = "";
    wizardHorarios.innerHTML = "";

    const livres = horariosLivres(estado.barbeiro.id, estado.data, estado.servico.duracao);
    livres.forEach((h) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = h;
      btn.addEventListener("click", () => {
        estado.horario = h;
        wizardHorarios.querySelectorAll("button").forEach((b) => b.classList.remove("is-selecionado"));
        btn.classList.add("is-selecionado");
        mostrarResumo();
      });
      li.appendChild(btn);
      wizardHorarios.appendChild(li);
    });
  }

  function horaFim(hhmm, duracao) {
    const t = paraMinutos(hhmm) + duracao;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }

  function mostrarResumo() {
    const [ano, mes, dia] = estado.data.split("-");
    wizardResumo.innerHTML = `
      <strong>${estado.servico.nome}</strong> com <strong>${estado.barbeiro.nome}</strong><br>
      ${dia}/${mes}/${ano} das <strong>${estado.horario}</strong> às ${horaFim(estado.horario, estado.servico.duracao)} · R$ ${estado.servico.preco}`;
    wizardResumo.classList.add("is-visivel");
  }

  btnConfirmarAgendamento.addEventListener("click", () => {
    const user = usuarioAtual();
    if (!user) { abrirModal("login"); return; }

    if (!estado.servico || !estado.barbeiro || !estado.data || !estado.horario) {
      mostrarMsg(msgAgendamento, "Escolha um horário antes de confirmar.", true);
      return;
    }

    const agendamentos = getAppointments();
    const livresAgora = horariosLivres(estado.barbeiro.id, estado.data, estado.servico.duracao);
    const conflito = !livresAgora.includes(estado.horario);
    if (conflito) {
      mostrarMsg(msgAgendamento, "Esse horário acabou de ser reservado. Escolha outro.", true);
      renderizarPassoHorarios();
      return;
    }

    agendamentos.push({
      id: Date.now().toString(36),
      clienteEmail: user.email,
      clienteNome: user.nome,
      servico: estado.servico.nome,
      duracao: estado.servico.duracao,
      barbeiroId: estado.barbeiro.id,
      barbeiroNome: estado.barbeiro.nome,
      data: estado.data,
      horario: estado.horario,
    });
    saveAppointments(agendamentos);

    mostrarMsg(msgAgendamento, "Horário confirmado!", false);
    renderizarMeusAgendamentos();
    setTimeout(resetarWizard, 900);
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
      const [ano, mes, dia] = a.data.split("-");
      li.innerHTML = `<span>${a.servico} · ${a.barbeiroNome}</span><span>${dia}/${mes}/${ano} · ${a.horario}</span>`;
      listaAgendamentos.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------------
     Inicialização
  --------------------------------------------------------------------- */
  function init() {
    document.getElementById("ano").textContent = new Date().getFullYear();
    renderizarEquipeEstatica();
    renderizarServicosEstatico();
    renderizarPortfolio();
    renderizarDepoimentos();
    renderizarFaq();
    atualizarEstadoConta();
  }

  init();
})();