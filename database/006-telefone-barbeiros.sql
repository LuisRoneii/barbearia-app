-- WhatsApp de cada barbeiro, para bancos que já existem (o seed.sql só vale para banco novo).
-- Usado em "Meus horários": com menos de 3 horas para o horário, o botão
-- "chame o seu barbeiro" abre o WhatsApp do barbeiro daquele horário.
-- Guardado só com números, com DDD e sem o 55 (o site coloca o 55 no link).
-- Pode rodar mais de uma vez.

UPDATE barbeiros SET telefone = '47984356708' WHERE barbearia_id = 1 AND nome = 'Train';
UPDATE barbeiros SET telefone = '47984565185' WHERE barbearia_id = 1 AND nome = 'Zefe';
