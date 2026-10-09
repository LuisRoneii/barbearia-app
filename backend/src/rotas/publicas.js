// Rotas públicas (sem login): o que o cliente usa para agendar pelo site.
// Todas ficam sob /api/:slug, ex: /api/zt-barber/servicos

import { Router } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";
import { ErroHttp } from "../erros.js";
import { calcularHorariosLivres, paraMinutos } from "../agenda.js";
import {
  idValido, dataValida, horarioValido, textoValido, telefoneValido,
  buscarServico, buscarBarbeiro,
} from "../comum.js";
import { limiteAgendamento, MAX_AGENDAMENTOS_FUTUROS } from "../limites.js";

const DIAS_MAX_ANTECEDENCIA = 30; // até quantos dias à frente dá para agendar

export const rotasPublicas = Router({ mergeParams: true });

/* ---------------------------------------------------------------------
   Código secreto do agendamento (#25)
   Quem agenda recebe um código aleatório. Só com ele dá para ver,
   cancelar ou remarcar o horário: o id sozinho não basta.
--------------------------------------------------------------------- */
function codigoValido(valor) {
  const codigo = String(valor ?? "");
  // mesma resposta de "não existe": não entrega se o id existe ou não
  if (!/^[a-f0-9]{32}$/.test(codigo)) throw new ErroHttp(404, "Agendamento não encontrado.");
  return codigo;
}

// agendamento do cliente, conferindo id + código. Já diz se ainda dá para cancelar.
async function buscarDoCliente(db, barbearia, id, codigo) {
  const { rows: [ag] } = await db.query(
    `SELECT a.id, a.status, a.servico_id, s.nome AS servico, a.barbeiro_id, b.nome AS barbeiro,
            b.telefone AS barbeiro_telefone, a.preco_cobrado AS preco,
            to_char(a.inicio AT TIME ZONE $4, 'YYYY-MM-DD') AS data,
            to_char(a.inicio AT TIME ZONE $4, 'HH24:MI')    AS horario,
            ba.antecedencia_cancelamento_horas             AS antecedencia_horas,
            (a.status = 'confirmado'
              AND a.inicio - make_interval(hours => ba.antecedencia_cancelamento_horas) > now()) AS pode_cancelar
       FROM agendamentos a
       JOIN servicos s    ON s.id = a.servico_id
       JOIN barbeiros b   ON b.id = a.barbeiro_id
       JOIN barbearias ba ON ba.id = a.barbearia_id
      WHERE a.id = $1 AND a.barbearia_id = $2 AND a.codigo = $3`,
    [id, barbearia.id, codigo, barbearia.fuso_horario]
  );
  if (!ag) throw new ErroHttp(404, "Agendamento não encontrado.");
  return ag;
}

// cancela pelo cliente: só confirmado e até X horas antes (regra da barbearia)
async function cancelarDoCliente(db, barbearia, id, codigo) {
  const ag = await buscarDoCliente(db, barbearia, id, codigo);
  if (ag.status !== "confirmado") {
    throw new ErroHttp(409, "Esse horário não está mais confirmado.");
  }
  if (!ag.pode_cancelar) {
    throw new ErroHttp(409,
      `Só dá para cancelar ou remarcar até ${ag.antecedencia_horas} horas antes. ` +
      "Chame o seu barbeiro no WhatsApp.");
  }
  const { rowCount } = await db.query(
    "UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 AND status = 'confirmado'",
    [ag.id]
  );
  // 0 linhas: outra requisição cancelou no mesmo instante (clique duplo em "remarcar",
  // duas abas). Sem esse erro, a remarcação seguiria e criaria um segundo horário.
  if (rowCount === 0) {
    throw new ErroHttp(409, "Esse horário não está mais confirmado.");
  }
  return ag;
}

/**
 * Horários livres de um barbeiro num dia, para um serviço de `duracao` minutos.
 * Junta: expediente do dia + agendamentos + bloqueios (feriado, folga).
 */
async function horariosDoDia(db, barbearia, barbeiroId, duracao, data) {
  const fuso = barbearia.fuso_horario;

  // situação da data em relação a "agora" no fuso da barbearia
  const { rows: [info] } = await db.query(
    `SELECT ($1::date - (now() AT TIME ZONE $2)::date)                     AS dias_ate,
            EXTRACT(DOW FROM $1::date)::int                                 AS dia_semana,
            floor(EXTRACT(EPOCH FROM (now() - ($1::date)::timestamp AT TIME ZONE $2)) / 60)::int
                                                                            AS minuto_atual`,
    [data, fuso]
  );
  if (info.dias_ate < 0 || info.dias_ate > DIAS_MAX_ANTECEDENCIA) return [];

  // expediente: se o barbeiro tem horário próprio, usa o dele; senão, o da barbearia
  const { rows: linhasExpediente } = await db.query(
    `SELECT barbeiro_id, hora_inicio, hora_fim
       FROM expediente
      WHERE barbearia_id = $1 AND dia_semana = $2
        AND (barbeiro_id IS NULL OR barbeiro_id = $3)
      ORDER BY hora_inicio`,
    [barbearia.id, info.dia_semana, barbeiroId]
  );
  const proprios = linhasExpediente.filter((l) => l.barbeiro_id !== null);
  const turnos = (proprios.length ? proprios : linhasExpediente).map((l) => ({
    ini: paraMinutos(l.hora_inicio),
    fim: paraMinutos(l.hora_fim),
  }));
  if (turnos.length === 0) return []; // dia fechado

  // agendamentos e bloqueios que encostam no dia, recortados para [00:00, 24:00)
  const { rows: ocupados } = await db.query(
    `WITH dia AS (
       SELECT ($1::date)::timestamp AT TIME ZONE $2       AS ini,
              ($1::date + 1)::timestamp AT TIME ZONE $2   AS fim
     ),
     periodos AS (
       SELECT inicio, fim FROM agendamentos
        WHERE barbeiro_id = $3 AND status <> 'cancelado'
       UNION ALL
       SELECT inicio, fim FROM bloqueios
        WHERE barbearia_id = $4 AND (barbeiro_id IS NULL OR barbeiro_id = $3)
     )
     SELECT floor(EXTRACT(EPOCH FROM (GREATEST(p.inicio, dia.ini) - dia.ini)) / 60)::int AS ini,
            ceil (EXTRACT(EPOCH FROM (LEAST(p.fim, dia.fim)      - dia.ini)) / 60)::int AS fim
       FROM periodos p, dia
      WHERE p.inicio < dia.fim AND p.fim > dia.ini`,
    [data, fuso, barbeiroId, barbearia.id]
  );

  return calcularHorariosLivres({
    turnos,
    ocupados,
    duracao,
    minutoAtual: info.dias_ate === 0 ? info.minuto_atual : null,
  });
}

/* ---------------------------------------------------------------------
   GET /api/:slug/servicos
--------------------------------------------------------------------- */
rotasPublicas.get("/servicos", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nome, duracao_min, preco
       FROM servicos
      WHERE barbearia_id = $1 AND ativo
      ORDER BY id`,
    [req.barbearia.id]
  );
  res.json(rows);
});

/* ---------------------------------------------------------------------
   GET /api/:slug/barbeiros
--------------------------------------------------------------------- */
rotasPublicas.get("/barbeiros", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nome, especialidade, foto_url
       FROM barbeiros
      WHERE barbearia_id = $1 AND ativo
      ORDER BY id`,
    [req.barbearia.id]
  );
  res.json(rows);
});

/* ---------------------------------------------------------------------
   GET /api/:slug/horarios?barbeiro_id=1&servico_id=1&data=2026-09-29
   -> { data, horarios: ["09:00", "09:30", ...] }
--------------------------------------------------------------------- */
rotasPublicas.get("/horarios", async (req, res) => {
  const barbeiroId = idValido(req.query.barbeiro_id, "barbeiro_id");
  const servicoId = idValido(req.query.servico_id, "servico_id");
  const data = dataValida(req.query.data);

  await buscarBarbeiro(pool, req.barbearia.id, barbeiroId);
  const servico = await buscarServico(pool, req.barbearia.id, servicoId);
  const horarios = await horariosDoDia(pool, req.barbearia, barbeiroId, servico.duracao_min, data);

  res.json({ data, horarios });
});

/* ---------------------------------------------------------------------
   GET /api/:slug/dias?barbeiro_id=1&servico_id=1&quantidade=14
   Próximos dias, a partir de hoje, com a situação de cada um:
   -> [{ data, dia_semana, situacao, horarios_livres, motivo }]
   situacao: "aberto" | "lotado" | "fechado" (dia sem expediente) | "bloqueado" (feriado, folga)
--------------------------------------------------------------------- */
const QUANTIDADE_DIAS_PADRAO = 14;

function somarDias(dataISO, dias) {
  const [a, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

rotasPublicas.get("/dias", async (req, res) => {
  const barbeiroId = idValido(req.query.barbeiro_id, "barbeiro_id");
  const servicoId = idValido(req.query.servico_id, "servico_id");
  const quantidade = req.query.quantidade === undefined
    ? QUANTIDADE_DIAS_PADRAO
    : Number(req.query.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > DIAS_MAX_ANTECEDENCIA) {
    throw new ErroHttp(400, `Campo "quantidade" deve ser entre 1 e ${DIAS_MAX_ANTECEDENCIA}.`);
  }

  await buscarBarbeiro(pool, req.barbearia.id, barbeiroId);
  const servico = await buscarServico(pool, req.barbearia.id, servicoId);
  const fuso = req.barbearia.fuso_horario;

  const { rows: [{ hoje }] } = await pool.query(
    "SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS hoje",
    [fuso]
  );
  const ultimo = somarDias(hoje, quantidade - 1);

  // dias em que um bloqueio cobre o dia inteiro (feriado, folga): guarda o motivo
  const { rows: bloqueados } = await pool.query(
    `SELECT to_char(d::date, 'YYYY-MM-DD') AS data, MIN(b.motivo) AS motivo
       FROM generate_series($1::date, $2::date, interval '1 day') AS d
       JOIN bloqueios b
         ON b.barbearia_id = $3
        AND (b.barbeiro_id IS NULL OR b.barbeiro_id = $4)
        AND b.inicio <= (d::date)::timestamp AT TIME ZONE $5
        AND b.fim    >= (d::date + 1)::timestamp AT TIME ZONE $5
      GROUP BY d`,
    [hoje, ultimo, req.barbearia.id, barbeiroId, fuso]
  );
  const motivoPorData = new Map(bloqueados.map((b) => [b.data, b.motivo]));

  const { rows: diasComExpediente } = await pool.query(
    `SELECT DISTINCT dia_semana FROM expediente
      WHERE barbearia_id = $1 AND (barbeiro_id IS NULL OR barbeiro_id = $2)`,
    [req.barbearia.id, barbeiroId]
  );
  const abreNoDia = new Set(diasComExpediente.map((l) => l.dia_semana));

  const dias = [];
  for (let i = 0; i < quantidade; i++) {
    const data = somarDias(hoje, i);
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();

    if (!abreNoDia.has(diaSemana)) {
      dias.push({ data, dia_semana: diaSemana, situacao: "fechado", horarios_livres: 0, motivo: null });
      continue;
    }
    if (motivoPorData.has(data)) {
      dias.push({ data, dia_semana: diaSemana, situacao: "bloqueado", horarios_livres: 0, motivo: motivoPorData.get(data) });
      continue;
    }
    const livres = await horariosDoDia(pool, req.barbearia, barbeiroId, servico.duracao_min, data);
    dias.push({
      data,
      dia_semana: diaSemana,
      situacao: livres.length > 0 ? "aberto" : "lotado",
      horarios_livres: livres.length,
      motivo: null,
    });
  }

  res.json(dias);
});

/* ---------------------------------------------------------------------
   POST /api/:slug/agendamentos
   corpo: { barbeiro_id, servico_id, data, horario, nome, telefone }
--------------------------------------------------------------------- */
rotasPublicas.post("/agendamentos", limiteAgendamento, async (req, res) => {
  const corpo = req.body ?? {};
  const barbeiroId = idValido(corpo.barbeiro_id, "barbeiro_id");
  const servicoId = idValido(corpo.servico_id, "servico_id");
  const data = dataValida(corpo.data);
  const horario = horarioValido(corpo.horario);
  const nome = textoValido(corpo.nome, "nome", 2, 150);
  const telefone = telefoneValido(corpo.telefone);
  // remarcar (opcional): { id, codigo } do horário antigo
  const remarcar = corpo.remarcar
    ? { id: idValido(corpo.remarcar.id, "remarcar.id"), codigo: codigoValido(corpo.remarcar.codigo) }
    : null;
  const codigo = randomBytes(16).toString("hex"); // 32 letras/números aleatórios

  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    // remarcar: cancela o horário antigo dentro da MESMA transação.
    // Se o novo der errado, o ROLLBACK lá embaixo desfaz o cancelamento.
    if (remarcar) await cancelarDoCliente(db, req.barbearia, remarcar.id, remarcar.codigo);

    const barbeiro = await buscarBarbeiro(db, req.barbearia.id, barbeiroId);
    const servico = await buscarServico(db, req.barbearia.id, servicoId);

    // confere expediente, almoço, bloqueios e agenda. A corrida entre dois
    // clientes no mesmo instante é barrada pela constraint EXCLUDE do banco.
    const livres = await horariosDoDia(db, req.barbearia, barbeiroId, servico.duracao_min, data);
    if (!livres.includes(horario)) {
      throw new ErroHttp(409, "Horário indisponível. Escolha outro.");
    }

    // o mesmo WhatsApp não acumula horários: evita lotarem a agenda com reservas falsas
    const { rows: [{ futuros }] } = await db.query(
      `SELECT count(*)::int AS futuros FROM agendamentos
        WHERE barbearia_id = $1 AND cliente_telefone = $2
          AND status = 'confirmado' AND inicio > now()`,
      [req.barbearia.id, telefone]
    );
    if (futuros >= MAX_AGENDAMENTOS_FUTUROS) {
      throw new ErroHttp(409,
        `Este WhatsApp já tem ${futuros} horários marcados. ` +
        "Para marcar outro, chame a barbearia no WhatsApp.");
    }

    // cliente identificado pelo WhatsApp: cria ou atualiza o nome
    const { rows: [cliente] } = await db.query(
      `INSERT INTO clientes (barbearia_id, nome, telefone)
       VALUES ($1, $2, $3)
       ON CONFLICT (barbearia_id, telefone) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id`,
      [req.barbearia.id, nome, telefone]
    );

    const { rows: [agendamento] } = await db.query(
      `INSERT INTO agendamentos
         (barbearia_id, cliente_id, cliente_nome, cliente_telefone,
          barbeiro_id, servico_id, inicio, fim, preco_cobrado, origem, codigo)
       VALUES ($1, $2, $3, $4, $5, $6,
               ($7::date + $8::time) AT TIME ZONE $9,
               ($7::date + $8::time) AT TIME ZONE $9 + make_interval(mins => $10),
                $11, 'site', $12)
       RETURNING id, status`,
      [
        req.barbearia.id, cliente.id, nome, telefone,
        barbeiroId, servicoId,
        data, horario, req.barbearia.fuso_horario, servico.duracao_min,
        servico.preco, codigo
      ]
    );

    await db.query("COMMIT");

    res.status(201).json({
      id: agendamento.id,
      codigo,
      status: agendamento.status,
      barbeiro_id: barbeiroId,
      barbeiro: barbeiro.nome,
      servico_id: servicoId,
      servico: servico.nome,
      data,
      horario,
      duracao_min: servico.duracao_min,
      preco: servico.preco,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
});

/* ---------------------------------------------------------------------
   GET /api/:slug/agendamentos/:id?codigo=...
   -> o agendamento, com o status atual e se ainda dá para cancelar
--------------------------------------------------------------------- */
rotasPublicas.get("/agendamentos/:id", async (req, res) => {
  const id = idValido(req.params.id, "id");
  const codigo = codigoValido(req.query.codigo);
  res.json(await buscarDoCliente(pool, req.barbearia, id, codigo));
});

/* ---------------------------------------------------------------------
   POST /api/:slug/agendamentos/:id/cancelar   { codigo }
--------------------------------------------------------------------- */
rotasPublicas.post("/agendamentos/:id/cancelar", async (req, res) => {
  const id = idValido(req.params.id, "id");
  const codigo = codigoValido(req.body?.codigo);
  await cancelarDoCliente(pool, req.barbearia, id, codigo);
  res.json({ id, status: "cancelado" });
});
