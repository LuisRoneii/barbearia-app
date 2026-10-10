-- Confere a foto do Zefe (a 007 terminava sem erro mesmo se não achasse o Zefe).
-- Grava a foto de novo e dá erro se não alterar exatamente uma linha:
-- nenhuma (nome diferente no banco, barbeiro removido) ou mais de uma (dois "Zefe").
-- Se der erro, nada é alterado.
-- Pode rodar de novo no mesmo banco; dá erro se o Zefe não for encontrado.

DO $$
DECLARE
  linhas integer;
BEGIN
  UPDATE barbeiros SET foto_url = 'img/equipe/zefe.jpg'
  WHERE barbearia_id = 1 AND nome = 'Zefe';

  GET DIAGNOSTICS linhas = ROW_COUNT;
  IF linhas <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 barbeiro "Zefe" na barbearia 1, achei %; foto não atualizada', linhas;
  END IF;
END $$;
