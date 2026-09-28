/* ==========================================================================
   ZT BARBER — script.js
   Conteúdo do site + agendamento conectado à API (pasta backend/).
   Serviços, barbeiros, dias e horários vêm do banco de dados.
   O cliente agenda só com nome e WhatsApp (sem conta e sem senha).
   ========================================================================== */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------
     Endereço da API
     Rodando no seu PC (Live Server / abrindo o index.html): usa a API local.
     Quando o site for publicado, troque API_PRODUCAO pelo endereço real.
  --------------------------------------------------------------------- */
  const SLUG = "zt-barber";
  const API_LOCAL = `http://localhost:3000/api/${SLUG}`;
  const API_PRODUCAO = `/api/${SLUG}`; // ajustar no deploy (#8, #9)

  const ehLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const API_URL = ehLocal ? API_LOCAL : API_PRODUCAO;

  const DIAS_PARA_MOSTRAR = 14; // dias consultados no passo 3
  const NOME_DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  const MSG_API_FORA =
    "Não foi possível carregar a agenda agora. Tente de novo em instantes ou chame a gente no WhatsApp.";

  /* ---------------------------------------------------------------------
     Guardado neste aparelho (só conveniência, não é o banco)
     - dados do cliente, para não digitar de novo
     - agendamentos feitos daqui, para mostrar em "Seus próximos horários"
  --------------------------------------------------------------------- */
  const LS_CLIENTE = "zt_cliente";
  const LS_AGENDAMENTOS = "zt_meus_agendamentos";

  function lerLocal(chave, padrao) {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : padrao;
    } catch (e) {
      return padrao;
    }
  }
  function gravarLocal(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* modo privado */ }
  }

  /* ---------------------------------------------------------------------
     Conversa com a API
  --------------------------------------------------------------------- */
  class ErroApi extends Error {
    constructor(mensagem, status) {
      super(mensagem);
      this.status = status;
    }
  }

  async function api(caminho, opcoes = {}) {
    let resposta;
    try {
      resposta = await fetch(API_URL + caminho, {
        headers: { "Content-Type": "application/json" },
        ...opcoes,
      });
    } catch (e) {
      throw new ErroApi(MSG_API_FORA, 0); // API desligada ou sem internet
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new ErroApi(corpo.erro || MSG_API_FORA, resposta.status);
    }
    return corpo;
  }

  /* ---------------------------------------------------------------------
     Conteúdo fixo: portfólio, depoimentos, FAQ
  --------------------------------------------------------------------- */
  // fotos em img/portfolio/ (720x960, JPG). Para trocar, substitua o arquivo
  // mantendo o nome, ou edite esta lista.
  const PORTFOLIO = [
    { foto: "img/portfolio/corte-1.jpg", legenda: "Mullet texturizado com barba" },
    { foto: "img/portfolio/corte-2.jpg", legenda: "Degradê com franja" },
    { foto: "img/portfolio/corte-3.jpg", legenda: "Low fade texturizado" },
    { foto: "img/portfolio/corte-4.jpg", legenda: "Buzz cut com degradê" },
  ];

  const DEPOIMENTOS = [
    { texto: "Marquei pelo site, cheguei e já fui atendido no horário certo. Corte impecável.", autor: "Gabriel M." },
    { texto: "Entendem exatamente o que eu peço. Não troco de barbearia há 2 anos.", autor: "Diego A." },
    { texto: "Ambiente simples, sem enrolação, e o resultado sempre vem melhor do que eu esperava.", autor: "Rafael S." },
  ];

  const FAQ = [
    { pergunta: "Preciso criar conta pra agendar?", resposta: "Não. Você escolhe o serviço, o barbeiro e o horário e informa só seu nome e WhatsApp." },
    { pergunta: "Posso escolher o barbeiro?", resposta: "Sim. Você vê só os horários livres na agenda do barbeiro que escolher." },
    { pergunta: "Como cancelo ou remarco um horário?", resposta: "Chame no WhatsApp do seu barbeiro até 3 horas antes do horário marcado. Os links estão na seção de contato." },
    { pergunta: "Abrem em feriados?", resposta: "Não. Nos feriados a barbearia fica fechada, e esses dias aparecem como \"Feriado\" na hora de agendar." },
    { pergunta: "Quais as formas de pagamento?", resposta: "Dinheiro, PIX e cartão de débito ou crédito." },
  ];

  /* ---------------------------------------------------------------------
     Utilitários
  --------------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  // texto vindo da API vai sempre por textContent/escape, nunca direto no HTML
  function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function formatarPreco(valor) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatarData(dataISO) {
    const [a, m, d] = dataISO.split("-");
    return `${d}/${m}/${a}`;
  }

  function horaFim(hhmm, duracao) {
    const [h, m] = hhmm.split(":").map(Number);
    const t = h * 60 + m + duracao;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }

  function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function iniciais(nome) {
    return nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }

  function mostrarMsg(el, texto, erro) {
    el.textContent = texto;
    el.classList.toggle("is-error", !!erro);
    el.classList.toggle("is-ok", !erro);
  }

  function itemInformativo(ul, texto, classe = "lista__aviso") {
    ul.innerHTML = "";
    const li = document.createElement("li");
    li.className = classe;
    li.textContent = texto;
    ul.appendChild(li);
  }

  /* ---------------------------------------------------------------------
     Menu mobile
  --------------------------------------------------------------------- */
  const hamburger = $("hamburger");
  const mobileNav = $("mobile-nav");

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
     Seções: equipe e serviços (da API) / portfólio / depoimentos / FAQ
  --------------------------------------------------------------------- */
  let SERVICOS = [];
  let BARBEIROS = [];

  function renderizarEquipe() {
    const ul = $("lista-equipe");
    ul.innerHTML = "";
    BARBEIROS.forEach((b) => {
      const li = document.createElement("li");
      li.className = "barbeiro-card";
      li.innerHTML = `
        <div class="barbeiro-card__foto">${esc(iniciais(b.nome))}</div>
        <p class="barbeiro-card__nome">${esc(b.nome)}</p>
        <p class="barbeiro-card__especialidade">${esc(b.especialidade || "")}</p>`;
      ul.appendChild(li);
    });
  }

  function renderizarServicos() {
    const ul = $("lista-servicos");
    ul.innerHTML = "";
    SERVICOS.forEach((s) => {
      const li = document.createElement("li");
      li.className = "servico";
      li.innerHTML = `
        <div class="servico__nome">${esc(s.nome)}</div>
        <div class="servico__desc">${s.duracao_min} minutos de atendimento dedicado.</div>
        <div class="servico__meta"><span>${s.duracao_min} min</span><span class="servico__preco">${formatarPreco(s.preco)}</span></div>`;
      ul.appendChild(li);
    });
  }

  function renderizarPortfolio() {
    const ul = $("lista-portfolio");
    ul.innerHTML = "";
    PORTFOLIO.forEach(({ foto, legenda }) => {
      const li = document.createElement("li");
      li.className = "portfolio__grid-foto";
      const img = document.createElement("img");
      img.src = foto;
      img.alt = legenda;
      img.loading = "lazy";
      img.width = 720;
      img.height = 960;
      // se a foto não carregar, mostra só a legenda no lugar
      img.addEventListener("error", () => {
        li.className = "";
        li.textContent = legenda;
      });
      li.appendChild(img);
      ul.appendChild(li);
    });
  }

  function renderizarDepoimentos() {
    const ul = $("lista-depoimentos");
    ul.innerHTML = "";
    DEPOIMENTOS.forEach((d) => {
      const li = document.createElement("li");
      li.className = "depoimento";
      li.innerHTML = `
        <div class="depoimento__estrelas">★★★★★</div>
        <p class="depoimento__texto">"${esc(d.texto)}"</p>
        <p class="depoimento__autor">${esc(d.autor)}</p>`;
      ul.appendChild(li);
    });
  }

  function renderizarFaq() {
    const ul = $("lista-faq");
    ul.innerHTML = "";
    FAQ.forEach((item) => {
      const li = document.createElement("li");
      li.className = "faq-item";
      li.innerHTML = `
        <button class="faq-item__pergunta" type="button">
          <span>${esc(item.pergunta)}</span>
          <span class="faq-item__icone">+</span>
        </button>
        <div class="faq-item__resposta"><p>${esc(item.resposta)}</p></div>`;
      li.querySelector(".faq-item__pergunta").addEventListener("click", () => {
        li.classList.toggle("is-aberto");
      });
      ul.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------------
     Wizard de agendamento
  --------------------------------------------------------------------- */
  const wizardSteps = $("wizard-steps");
  const wizardServicos = $("wizard-servicos");
  const wizardBarbeiros = $("wizard-barbeiros");
  const wizardDias = $("wizard-dias");
  const wizardHorarios = $("wizard-horarios");
  const wizardResumo = $("wizard-resumo");
  const formDados = $("form-dados");
  const inputNome = $("cliente-nome");
  const inputTelefone = $("cliente-telefone");
  const btnConfirmar = $("btn-confirmar-agendamento");
  const msgAgendamento = $("msg-agendamento");
  const msgWizard = $("msg-wizard");
  const listaAgendamentos = $("lista-agendamentos");

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
    msgWizard.textContent = "";
    wizardResumo.classList.remove("is-visivel");
    formDados.classList.add("hidden");
    renderizarPassoServicos();
    irParaPasso(1);
  }

  function botaoOpcao(html, aoClicar) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = html;
    btn.addEventListener("click", aoClicar);
    li.appendChild(btn);
    return li;
  }

  // Passo 1
  function renderizarPassoServicos() {
    wizardServicos.innerHTML = "";
    SERVICOS.forEach((s) => {
      wizardServicos.appendChild(botaoOpcao(
        `<span class="op__nome">${esc(s.nome)}</span><span class="op__meta">${formatarPreco(s.preco)} · ${s.duracao_min} min</span>`,
        () => {
          estado.servico = s;
          renderizarPassoBarbeiros();
          irParaPasso(2);
        }
      ));
    });
  }

  // Passo 2
  function renderizarPassoBarbeiros() {
    wizardBarbeiros.innerHTML = "";
    BARBEIROS.forEach((b) => {
      wizardBarbeiros.appendChild(botaoOpcao(
        `<span class="op__nome">${esc(b.nome)}</span><span class="op__especialidade">${esc(b.especialidade || "")}</span>`,
        () => {
          estado.barbeiro = b;
          renderizarPassoDias();
          irParaPasso(3);
        }
      ));
    });
  }

  // Passo 3: dias vêm da API, com feriados e dias lotados sinalizados
  async function renderizarPassoDias() {
    itemInformativo(wizardDias, "Carregando dias…");
    msgWizard.textContent = "";

    let dias;
    try {
      dias = await api(
        `/dias?barbeiro_id=${estado.barbeiro.id}&servico_id=${estado.servico.id}&quantidade=${DIAS_PARA_MOSTRAR}`
      );
    } catch (e) {
      wizardDias.innerHTML = "";
      mostrarMsg(msgWizard, e.message, true);
      return;
    }

    wizardDias.innerHTML = "";
    dias
      .filter((d) => d.situacao !== "fechado") // domingo etc. nem aparecem
      .forEach((d) => {
        const disponivel = d.situacao === "aberto";
        let rotulo = "";
        if (d.situacao === "bloqueado") rotulo = /feriado/i.test(d.motivo || "") ? "Feriado" : "Fechado";
        if (d.situacao === "lotado") rotulo = "Lotado";

        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.disabled = !disponivel;
        if (!disponivel) {
          btn.classList.add("dia--indisponivel");
          if (d.motivo) btn.title = d.motivo;
        }
        const [, mes, dia] = d.data.split("-");
        btn.innerHTML = `
          <span class="dia__semana">${NOME_DIA_SEMANA[d.dia_semana]}</span>
          <span class="dia__numero">${dia}/${mes}</span>
          ${rotulo ? `<span class="dia__rotulo">${rotulo}</span>` : ""}`;
        btn.addEventListener("click", () => {
          estado.data = d.data;
          renderizarPassoHorarios();
          irParaPasso(4);
        });
        li.appendChild(btn);
        wizardDias.appendChild(li);
      });

    // avisa sobre feriados que aparecem na lista
    const feriados = dias.filter((d) => d.situacao === "bloqueado" && /feriado/i.test(d.motivo || ""));
    if (feriados.length) {
      const lista = feriados
        .map((d) => `${formatarData(d.data).slice(0, 5)} (${d.motivo.replace(/^Feriado:\s*/i, "")})`)
        .join(", ");
      mostrarMsg(msgWizard, `Fechado no feriado: ${lista}.`, false);
    }
  }

  // Passo 4: horários do dia vêm da API
  async function renderizarPassoHorarios() {
    estado.horario = null;
    wizardResumo.classList.remove("is-visivel");
    formDados.classList.add("hidden");
    msgAgendamento.textContent = "";
    itemInformativo(wizardHorarios, "Carregando horários…");

    let resposta;
    try {
      resposta = await api(
        `/horarios?barbeiro_id=${estado.barbeiro.id}&servico_id=${estado.servico.id}&data=${estado.data}`
      );
    } catch (e) {
      wizardHorarios.innerHTML = "";
      mostrarMsg(msgAgendamento, e.message, true);
      return;
    }

    wizardHorarios.innerHTML = "";
    if (resposta.horarios.length === 0) {
      itemInformativo(wizardHorarios, "Não há mais horários livres neste dia. Volte e escolha outro.");
      return;
    }
    resposta.horarios.forEach((h) => {
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

  function mostrarResumo() {
    wizardResumo.innerHTML = `
      <strong>${esc(estado.servico.nome)}</strong> com <strong>${esc(estado.barbeiro.nome)}</strong><br>
      ${formatarData(estado.data)} das <strong>${estado.horario}</strong> às ${horaFim(estado.horario, estado.servico.duracao_min)}
      · ${formatarPreco(estado.servico.preco)}`;
    wizardResumo.classList.add("is-visivel");
    formDados.classList.remove("hidden");
    msgAgendamento.textContent = "";

    const salvo = lerLocal(LS_CLIENTE, null);
    if (salvo && !inputNome.value) inputNome.value = salvo.nome || "";
    if (salvo && !inputTelefone.value) inputTelefone.value = salvo.telefone || "";
    (inputNome.value ? inputTelefone : inputNome).focus();
  }

  formDados.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!estado.horario) {
      mostrarMsg(msgAgendamento, "Escolha um horário antes de confirmar.", true);
      return;
    }
    const nome = inputNome.value.trim();
    const telefone = inputTelefone.value.trim();
    if (nome.length < 2) {
      mostrarMsg(msgAgendamento, "Informe seu nome.", true);
      inputNome.focus();
      return;
    }
    if (telefone.replace(/\D/g, "").length < 10) {
      mostrarMsg(msgAgendamento, "Informe seu WhatsApp com DDD.", true);
      inputTelefone.focus();
      return;
    }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Confirmando…";
    try {
      const criado = await api("/agendamentos", {
        method: "POST",
        body: JSON.stringify({
          barbeiro_id: estado.barbeiro.id,
          servico_id: estado.servico.id,
          data: estado.data,
          horario: estado.horario,
          nome,
          telefone,
        }),
      });

      gravarLocal(LS_CLIENTE, { nome, telefone });
      const meus = lerLocal(LS_AGENDAMENTOS, []);
      meus.push(criado);
      gravarLocal(LS_AGENDAMENTOS, meus);

      mostrarMsg(msgAgendamento, `Horário confirmado! Te esperamos dia ${formatarData(criado.data)} às ${criado.horario}.`, false);
      renderizarMeusAgendamentos();
      setTimeout(resetarWizard, 2500);
    } catch (erro) {
      // alguém pegou o horário: recarrega a lista primeiro (ela limpa a mensagem)
      if (erro.status === 409) await renderizarPassoHorarios();
      mostrarMsg(msgAgendamento, erro.message, true);
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar agendamento";
    }
  });

  /* ---------------------------------------------------------------------
     Seus próximos horários (agendados neste aparelho)
  --------------------------------------------------------------------- */
  function renderizarMeusAgendamentos() {
    const hoje = hojeISO();
    const proximos = lerLocal(LS_AGENDAMENTOS, [])
      .filter((a) => a.data >= hoje)
      .sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));

    gravarLocal(LS_AGENDAMENTOS, proximos); // limpa os que já passaram

    listaAgendamentos.innerHTML = "";
    if (proximos.length === 0) {
      itemInformativo(listaAgendamentos, "Nenhum horário marcado por este aparelho.", "vazio");
      return;
    }
    proximos.forEach((a) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${esc(a.servico)} · ${esc(a.barbeiro)}</span><span>${formatarData(a.data)} · ${esc(a.horario)}</span>`;
      listaAgendamentos.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------------
     Inicialização
  --------------------------------------------------------------------- */
  async function carregarDadosDaApi() {
    itemInformativo(wizardServicos, "Carregando serviços…");
    try {
      [SERVICOS, BARBEIROS] = await Promise.all([api("/servicos"), api("/barbeiros")]);
    } catch (e) {
      wizardServicos.innerHTML = "";
      mostrarMsg(msgWizard, e.message, true);
      itemInformativo($("lista-servicos"), "Não foi possível carregar os serviços agora.");
      itemInformativo($("lista-equipe"), "Não foi possível carregar a equipe agora.");
      return;
    }
    renderizarEquipe();
    renderizarServicos();
    resetarWizard();
  }

  function init() {
    $("ano").textContent = new Date().getFullYear();
    renderizarPortfolio();
    renderizarDepoimentos();
    renderizarFaq();
    renderizarMeusAgendamentos();
    carregarDadosDaApi();
  }

  init();
})();
