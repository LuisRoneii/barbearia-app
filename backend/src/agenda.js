// Lógica pura de horários (sem banco), para ser fácil de testar.
// Tudo trabalha em "minutos desde a meia-noite" no horário local da barbearia.

export const INTERVALO_MIN = 30; // grade de 30 em 30 minutos

// "09:30" ou "09:30:00" -> 570
export function paraMinutos(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

// 570 -> "09:30"
export function paraHHMM(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// dois intervalos [inicio, fim) se sobrepõem?
export function sobrepoe(a, b) {
  return a.ini < b.fim && b.ini < a.fim;
}

/**
 * Horários em que cabe um serviço.
 * @param {object} p
 * @param {{ini:number, fim:number}[]} p.turnos    turnos de expediente do dia
 * @param {{ini:number, fim:number}[]} p.ocupados  agendamentos + bloqueios do dia
 * @param {number} p.duracao                       duração do serviço em minutos
 * @param {number|null} [p.minutoAtual]            se a data é hoje: minuto atual (esconde o que já passou)
 * @returns {string[]} horários "HH:MM" disponíveis
 */
export function calcularHorariosLivres({ turnos, ocupados, duracao, minutoAtual = null, intervalo = INTERVALO_MIN }) {
  const livres = [];
  for (const turno of turnos) {
    // o serviço começa e termina dentro do mesmo turno (não atravessa o almoço)
    for (let ini = turno.ini; ini + duracao <= turno.fim; ini += intervalo) {
      if (minutoAtual !== null && ini <= minutoAtual) continue;
      const candidato = { ini, fim: ini + duracao };
      if (ocupados.some((o) => sobrepoe(candidato, o))) continue;
      livres.push(paraHHMM(ini));
    }
  }
  return livres;
}
