-- Foto do Zefe para bancos que já existem (o seed.sql só vale para banco novo)
UPDATE barbeiros SET foto_url = 'img/equipe/zefe.jpg'
WHERE barbearia_id = 1 AND nome = 'Zefe';
