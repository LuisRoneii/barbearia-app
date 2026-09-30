// Login dos donos: senha com bcrypt e sessão com token JWT.
//
// Como funciona:
// 1. O painel manda e-mail e senha para POST /api/:slug/admin/login.
// 2. A API confere a senha com o hash guardado em contas_admin.
// 3. Se bater, devolve um token assinado com JWT_SEGREDO, válido por 12 horas.
// 4. O painel manda esse token em toda requisição: "Authorization: Bearer <token>".
// 5. exigirLogin() confere a assinatura antes de deixar a rota rodar.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ErroHttp } from "./erros.js";

const VALIDADE_TOKEN = "12h";

function segredo() {
  const s = process.env.JWT_SEGREDO;
  if (!s || s.length < 32) {
    throw new Error("Defina JWT_SEGREDO no .env com pelo menos 32 caracteres (veja .env.example).");
  }
  return s;
}

export async function gerarHashSenha(senha) {
  return bcrypt.hash(senha, 10);
}

export async function senhaConfere(senha, hash) {
  return bcrypt.compare(senha, hash);
}

export function gerarToken(conta) {
  return jwt.sign(
    {
      sub: conta.id,
      barbearia_id: conta.barbearia_id,
      barbeiro_id: conta.barbeiro_id,
      papel: conta.papel,
      nome: conta.nome,
    },
    segredo(),
    { expiresIn: VALIDADE_TOKEN }
  );
}

// middleware: só passa quem mandou um token válido desta barbearia
export function exigirLogin(req, res, next) {
  const [tipo, token] = String(req.headers.authorization || "").split(" ");
  if (tipo !== "Bearer" || !token) {
    throw new ErroHttp(401, "Faça login para continuar.");
  }
  let dados;
  try {
    dados = jwt.verify(token, segredo());
  } catch (e) {
    throw new ErroHttp(401, "Sessão expirada. Entre de novo.");
  }
  if (dados.barbearia_id !== req.barbearia.id) {
    throw new ErroHttp(403, "Sem acesso a esta barbearia.");
  }
  req.conta = dados;
  next();
}
