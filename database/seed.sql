-- =====================================================================
-- ZT BARBER — dados iniciais (rodar depois do schema.sql)
-- ⚠️ = valor provisório, aguardando confirmação do cliente
-- =====================================================================

INSERT INTO barbearias (id, nome, slug, endereco, antecedencia_cancelamento_horas)
VALUES (1, 'ZT Barber', 'zt-barber',
        'Rua Dr. Getúlio Vargas, 1140, Centro, Rio Negro - PR, 83380-001', -- ⚠️ conferir nome da rua
        3);                                                              -- ⚠️ 3 ou 5 horas?

INSERT INTO barbeiros (id, barbearia_id, nome, especialidade) VALUES
  (1, 1, 'Train', 'Cortes, barba e sobrancelha'),
  (2, 1, 'Zefe',  'Cortes, barba e sobrancelha');

INSERT INTO servicos (barbearia_id, nome, duracao_min, preco) VALUES
  (1, 'Corte',         30, 35.00),
  (1, 'Barba',         30, 30.00),
  (1, 'Corte + Barba', 60, 55.00),   -- ⚠️ duração a confirmar
  (1, 'Sobrancelha',   10,  5.00);   -- ⚠️ duração a confirmar

-- expediente da barbearia (vale para os dois barbeiros)
INSERT INTO expediente (barbearia_id, dia_semana, hora_inicio, hora_fim) VALUES
  (1, 1, '13:30', '20:00'),                              -- segunda
  (1, 2, '09:00', '12:00'), (1, 2, '13:30', '20:00'),    -- terça
  (1, 3, '09:00', '12:00'), (1, 3, '13:30', '20:00'),    -- quarta
  (1, 4, '09:00', '12:00'), (1, 4, '13:30', '20:00'),    -- quinta
  (1, 5, '09:00', '12:00'), (1, 5, '13:30', '20:00'),    -- sexta
  (1, 6, '09:00', '12:00'), (1, 6, '13:30', '16:00');    -- sábado

-- feriados nacionais até o fim do ano (barbearia toda fechada)
-- ⚠️ faltam os feriados municipais de Rio Negro
INSERT INTO bloqueios (barbearia_id, inicio, fim, motivo) VALUES
  (1, '2026-10-12 00:00-03', '2026-10-13 00:00-03', 'Feriado: N. Sra. Aparecida'),
  (1, '2026-11-02 00:00-03', '2026-11-03 00:00-03', 'Feriado: Finados'),
  (1, '2026-11-15 00:00-03', '2026-11-16 00:00-03', 'Feriado: Proclamação da República'),
  (1, '2026-11-20 00:00-03', '2026-11-21 00:00-03', 'Feriado: Consciência Negra'),
  (1, '2026-12-25 00:00-03', '2026-12-26 00:00-03', 'Feriado: Natal'),
  (1, '2027-01-01 00:00-03', '2027-01-02 00:00-03', 'Feriado: Ano Novo');

-- ajusta as sequências, já que inserimos alguns ids na mão
SELECT setval('barbearias_id_seq', (SELECT MAX(id) FROM barbearias));
SELECT setval('barbeiros_id_seq',  (SELECT MAX(id) FROM barbeiros));

-- contas_admin dos donos: criar pela API (a senha precisa passar pelo bcrypt,
-- não dá para inserir senha em texto puro aqui)
