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
import { limiteLogin } from "../limites.js";

export const rotasAdmin = Router({ mergeParams: true });

const FORMAS_PAGAMENTO = ["pix", "dinheiro", "debito", "credito"];

// ao concluir também vale "plano": desconta 1 visita do plano mensal e cobra R$ 0
const FORMAS_CONCLUIR = [...FORMAS_PAGAMENTO, "plano"];

/* ---------------------------------------------------------------------
   POST /admin/login   { email, senha }  ->  { token, nome, papel, barbeiro_id }
--------------------------------------------------------------------- */
rotasAdmin.post("/login", limiteLogin, async (req, res) => {
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
    `SELECT id, status, barbeiro_id, servico_id, cliente_id,
            to_char(inicio AT TIME ZONE $3, 'YYYY-MM-DD') AS dia
       FROM agendamentos WHERE id = $1 AND barbearia_id = $2`,
    [id, req.barbearia.id, req.barbearia.fuso_horario]
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
    forma = String(req.body?.forma_pagamento ?? "");
    if (!FORMAS_CONCLUIR.includes(forma)) {
      throw new ErroHttp(400, `Campo "forma_pagamento" deve ser: ${FORMAS_CONCLUIR.join(", ")}.`);
    }
    // no plano o dinheiro já entrou na venda: o atendimento fica com R$ 0
    preco = forma === "plano" ? 0 : Number(req.body?.preco_cobrado);
    if (!Number.isFinite(preco) || preco < 0 || preco > 10000) {
      throw new ErroHttp(400, 'Campo "preco_cobrado" inválido.');
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

  // pagamento com plano: escolhe de qual pagamento sai a visita
  let assinaturaId = null;
  if (forma === "plano") {
    assinaturaId = await escolherAssinatura(req.barbearia.id, atual, servico?.id ?? atual.servico_id);
  }

  // reabrir um cancelado pode esbarrar em outro agendamento que ocupou o horário:
  // a constraint do banco recusa e o tratarErros devolve 409
  let atualizado;
  try {
    ({ rows: [atualizado] } = await pool.query(
      `UPDATE agendamentos
              SET status = $1::varchar,
              preco_cobrado   = CASE WHEN $2::numeric IS NOT NULL THEN $2::numeric
                                      -- saiu do plano (desfazer): volta o preço do serviço
                                      WHEN forma_pagamento = 'plano'
                                        THEN (SELECT s.preco FROM servicos s WHERE s.id = agendamentos.servico_id)
                                      ELSE preco_cobrado END,
              forma_pagamento = CASE WHEN $1::varchar = 'concluido' THEN $3::varchar ELSE NULL END,
              assinatura_id   = CASE WHEN $1::varchar = 'concluido' THEN $7::int ELSE NULL END,
              servico_id      = COALESCE($5::int, servico_id),
              fim             = CASE WHEN $6::int IS NULL THEN fim
                                     ELSE inicio + make_interval(mins => $6::int) END
        WHERE id = $4
        RETURNING id, status, preco_cobrado, forma_pagamento, servico_id, assinatura_id`,
      [regra.para, preco, forma, id, servico?.id ?? null, servico?.duracao_min ?? null, assinaturaId]
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

// Pagamento de plano mais antigo que ainda tem visita e vale para este atendimento:
// mesmo cliente, mesmo barbeiro, dentro da validade e com o serviço incluído no plano.
async function escolherAssinatura(barbeariaId, agendamento, servicoId) {
  if (!agendamento.cliente_id) {
    throw new ErroHttp(409, "Atendimento sem cliente cadastrado (encaixe sem WhatsApp) não pode usar plano.");
  }
  const { rows: [assinatura] } = await pool.query(
    `SELECT a.id
       FROM assinaturas a
       JOIN planos p          ON p.id = a.plano_id
       JOIN plano_servicos ps ON ps.plano_id = a.plano_id AND ps.servico_id = $4
      WHERE a.barbearia_id = $1 AND a.cliente_id = $2 AND a.barbeiro_id = $3
        AND $5::date BETWEEN a.pago_em AND a.valido_ate
        AND (SELECT COUNT(*) FROM agendamentos ag
              WHERE ag.assinatura_id = a.id AND ag.status = 'concluido'
                AND ag.id <> $6) < p.visitas_por_pagamento
      ORDER BY a.pago_em
      LIMIT 1`,
    [barbeariaId, agendamento.cliente_id, agendamento.barbeiro_id, servicoId,
      agendamento.dia, agendamento.id]
  );
  if (!assinatura) {
    throw new ErroHttp(409,
      "Esse cliente não tem visita de plano válida com este barbeiro para este serviço.");
  }
  return assinatura.id;
}

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
   Planos mensais (#19)
--------------------------------------------------------------------- */

// GET /admin/planos  -> planos à venda e em quais serviços cada um vale
rotasAdmin.get("/planos", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.valor, p.visitas_por_pagamento, p.validade_meses,
            array_agg(s.nome ORDER BY s.id) AS servicos
       FROM planos p
       JOIN plano_servicos ps ON ps.plano_id = p.id
       JOIN servicos s        ON s.id = ps.servico_id
      WHERE p.barbearia_id = $1 AND p.ativo
      GROUP BY p.id
      ORDER BY p.valor`,
    [req.barbearia.id]
  );
  res.json(rows);
});

// POST /admin/assinaturas  { plano_id, barbeiro_id, nome, telefone, forma_pagamento }
// vende o plano hoje (só do dia 1 ao 5); cria o cliente se ele ainda não existe
rotasAdmin.post("/assinaturas", async (req, res) => {
  const corpo = req.body ?? {};
  const planoId = idValido(corpo.plano_id, "plano_id");
  const barbeiroId = idValido(corpo.barbeiro_id, "barbeiro_id");
  const nome = textoValido(corpo.nome, "nome", 2, 150);
  const telefone = telefoneValido(corpo.telefone);
  const forma = String(corpo.forma_pagamento ?? "");
  if (!FORMAS_PAGAMENTO.includes(forma)) {
    throw new ErroHttp(400, `Campo "forma_pagamento" deve ser: ${FORMAS_PAGAMENTO.join(", ")}.`);
  }

  const soBarbeiro = filtroBarbeiro(req);
  if (soBarbeiro && soBarbeiro !== barbeiroId) {
    throw new ErroHttp(403, "Você só pode vender plano seu.");
  }
  await buscarBarbeiro(pool, req.barbearia.id, barbeiroId);

  const { rows: [plano] } = await pool.query(
    "SELECT id, nome, valor, validade_meses FROM planos WHERE id = $1 AND barbearia_id = $2 AND ativo",
    [planoId, req.barbearia.id]
  );
  if (!plano) throw new ErroHttp(404, "Plano não encontrado.");

  const { rows: [cliente] } = await pool.query(
    `INSERT INTO clientes (barbearia_id, nome, telefone) VALUES ($1, $2, $3)
     ON CONFLICT (barbearia_id, telefone) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
    [req.barbearia.id, nome, telefone]
  );

  // "hoje" é no fuso da barbearia, não no do servidor
  const fuso = req.barbearia.fuso_horario;
  const { rows: [jaPagou] } = await pool.query(
    `SELECT 1 FROM assinaturas
      WHERE barbearia_id = $1 AND cliente_id = $2
        AND date_trunc('month', pago_em) = date_trunc('month', (now() AT TIME ZONE $3)::date)`,
    [req.barbearia.id, cliente.id, fuso]
  );
  if (jaPagou) throw new ErroHttp(409, "Esse cliente já pagou o plano deste mês.");

  const { rows: [nova] } = await pool.query(
    `INSERT INTO assinaturas
       (barbearia_id, cliente_id, barbeiro_id, plano_id, pago_em, valor, forma_pagamento, valido_ate)
     VALUES ($1, $2, $3, $4, (now() AT TIME ZONE $7)::date, $5, $6,
             ((now() AT TIME ZONE $7)::date + make_interval(months => $8))::date)
     RETURNING id, to_char(pago_em, 'YYYY-MM-DD') AS pago_em, to_char(valido_ate, 'YYYY-MM-DD') AS valido_ate`,
    [req.barbearia.id, cliente.id, barbeiroId, plano.id, plano.valor, forma, fuso, plano.validade_meses]
  ).catch((err) => {
    // a regra "só do dia 1 ao 5" está no próprio banco (CHECK da tabela assinaturas)
    if (err.constraint === "assinaturas_pago_em_check") {
      throw new ErroHttp(409, "O plano só pode ser vendido do dia 1 ao dia 5 do mês.");
    }
    throw err;
  });

  res.status(201).json({ id: nova.id, cliente: nome, plano: plano.nome, valor: plano.valor,
    pago_em: nova.pago_em, valido_ate: nova.valido_ate });
});

// GET /admin/assinaturas?telefone=41999999999
// -> saldo do cliente: pagamentos ainda válidos e quantas visitas sobram em cada um
rotasAdmin.get("/assinaturas", async (req, res) => {
  const telefone = telefoneValido(req.query.telefone);
  const { rows } = await pool.query(
    `SELECT a.id, p.nome AS plano, a.barbeiro_id, b.nome AS barbeiro,
            to_char(a.pago_em, 'YYYY-MM-DD')    AS pago_em,
            to_char(a.valido_ate, 'YYYY-MM-DD') AS valido_ate,
            p.visitas_por_pagamento - COUNT(ag.id) AS restantes
       FROM assinaturas a
       JOIN clientes c       ON c.id = a.cliente_id
       JOIN planos p         ON p.id = a.plano_id
       JOIN barbeiros b      ON b.id = a.barbeiro_id
       LEFT JOIN agendamentos ag ON ag.assinatura_id = a.id AND ag.status = 'concluido'
      WHERE a.barbearia_id = $1 AND c.telefone = $2
        AND a.valido_ate >= (now() AT TIME ZONE $3)::date
        AND ($4::int IS NULL OR a.barbeiro_id = $4)
      GROUP BY a.id, p.nome, p.visitas_por_pagamento, b.nome
      ORDER BY a.pago_em`,
    [req.barbearia.id, telefone, req.barbearia.fuso_horario, filtroBarbeiro(req)]
  );
  const pagamentos = rows.map((r) => ({ ...r, restantes: Number(r.restantes) }));
  const visitas = pagamentos.reduce((soma, p) => soma + p.restantes, 0);
  res.json({ telefone, visitas, pagamentos });
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
            COUNT(a.id) FILTER (WHERE a.status = 'concluido' AND a.forma_pagamento = 'plano')   AS visitas_plano,
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

  // planos vendidos no mês: o valor inteiro entra para quem vendeu, no dia da venda
  const { rows: vendas } = await pool.query(
    `SELECT a.barbeiro_id, p.nome AS plano, a.forma_pagamento,
            COUNT(*)::int AS quantidade, SUM(a.valor) AS valor
       FROM assinaturas a
       JOIN planos p ON p.id = a.plano_id
      WHERE a.barbearia_id = $1
        AND a.pago_em >= ($2 || '-01')::date
        AND a.pago_em <  ($2 || '-01')::date + interval '1 month'
        AND ($3::int IS NULL OR a.barbeiro_id = $3)
      GROUP BY a.barbeiro_id, p.nome, a.forma_pagamento`,
    [req.barbearia.id, mes, soBarbeiro]
  );

  const barbeiros = rows.map((r) => {
    const b = {
      barbeiro_id: r.barbeiro_id,
      barbeiro: r.barbeiro,
      atendimentos: Number(r.atendimentos),
      total: r.total,
      por_forma: { pix: r.pix, dinheiro: r.dinheiro, debito: r.debito, credito: r.credito },
      visitas_plano: Number(r.visitas_plano),
      planos: { vendidos: 0, total: 0, por_plano: {} },
      faltas: Number(r.faltas),
      cancelados: Number(r.cancelados),
      pendentes: Number(r.pendentes),
    };
    for (const v of vendas.filter((v) => v.barbeiro_id === r.barbeiro_id)) {
      const item = (b.planos.por_plano[v.plano] ??= { quantidade: 0, valor: 0 });
      item.quantidade += v.quantidade;
      item.valor += v.valor;
      b.planos.vendidos += v.quantidade;
      b.planos.total += v.valor;
      b.por_forma[v.forma_pagamento] += v.valor;
      b.total += v.valor;
    }
    return b;
  });
  const total = barbeiros.reduce((soma, b) => soma + b.total, 0);

  res.json({ mes, barbeiros, total });
});
