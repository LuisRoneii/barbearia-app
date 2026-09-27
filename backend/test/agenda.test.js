import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularHorariosLivres, paraMinutos, paraHHMM } from "../src/agenda.js";

// terça: 09:00–12:00 e 13:30–20:00
const TERCA = [
  { ini: paraMinutos("09:00"), fim: paraMinutos("12:00") },
  { ini: paraMinutos("13:30"), fim: paraMinutos("20:00") },
];

test("converte horários", () => {
  assert.equal(paraMinutos("09:30"), 570);
  assert.equal(paraMinutos("13:30:00"), 810);
  assert.equal(paraHHMM(570), "09:30");
});

test("corte de 30 min: manhã até 11:30 e tarde até 19:30, sem almoço", () => {
  const livres = calcularHorariosLivres({ turnos: TERCA, ocupados: [], duracao: 30 });
  assert.equal(livres[0], "09:00");
  assert.ok(livres.includes("11:30"));
  assert.ok(!livres.includes("12:00"));
  assert.ok(!livres.includes("13:00"));
  assert.ok(livres.includes("13:30"));
  assert.equal(livres.at(-1), "19:30");
});

test("combo de 60 min não atravessa o almoço nem o fechamento", () => {
  const livres = calcularHorariosLivres({ turnos: TERCA, ocupados: [], duracao: 60 });
  assert.ok(livres.includes("11:00"));
  assert.ok(!livres.includes("11:30"));
  assert.equal(livres.at(-1), "19:00");
});

test("agendamento existente bloqueia horários sobrepostos", () => {
  const ocupados = [{ ini: paraMinutos("09:00"), fim: paraMinutos("10:00") }];
  const livres = calcularHorariosLivres({ turnos: TERCA, ocupados, duracao: 30 });
  assert.ok(!livres.includes("09:00"));
  assert.ok(!livres.includes("09:30"));
  assert.equal(livres[0], "10:00");
});

test("dia bloqueado inteiro (feriado) não tem horários", () => {
  const ocupados = [{ ini: 0, fim: 24 * 60 }];
  assert.deepEqual(calcularHorariosLivres({ turnos: TERCA, ocupados, duracao: 30 }), []);
});

test("hoje: esconde horários que já passaram", () => {
  const livres = calcularHorariosLivres({
    turnos: TERCA, ocupados: [], duracao: 30, minutoAtual: paraMinutos("14:10"),
  });
  assert.equal(livres[0], "14:30");
});
