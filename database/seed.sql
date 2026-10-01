-- =====================================================================
-- ZT BARBER — dados iniciais (rodar depois do schema.sql)
-- valores confirmados com o cliente em 28/09/2026
-- =====================================================================

INSERT INTO barbearias (id, nome, slug, endereco, antecedencia_cancelamento_horas)
VALUES (1, 'ZT Barber', 'zt-barber',
        'Rua Dr. Getúlio Vargas, 1140, Centro, Rio Negro - PR, 83380-001',
        3);   -- cliente pode cancelar até 3 horas antes

INSERT INTO barbeiros (id, barbearia_id, nome, especialidade, foto_url) VALUES
  (1, 1, 'Train', 'Cortes, barba e sobrancelha', 'img/equipe/train.jpg'),
  (2, 1, 'Zefe',  'Cortes, barba e sobrancelha', NULL);

INSERT INTO servicos (barbearia_id, nome, duracao_min, preco) VALUES
  (1, 'Corte',         30, 35.00),
  (1, 'Barba',         30, 30.00),
  (1, 'Corte + Barba', 60, 55.00),
  (1, 'Sobrancelha',    5,  5.00),
  (1, 'Corte + Sobrancelha',          35, 40.00),
  (1, 'Corte + Barba + Sobrancelha',  65, 60.00);

-- expediente da barbearia (vale para os dois barbeiros)
INSERT INTO expediente (barbearia_id, dia_semana, hora_inicio, hora_fim) VALUES
  (1, 1, '13:30', '20:00'),                              -- segunda
  (1, 2, '09:00', '12:00'), (1, 2, '13:30', '20:00'),    -- terça
  (1, 3, '09:00', '12:00'), (1, 3, '13:30', '20:00'),    -- quarta
  (1, 4, '09:00', '12:00'), (1, 4, '13:30', '20:00'),    -- quinta
  (1, 5, '09:00', '12:00'), (1, 5, '13:30', '20:00'),    -- sexta
  (1, 6, '09:00', '12:00'), (1, 6, '13:30', '16:00');    -- sábado

-- feriados: a barbearia fecha em todos (nacionais + municipal de Rio Negro)
-- atualizar esta lista uma vez por ano
INSERT INTO bloqueios (barbearia_id, inicio, fim, motivo)
SELECT 1,
       (d::date)::timestamp AT TIME ZONE 'America/Sao_Paulo',
       (d::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo',
       'Feriado: ' || nome
FROM (VALUES
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República / Aniversário de Rio Negro'),
  ('2026-11-20', 'Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Ano Novo'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-05-27', 'Corpus Christi'),
  ('2027-08-06', 'Feriado municipal de Rio Negro'),
  ('2027-09-07', 'Independência'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República / Aniversário de Rio Negro'),
  ('2027-11-20', 'Consciência Negra'),
  ('2027-12-25', 'Natal')
) AS f(d, nome);

-- ajusta as sequências, já que inserimos alguns ids na mão
SELECT setval('barbearias_id_seq', (SELECT MAX(id) FROM barbearias));
SELECT setval('barbeiros_id_seq',  (SELECT MAX(id) FROM barbeiros));

-- contas_admin dos donos: criar pela API (a senha precisa passar pelo bcrypt,
-- não dá para inserir senha em texto puro aqui)
