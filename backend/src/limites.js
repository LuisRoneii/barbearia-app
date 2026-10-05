// Limites de uso: seguram quem tenta adivinhar senha ou lotar a agenda.
// A contagem é por IP e fica na memória da API (zera quando ela reinicia),
// o que basta para uma barbearia. Com mais de um servidor, trocar por Redis.

import rateLimit from "express-rate-limit";

function limite({ janelaMin, maximo, mensagem, soFalhas = false }) {
  return rateLimit({
    windowMs: janelaMin * 60 * 1000,
    limit: maximo,
    standardHeaders: "draft-7",   // avisa o cliente quanto falta (RateLimit-*)
    legacyHeaders: false,
    skipSuccessfulRequests: soFalhas,
    // os testes automáticos desligam para não esbarrar no limite
    skip: () => process.env.LIMITES_DESLIGADOS === "1",
    handler: (req, res) => res.status(429).json({ erro: mensagem }),
  });
}

// login do painel: só as tentativas que falham contam
export const limiteLogin = limite({
  janelaMin: 15,
  maximo: 10,
  soFalhas: true,
  mensagem: "Muitas tentativas de login. Espere 15 minutos e tente de novo.",
});

// novos agendamentos pelo site. Folgado o bastante para vários clientes
// marcarem pelo Wi-Fi da barbearia (todos saem com o mesmo IP).
export const limiteAgendamento = limite({
  janelaMin: 60,
  maximo: 10,
  mensagem: "Muitos agendamentos seguidos. Tente de novo mais tarde ou chame a barbearia no WhatsApp.",
});

// rede de segurança para o resto da API
export const limiteGeral = limite({
  janelaMin: 1,
  maximo: 120,
  mensagem: "Muitas requisições. Espere um minuto e tente de novo.",
});

// quantos horários futuros o mesmo WhatsApp pode ter marcados ao mesmo tempo
export const MAX_AGENDAMENTOS_FUTUROS = 3;
