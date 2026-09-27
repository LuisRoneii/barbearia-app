import pg from "pg";

// NUMERIC (ex: preços) chega do pg como texto para não perder precisão.
// Para valores em reais com 2 casas, número comum é suficiente.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (valor) => parseFloat(valor));

if (!process.env.DATABASE_URL) {
  console.error("Faltou a variável DATABASE_URL. Copie .env.example para .env e preencha.");
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
