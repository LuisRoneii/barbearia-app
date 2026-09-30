// Cria (ou atualiza a senha de) uma conta do painel.
// Uso: npm run criar-admin
// Pergunta os dados no terminal. Rode uma vez para cada dono.

import "dotenv/config";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { pool } from "../src/db.js";
import { gerarHashSenha } from "../src/autenticacao.js";

// lê as respostas linha a linha (funciona digitando ou colando várias de uma vez)
const rl = readline.createInterface({ input, terminal: false });
const linhas = [];
const esperando = [];
rl.on("line", (l) => (esperando.length ? esperando.shift()(l) : linhas.push(l)));
rl.on("close", () => esperando.splice(0).forEach((r) => r("")));
rl.question = (pergunta) => {
  output.write(pergunta);
  return linhas.length ? Promise.resolve(linhas.shift()) : new Promise((r) => esperando.push(r));
};

try {
  const slug = (await rl.question("Barbearia (slug) [zt-barber]: ")).trim() || "zt-barber";
  const { rows: [barbearia] } = await pool.query("SELECT id, nome FROM barbearias WHERE slug = $1", [slug]);
  if (!barbearia) throw new Error(`Barbearia "${slug}" não encontrada.`);

  const { rows: barbeiros } = await pool.query(
    "SELECT id, nome FROM barbeiros WHERE barbearia_id = $1 ORDER BY id", [barbearia.id]
  );
  console.log(`\n${barbearia.nome}. Barbeiros: ${barbeiros.map((b) => `${b.id} = ${b.nome}`).join(", ")}`);

  const nome = (await rl.question("Nome da pessoa: ")).trim();
  const email = (await rl.question("E-mail de login: ")).trim().toLowerCase();
  const barbeiroTxt = (await rl.question("Id do barbeiro ligado a esta conta (Enter se não for barbeiro): ")).trim();
  const papel = ((await rl.question("Papel: dono ou barbeiro [dono]: ")).trim() || "dono").toLowerCase();
  const senha = await rl.question("Senha (mínimo 8 caracteres): ");

  if (!nome || !email.includes("@")) throw new Error("Nome e e-mail são obrigatórios.");
  if (!["dono", "barbeiro"].includes(papel)) throw new Error('Papel deve ser "dono" ou "barbeiro".');
  if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  const barbeiroId = barbeiroTxt ? Number(barbeiroTxt) : null;
  if (barbeiroId && !barbeiros.some((b) => b.id === barbeiroId)) throw new Error("Id de barbeiro inválido.");

  const hash = await gerarHashSenha(senha);
  await pool.query(
    `INSERT INTO contas_admin (barbearia_id, barbeiro_id, nome, email, senha_hash, papel)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (barbearia_id, email)
     DO UPDATE SET nome = EXCLUDED.nome, barbeiro_id = EXCLUDED.barbeiro_id,
                   senha_hash = EXCLUDED.senha_hash, papel = EXCLUDED.papel, ativo = TRUE`,
    [barbearia.id, barbeiroId, nome, email, hash, papel]
  );
  console.log(`\nConta pronta. Entre no painel com ${email}.`);
} catch (err) {
  console.error(`\nErro: ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}
