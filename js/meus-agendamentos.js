/* ==========================================================================
   ZT BARBER — meus-agendamentos.js
   Página "Meus horários": lista os agendamentos feitos neste aparelho,
   busca o status atualizado na API e deixa cancelar ou remarcar.
   Cada agendamento guarda { id, codigo }: sem o código a API não mostra nada.
   ========================================================================== */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------
     Configuração (mesma lógica do script.js)
  --------------------------------------------------------------------- */
  const SLUG = "zt-barber";
  const ehLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const API_URL = ehLocal ? `http://localhost:3000/api/${SLUG}` : `/api/${SLUG}`;
  const LS_AGENDAMENTOS = "zt_meus_agendamentos";

  const NOME_STATUS = {
    confirmado: "Confirmado",
    concluido: "Concluído",
    cancelado: "Cancelado",
    nao_compareceu: "Não compareceu",
  };

  const $ = (id) => document.getElementById(id);
  const lista = $("lista-meus");
  const msg = $("msg-meus");

  /* ---------------------------------------------------------------------
     Utilitários
  --------------------------------------------------------------------- */
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
  function esc(t) {
    return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const reais = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // "2026-10-08" -> "qui, 08/10"
  function formatarData(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    const semana = new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  }

  function mostrarMsg(texto, erro = true) {
    msg.textContent = texto;
    msg.classList.toggle("is-error", erro);
    msg.classList.toggle("is-ok", !erro);
  }

  async function api(caminho, opcoes = {}) {
    let resposta;
    try {
      resposta = await fetch(API_URL + caminho, {
        headers: { "Content-Type": "application/json" },
        ...opcoes,
      });
    } catch (e) {
      const erro = new Error("Não foi possível falar com a barbearia agora. Tente de novo em instantes.");
      erro.status = 0;
      throw erro;
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(corpo.erro || "Algo deu errado.");
      erro.status = resposta.status;
      throw erro;
    }
    return corpo;
  }

  /* ---------------------------------------------------------------------
     Carregar: para cada horário salvo, pergunta o status atual à API
  --------------------------------------------------------------------- */
  async function carregar() {
    mostrarMsg("", false);
    const salvos = lerLocal(LS_AGENDAMENTOS, []);
    if (!salvos.length) {
      lista.innerHTML = `<li class="meus__vazio">Você ainda não marcou nenhum horário por este aparelho.
        <a href="index.html#agendar">Agendar agora</a></li>`;
      return;
    }
    lista.innerHTML = `<li class="meus__vazio">Carregando…</li>`;

    const atualizados = await Promise.all(salvos.map(async (salvo) => {
      // agendamentos de antes do código secreto: só mostra o que está guardado
      if (!salvo.codigo) return { ...salvo, semCodigo: true };
      try {
        const doBanco = await api(`/agendamentos/${salvo.id}?codigo=${salvo.codigo}`);
        return { ...doBanco, codigo: salvo.codigo };
      } catch (err) {
        if (err.status === 404) return null; // não existe mais: tira da lista
        return { ...salvo, semConexao: true };
      }
    }));

    const validos = atualizados.filter(Boolean);
    // guarda de volta só o necessário (o resto vem sempre da API).
    // O status vai junto para a página inicial não listar horário cancelado.
    gravarLocal(LS_AGENDAMENTOS, validos.map(({ id, codigo, status, servico, barbeiro, data, horario, preco }) =>
      ({ id, codigo, status, servico, barbeiro, data, horario, preco })));

    if (!validos.length) {
      lista.innerHTML = `<li class="meus__vazio">Nenhum horário encontrado. <a href="index.html#agendar">Agendar agora</a></li>`;
      return;
    }
    if (validos.some((a) => a.semConexao)) {
      mostrarMsg("Não foi possível atualizar todos os horários agora. Tente de novo em instantes.");
    }

    validos.sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));
    lista.innerHTML = "";
    validos.forEach((a) => lista.appendChild(cartao(a)));
  }

  /* ---------------------------------------------------------------------
     Um cartão por agendamento
  --------------------------------------------------------------------- */
  function cartao(a) {
    const li = document.createElement("li");
    const status = a.status || "confirmado";
    li.className = `meu meu--${status}`;
    li.innerHTML = `
      <div class="meu__quando">
        <span class="meu__data">${esc(formatarData(a.data))}</span>
        <span class="meu__hora">${esc(a.horario)}</span>
      </div>
      <div class="meu__info">
        <p class="meu__servico">${esc(a.servico)}</p>
        <p class="meu__detalhe">com ${esc(a.barbeiro)}${a.preco != null ? ` · ${reais(a.preco)}` : ""}</p>
        ${a.semCodigo || a.semConexao ? "" : `<span class="meu__status meu__status--${status}">${NOME_STATUS[status] || status}</span>`}
      </div>
      <div class="meu__acoes"></div>`;

    const acoes = li.querySelector(".meu__acoes");
    if (a.semCodigo) {
      acoes.innerHTML = `<p class="meu__aviso">Para cancelar ou remarcar, chame o seu barbeiro no <a href="index.html#contato">WhatsApp</a>.</p>`;
    } else if (a.pode_cancelar) {
      acoes.innerHTML = `
        <a class="btn btn--outline" href="index.html?remarcar=${a.id}&servico=${a.servico_id}&barbeiro=${a.barbeiro_id}#agendar">Remarcar</a>
        <button type="button" class="btn btn--perigo">Cancelar</button>`;
      acoes.querySelector("button").addEventListener("click", (e) => cancelar(a, e.currentTarget));
    } else if (status === "confirmado") {
      const tel = a.barbeiro_telefone;
      const whats = tel ? `https://wa.me/${tel.startsWith("55") ? tel : "55" + tel}` : "index.html#contato";
      acoes.innerHTML = `<p class="meu__aviso">Faltam menos de ${a.antecedencia_horas || 3} horas. Para mudar, chame o seu barbeiro no
        <a href="${whats}"${a.barbeiro_telefone ? ' target="_blank" rel="noopener"' : ""}>WhatsApp</a>.</p>`;
    }
    return li;
  }

  async function cancelar(a, botao) {
    if (!confirm(`Cancelar ${a.servico} com ${a.barbeiro} em ${formatarData(a.data)} às ${a.horario}?`)) return;
    botao.disabled = true;
    try {
      await api(`/agendamentos/${a.id}/cancelar`, {
        method: "POST",
        body: JSON.stringify({ codigo: a.codigo }),
      });
      await carregar();
      mostrarMsg("Horário cancelado. Ele já está livre para outra pessoa.", false);
    } catch (err) {
      mostrarMsg(err.message);
      botao.disabled = false;
    }
  }

  /* ---------------------------------------------------------------------
     Menu mobile e ano do rodapé
  --------------------------------------------------------------------- */
  const hamburger = $("hamburger");
  const mobileNav = $("mobile-nav");
  hamburger.addEventListener("click", () => {
    const aberto = mobileNav.classList.toggle("is-open");
    hamburger.setAttribute("aria-expanded", String(aberto));
  });
  $("ano").textContent = new Date().getFullYear();

  carregar();
})();
