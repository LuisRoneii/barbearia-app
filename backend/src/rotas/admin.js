// Rotas do painel dos donos. Todas ficam sob /api/:slug/admin
// e, com exceção do login, exigem o token (exigirLogin).

import { Router } from "express";
import { pool } from "../db.js";
import { ErroHttp } from "../erros.js";
import { exigirLogin, gerarToken, senhaConfere } from "../autenticacao.js";
import {
  idValido, dataValida, horarioValido, textoValido, telefoneValido,
  buscarServico, buscarBarbeiro,
} from "../comum.js";

export const rotasAdmin = Router({ mergeParams: true });

const FORMAS_PAGAMENTO = ["pix", "dinheiro", "debito", "credito"];

/* ---------------------------------------------------------------------
   POST /admin/login   { email, senha }  ->  { token, nome, papel, barbeiro_id }
--------------------------------------------------------------------- */
rotasAdmin.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const senha = String(req.body?.senha ?? "");
  if (!email || !senha) throw new ErroHttp(400, "Informe e-mail e senha.");

  const { rows: [conta] } = await pool.query(
    `SELECT id, barbearia_id, barbeiro_id, nome, senha_hash, papel
       FROM contas_admin
      WHERE barbearia_id = $1 AND lower(email) = $2 AND ativo`,
    [req.barbearia.id, email]
  );
  // mesma mensagem para e-mail inexistente e senha errada (não entrega quais e-mails existem)
  if (!conta || !(await senhaConfere(senha, conta.senha_hash))) {
    throw new ErroHttp(401, "E-mail ou senha incorretos.");
  }

  res.json({
    token: gerarToken(conta),
    nome: conta.nome,
    papel: conta.papel,
    barbeiro_id: conta.barbeiro_id,
  });
});

// daqui para baixo, tudo exige login
rotasAdmin.use(exigirLogin);

// conta com papel "barbeiro" só enxerga a própria agenda; "dono" vê todos
function filtroBarbeiro(req) {
  return req.conta.papel === "barbeiro" ? req.conta.barbeiro_id : null;
}

/* ---------------------------------------------------------------------
   GET /admin/agenda?data=2026-10-01
   -> { data, agendamentos: [...], bloqueios: [...] }
--------------------------------------------------------------------- */
rotasAdmin.get("/agenda", async (req, res) => {
  const data = dataValida(req.query.data);
  const fuso = req.barbearia.fuso_horario;
  const soBarbeiro = filtroBarbeiro(req);

  const { rows: agendamentos } = await pool.query(
    `SELECT a.id, a.barbeiro_id, b.nome AS barbeiro, s.nome AS servico, a.servico_id,
            a.cliente_nome, a.cliente_telefone,
            to_char(a.inicio AT TIME ZONE $2, 'HH24:MI') AS inicio,
            to_char(a.fim    AT TIME ZONE $2, 'HH24:MI') AS fim,
            a.preco_cobrado, a.forma_pagamento, a.status, a.origem
       FROM agendamentos a
       JOIN barbeiros b ON b.id = a.barbeiro_id
       JOIN servicos  s ON s.id = a.servico_id
      WHERE a.barbearia_id = $1
        AND a.inicio >= ($3::date)::timestamp AT TIME ZONE $2
        AND a.inicio <  ($3::date + 1)::timestamp AT TIME ZONE $2
        AND ($4::int IS NULL OR a.barbeiro_id = $4)
      ORDER BY a.inicio, b.nome`,
    [req.barbearia.id, fuso, data, soBarbeiro]
  );

  const { rows: bloqueios } = await pool.query(
    `SELECT bl.id, bl.barbeiro_id, b.nome AS barbeiro, bl.motivo,
            to_char(bl.inicio AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI') AS inicio,
            to_char(bl.fim    AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI') AS fim
       FROM bloqueios bl
       LEFT JOIN barbeiros b ON b.id = bl.barbeiro_id
      WHERE bl.barbearia_id = $1
        AND bl.inicio < ($3::date + 1)::timestamp AT TIME ZONE $2
        AND bl.fim    > ($3::date)::timestamp AT TIME ZONE $2
        AND ($4::int IS NULL OR bl.barbeiro_id IS NULL OR bl.barbeiro_id = $4)
      ORDER BY bl.inicio`,
    [req.barbearia.id, fuso, data, soBarbeiro]
  );

  res.json({ data, agendamentos, bloqueios });
});

/* ---------------------------------------------------------------------
   PATCH /admin/agendamentos/:id
   { acao: "cancelar" | "nao_compareceu" | "reabrir" }
   { acao: "concluir", preco_cobrado: 30, forma_pagamento: "pix", servico_id?: 3 }
   servico_id é opcional: troca o serviço quando o cliente muda de ideia na cadeira.
--------------------------------------------------------------------- */
const TRANSICOES = {
  cancelar: { de: ["confirmado"], para: "cancelado" },
  nao_compareceu: { de: ["confirmado"], para: "nao_compareceu" },
  concluir: { de: ["confirmado", "concluido"], para: "concluido" },
  reabrir: { de: ["cancelado", "nao_compareceu", "concluido"], para: "confirmado" },
};

rotasAdmin.patch("/agendamentos/:id", async (req, res) => {
  const id = idValido(req.params.id, "id");
  const acao = String(req.body?.acao ?? "");
  const regra = TRANSICOES[acao];
  if (!regra) throw new ErroHttp(400, 'Campo "acao" inválido.');

  const { rows: [atual] } = await pool.query(
    "SELECT id, status, barbeiro_id, servico_id FROM agendamentos WHERE id = $1 AND barbearia_id = $2",
    [id, req.barbearia.id]
  );
  const soBarbeiro = filtroBarbeiro(req);
  if (!atual || (soBarbeiro && atual.barbeiro_id !== soBarbeiro)) {
    throw new ErroHttp(404, "Agendamento não encontrado.");
  }
  if (!regra.de.includes(atual.status)) {
    throw new ErroHttp(409, `Não dá para "${acao}" um agendamento com status "${atual.status}".`);
  }

  let preco = null;
  let forma = null;
  if (acao === "concluir") {
    preco = Number(req.body?.preco_cobrado);
    if (!Number.isFinite(preco) || preco < 0 || preco > 10000) {
      throw new ErroHttp(400, 'Campo "preco_cobrado" inválido.');
    }
    forma = String(req.body?.forma_pagamento ?? "");
    if (!FORMAS_PAGAMENTO.includes(forma)) {
      throw new ErroHttp(400, `Campo "forma_pagamento" deve ser: ${FORMAS_PAGAMENTO.join(", ")}.`);
    }
  }

  // troca de serviço: o início não muda, o fim é recalculado pela nova duração
  let servico = null;
  if (acao === "concluir" && req.body?.servico_id != null) {
    const servicoId = idValido(req.body.servico_id, "servico_id");
    if (servicoId !== atual.servico_id) {
      servico = await buscarServico(pool, req.barbearia.id, servicoId);
    }
  }

  // reabrir um cancelado pode esbarrar em outro agendamento que ocupou o horário:
  // a constraint do banco recusa e o tratarErros devolve 409
  let atualizado;
  try {
    ({ rows: [atualizado] } = await pool.query(
      `UPDATE agendamentos
          SET status = $1::varchar,
              preco_cobrado   = COALESCE($2::numeric, preco_cobrado),
              forma_pagamento = CASE WHEN $1::varchar = 'concluido' THEN $3::varchar ELSE NULL END,
              servico_id      = COALESCE($5::int, servico_id),
              fim             = CASE WHEN $6::int IS NULL THEN fim
                                     ELSE inicio + make_interval(mins => $6::int) END
        WHERE id = $4
        RETURNING id, status, preco_cobrado, forma_pagamento, servico_id`,
      [regra.para, preco, forma, id, servico?.id ?? null, servico?.duracao_min ?? null]
    ));
  } catch (err) {
    // serviço mais longo que invade o horário do próximo cliente do mesmo barbeiro
    if (err.code === "23P01" && servico) {
      throw new ErroHttp(409,
        `"${servico.nome}" (${servico.duracao_min} min) não cabe: bate com o próximo cliente. ` +
        "Mantenha o serviço marcado e ajuste só o valor.");
    }
    throw err;
  }
  res.json(atualizado);
});

/* ---------------------------------------------------------------------
   POST /admin/encaixe
   { barbeiro_id, servico_id, nome, telefone?, data, horario }
   Cliente que chegou sem marcar: ocupa o horário no site na hora.
--------------------------------------------------------------------- */
rotasAdmin.post("/encaixe", async (req, res) => {
  const corpo = req.body ?? {};
  const barbeiroId = idValido(corpo.barbeiro_id, "barbeiro_id");
  const servicoId = idValido(corpo.servico_id, "servico_id");
  const data = dataValida(corpo.data);
  const horario = horarioValido(corpo.horario);
  const nome = textoValido(corpo.nome, "nome", 2, 150);
  const telefone = corpo.telefone ? telefoneValido(corpo.telefone) : null;

  const soBarbeiro = filtroBarbeiro(req);
  if (soBarbeiro && soBarbeiro !== barbeiroId) {
    throw new ErroHttp(403, "Você só pode lançar encaixe na sua agenda.");
  }
  const barbeiro = await buscarBarbeiro(pool, req.barbearia.id, barbeiroId);
  const servico = await buscarServico(pool, req.barbearia.id, servicoId);

  let clienteId = null;
  if (telefone) {
    const { rows: [c] } = await pool.query(
      `INSERT INTO clientes (barbearia_id, nome, telefone) VALUES ($1, $2, $3)
       ON CONFLICT (barbearia_id, telefone) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id`,
      [req.barbearia.id, nome, telefone]
    );
    clienteId = c.id;
  }

  const { rows: [novo] } = await pool.query(
    `INSERT INTO agendamentos
       (barbearia_id, cliente_id, cliente_nome, cliente_telefone, barbeiro_id, servico_id,
        inicio, fim, preco_cobrado, origem)
     VALUES ($1, $2, $3, $4, $5, $6,
             ($7::date + $8::time) AT TIME ZONE $9,
             (($7::date + $8::time) AT TIME ZONE $9) + make_interval(mins => $10),
             $11, 'encaixe')
     RETURNING id`,
    [req.barbearia.id, clienteId, nome, telefone, barbeiroId, servicoId,
      data, horario, req.barbearia.fuso_horario, servico.duracao_min, servico.preco]
  );

  res.status(201).json({ id: novo.id, barbeiro: barbeiro.nome, servico: servico.nome, data, horario });
});

/* ---------------------------------------------------------------------
   Bloqueios (folga, feriado, compromisso)
--------------------------------------------------------------------- */

// GET /admin/bloqueios  -> bloqueios que ainda não terminaram
rotasAdmin.get("/bloqueios", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT bl.id, bl.barbeiro_id, b.nome AS barbeiro, bl.motivo,
            to_char(bl.inicio AT TIME ZONE $2, 'YYYY-MM-DD') AS data_inicio,
            to_char(bl.inicio AT TIME ZONE $2, 'HH24:MI')    AS hora_inicio,
            -- bloqueio de dia inteiro termina às 00:00 do dia seguinte:
            -- mostramos o último dia bloqueado, que é o que a pessoa entende
            to_char((bl.fim AT TIME ZONE $2) - interval '1 minute', 'YYYY-MM-DD') AS data_fim,
            to_char(bl.fim    AT TIME ZONE $2, 'HH24:MI')    AS hora_fim,
            (to_char(bl.inicio AT TIME ZONE $2, 'HH24:MI') = '00:00'
              AND to_char(bl.fim AT TIME ZONE $2, 'HH24:MI') = '00:00') AS dia_inteiro
       FROM bloqueios bl
       LEFT JOIN barbeiros b ON b.id = bl.barbeiro_id
      WHERE bl.barbearia_id = $1 AND bl.fim > now()
      ORDER BY bl.inicio`,
    [req.barbearia.id, req.barbearia.fuso_horario]
  );
  res.json(rows);
});

// POST /admin/bloqueios
// { barbeiro_id (null = barbearia toda), data_inicio, data_fim?, hora_inicio?, hora_fim?, motivo }
// sem horas = dia(s) inteiro(s)
rotasAdmin.post("/bloqueios", async (req, res) => {
  const corpo = req.body ?? {};
  const barbeiroId = corpo.barbeiro_id ? idValido(corpo.barbeiro_id, "barbeiro_id") : null;
  const dataInicio = dataValida(corpo.data_inicio);
  const dataFim = corpo.data_fim ? dataValida(corpo.data_fim) : dataInicio;
  const motivo = textoValido(corpo.motivo, "motivo", 2, 150);
  const diaInteiro = !corpo.hora_inicio && !corpo.hora_fim;
  const horaInicio = diaInteiro ? "00:00" : horarioValido(corpo.hora_inicio);
  const horaFim = diaInteiro ? null : horarioValido(corpo.hora_fim);

  const soBarbeiro = filtroBarbeiro(req);
  if (soBarbeiro && barbeiroId !== soBarbeiro) {
    throw new ErroHttp(403, "Você só pode bloquear a sua agenda.");
  }
  if (barbeiroId) await buscarBarbeiro(pool, req.barbearia.id, barbeiroId);

  const fuso = req.barbearia.fuso_horario;
  const { rows: [novo] } = await pool.query(
    `INSERT INTO bloqueios (barbearia_id, barbeiro_id, inicio, fim, motivo)
     VALUES ($1, $2,
             ($3::date + $4::time) AT TIME ZONE $7,
             CASE WHEN $5::time IS NULL
                  THEN ($6::date + 1)::timestamp AT TIME ZONE $7
                  ELSE ($6::date + $5::time) AT TIME ZONE $7 END,
             $8)
     RETURNING id, inicio, fim`,
    [req.barbearia.id, barbeiroId, dataInicio, horaInicio, horaFim, dataFim, fuso, motivo]
  ).catch((err) => {
    if (err.code === "23514") throw new ErroHttp(400, "O fim do bloqueio precisa ser depois do início.");
    throw err;
  });

  // agendamentos já marcados dentro do bloqueio: o dono precisa avisar esses clientes
  const { rows: conflitos } = await pool.query(
    `SELECT a.id, b.nome AS barbeiro, a.cliente_nome, a.cliente_telefone,
            to_char(a.inicio AT TIME ZONE $4, 'DD/MM HH24:MI') AS quando
       FROM agendamentos a
       JOIN barbeiros b ON b.id = a.barbeiro_id
      WHERE a.barbearia_id = $1 AND a.status = 'confirmado'
        AND a.inicio < $3 AND a.fim > $2
        AND ($5::int IS NULL OR a.barbeiro_id = $5)
      ORDER BY a.inicio`,
    [req.barbearia.id, novo.inicio, novo.fim, fuso, barbeiroId]
  );

  res.status(201).json({ id: novo.id, conflitos });
});

// DELETE /admin/bloqueios/:id
rotasAdmin.delete("/bloqueios/:id", async (req, res) => {
  const id = idValido(req.params.id, "id");
  const soBarbeiro = filtroBarbeiro(req);
  const { rowCount } = await pool.query(
    `DELETE FROM bloqueios
      WHERE id = $1 AND barbearia_id = $2
        AND ($3::int IS NULL OR barbeiro_id = $3)`,
    [id, req.barbearia.id, soBarbeiro]
  );
  if (!rowCount) throw new ErroHttp(404, "Bloqueio não encontrado.");
  res.status(204).end();
});

/* ---------------------------------------------------------------------
   GET /admin/faturamento?mes=2026-10
   -> { mes, barbeiros: [{ barbeiro, atendimentos, total, por_forma, faltas, cancelados }], total }
--------------------------------------------------------------------- */
rotasAdmin.get("/faturamento", async (req, res) => {
  const mes = String(req.query.mes ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new ErroHttp(400, 'Campo "mes" deve estar no formato AAAA-MM.');
  }
  const fuso = req.barbearia.fuso_horario;
  const soBarbeiro = filtroBarbeiro(req);

  const { rows } = await pool.query(
    `WITH periodo AS (
       SELECT ($2 || '-01')::date::timestamp AT TIME ZONE $3                          AS ini,
              (($2 || '-01')::date + interval '1 month')::timestamp AT TIME ZONE $3  AS fim
     )
     SELECT b.id AS barbeiro_id, b.nome AS barbeiro,
            COUNT(a.id) FILTER (WHERE a.status = 'concluido')                               AS atendimentos,
            COALESCE(SUM(a.preco_cobrado) FILTER (WHERE a.status = 'concluido'), 0)         AS total,
            COALESCE(SUM(a.preco_cobrado) FILTER (WHERE a.status = 'concluido' AND a.forma_pagamento = 'pix'), 0)      AS pix,
            COALESCE(SUM(a.preco_cobrado) FILTER (WHERE a.status = 'concluido' AND a.forma_pagamento = 'dinheiro'), 0) AS dinheiro,
            COALESCE(SUM(a.preco_cobrado) FILTER (WHERE a.status = 'concluido' AND a.forma_pagamento = 'debito'), 0)   AS debito,
            COALESCE(SUM(a.preco_cobrado) FILTER (WHERE a.status = 'concluido' AND a.forma_pagamento = 'credito'), 0)  AS credito,
            COUNT(a.id) FILTER (WHERE a.status = 'nao_compareceu')                          AS faltas,
            COUNT(a.id) FILTER (WHERE a.status = 'cancelado')                               AS cancelados,
            COUNT(a.id) FILTER (WHERE a.status = 'confirmado')                              AS pendentes
       FROM barbeiros b
       CROSS JOIN periodo p
       LEFT JOIN agendamentos a
              ON a.barbeiro_id = b.id AND a.inicio >= p.ini AND a.inicio < p.fim
      WHERE b.barbearia_id = $1 AND b.ativo
        AND ($4::int IS NULL OR b.id = $4)
      GROUP BY b.id, b.nome
      ORDER BY b.nome`,
    [req.barbearia.id, mes, fuso, soBarbeiro]
  );

  const barbeiros = rows.map((r) => ({
    barbeiro_id: r.barbeiro_id,
    barbeiro: r.barbeiro,
    atendimentos: Number(r.atendimentos),
    total: r.total,
    por_forma: { pix: r.pix, dinheiro: r.dinheiro, debito: r.debito, credito: r.credito },
    faltas: Number(r.faltas),
    cancelados: Number(r.cancelados),
    pendentes: Number(r.pendentes),
  }));
  const total = barbeiros.reduce((soma, b) => soma + b.total, 0);

  res.json({ mes, barbeiros, total });
});
