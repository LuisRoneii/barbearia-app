import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import { rotasPublicas } from "./rotas/publicas.js";
import { tratarErros } from "./erros.js";

export const app = express();

// origens que podem chamar a API (o site). Vírgula para mais de uma.
const origens = (process.env.CORS_ORIGIN || "http://127.0.0.1:5500,http://localhost:5500")
  .split(",")
  .map((o) => o.trim());

app.use(cors({ origin: origens }));
app.use(express.json());

// verificação rápida: a API está no ar e falando com o banco?
app.get("/api/saude", async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
});

app.use("/api/:slug", rotasPublicas);

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
app.use(tratarErros);
