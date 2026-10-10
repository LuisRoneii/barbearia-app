-- Foto do Zefe para bancos que já existem (o seed.sql só vale para banco novo)
-- Pode rodar mais de uma vez.
-- Dá erro se nenhuma linha for atualizada (ex.: nome do Zefe diferente no banco),
-- para a migração não "passar" sem ter mudado nada.

DO $$
DECLARE
  linhas integer;
BEGIN
  UPDATE barbeiros SET foto_url = 'img/equipe/zefe.jpg'
  WHERE barbearia_id = 1 AND nome = 'Zefe';

  GET DIAGNOSTICS linhas = ROW_COUNT;
  IF linhas = 0 THEN
    RAISE EXCEPTION 'Nenhum barbeiro "Zefe" encontrado na barbearia 1; foto não atualizada';
  END IF;
END $$;
