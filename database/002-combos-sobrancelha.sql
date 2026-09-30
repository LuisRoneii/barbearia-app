-- Combos com sobrancelha (tempo e preço somados).
-- Rodar UMA vez em bancos criados antes desta mudança:
--   \i 'C:/.../barbearia-app/database/002-combos-sobrancelha.sql'
-- Bancos novos já recebem os combos pelo seed.sql.

INSERT INTO servicos (barbearia_id, nome, duracao_min, preco)
SELECT 1, v.nome, v.duracao, v.preco
  FROM (VALUES ('Corte + Sobrancelha', 35, 40.00),
               ('Corte + Barba + Sobrancelha', 65, 60.00)) AS v(nome, duracao, preco)
 WHERE NOT EXISTS (SELECT 1 FROM servicos s WHERE s.barbearia_id = 1 AND s.nome = v.nome);
