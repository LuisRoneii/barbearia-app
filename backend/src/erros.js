// Erro com status HTTP, para as rotas avisarem o que deu errado.
export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// Middleware final: transforma qualquer erro em resposta JSON.
export function tratarErros(err, req, res, next) {
  // violação da constraint EXCLUDE: outro agendamento pegou o horário no mesmo instante
  if (err.code === "23P01") {
    return res.status(409).json({ erro: "Esse horário acabou de ser reservado. Escolha outro." });
  }
  // JSON malformado no corpo da requisição
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "JSON inválido no corpo da requisição." });
  }
  // corpo maior que o limite do express.json
  if (err.type === "entity.too.large") {
    return res.status(413).json({ erro: "Pedido grande demais." });
  }
  if (err instanceof ErroHttp) {
    return res.status(err.status).json({ erro: err.message });
  }
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
}
