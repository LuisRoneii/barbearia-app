// Peças usadas pelas rotas públicas e pelas do painel.

import { pool } from "./db.js";
import { ErroHttp } from "./erros.js";

/* ---------------------------------------------------------------------
   Barbearia da URL: carrega uma vez e deixa em req.barbearia
--------------------------------------------------------------------- */
export async function carregarBarbearia(req, res, next) {
  const { rows } = await pool.query(
    "SELECT id, nome, fuso_horario FROM barbearias WHERE slug = $1",
    [req.params.slug]
  );
  if (!rows[0]) throw new ErroHttp(404, "Barbearia não encontrada.");
  req.barbearia = rows[0];
  next();
}

/* ---------------------------------------------------------------------
   Validações simples de entrada
--------------------------------------------------------------------- */
export function idValido(valor, nome) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErroHttp(400, `Campo "${nome}" inválido.`);
  return id;
}

export function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor ?? "")) {
    throw new ErroHttp(400, 'Campo "data" deve estar no formato AAAA-MM-DD.');
  }
  const [a, m, d] = valor.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new ErroHttp(400, 'Campo "data" não é uma data válida.');
  }
  return valor;
}

export function horarioValido(valor) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(valor ?? "")) {
    throw new ErroHttp(400, 'Campo "horario" deve estar no formato HH:MM.');
  }
  return valor;
}

export function textoValido(valor, nome, min, max) {
  const texto = String(valor ?? "").trim();
  if (texto.length < min || texto.length > max) {
    throw new ErroHttp(400, `Campo "${nome}" deve ter entre ${min} e ${max} caracteres.`);
  }
  return texto;
}

// só dígitos; aceita com ou sem 55 e DDD: (47) 98435-6708 -> 47984356708
export function telefoneValido(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) {
    throw new ErroHttp(400, 'Campo "telefone" inválido. Use DDD + número.');
  }
  return digitos;
}

/* ---------------------------------------------------------------------
   Consultas usadas por mais de uma rota
--------------------------------------------------------------------- */
export async function buscarServico(db, barbeariaId, servicoId) {
  const { rows } = await db.query(
    "SELECT id, nome, duracao_min, preco FROM servicos WHERE id = $1 AND barbearia_id = $2 AND ativo",
    [servicoId, barbeariaId]
  );
  if (!rows[0]) throw new ErroHttp(404, "Serviço não encontrado.");
  return rows[0];
}

export async function buscarBarbeiro(db, barbeariaId, barbeiroId) {
  const { rows } = await db.query(
    "SELECT id, nome FROM barbeiros WHERE id = $1 AND barbearia_id = $2 AND ativo",
    [barbeiroId, barbeariaId]
  );
  if (!rows[0]) throw new ErroHttp(404, "Barbeiro não encontrado.");
  return rows[0];
}

