-- =====================================================================
-- LGPD: apaga os dados pessoais de um cliente, a partir do WhatsApp.
-- Use quando o cliente pedir a exclusão (prazo: 15 dias).
--
-- O que faz:
--   1. Cancela os horários FUTUROS ainda confirmados (liberam a agenda).
--   2. Nos agendamentos: troca o nome por "Cliente removido" e apaga
--      telefone, código secreto e observação.
--   3. No cadastro: troca o nome por "Cliente removido" e apaga telefone e e-mail.
--   Valores, datas, serviços e planos FICAM, sem identificar a pessoa,
--   para o faturamento não mudar.
--
-- NÃO TEM VOLTA. Rode antes o exportar-cliente.sql para conferir quem é.
--
-- Como usar (no psql):
--   \c zt_barber
--   \set telefone '(41) 99999-0000'
--   \i 'C:/caminho/para/barbearia-app/database/lgpd/anonimizar-cliente.sql'
-- =====================================================================

\set ON_ERROR_STOP on

SELECT regexp_replace(:'telefone', '\D', '', 'g') AS tel \gset

BEGIN;

-- quem e o quê: guardado antes de mexer, porque o telefone vai sumir
CREATE TEMP TABLE lgpd_clientes ON COMMIT DROP AS
  SELECT id FROM clientes WHERE barbearia_id = 1 AND telefone = :'tel';

CREATE TEMP TABLE lgpd_agendamentos ON COMMIT DROP AS
  SELECT id FROM agendamentos
   WHERE barbearia_id = 1
     AND (cliente_telefone = :'tel' OR cliente_id IN (SELECT id FROM lgpd_clientes));

\echo
\echo 'Encontrado (cadastros / agendamentos):'
SELECT (SELECT count(*) FROM lgpd_clientes) AS cadastros,
       (SELECT count(*) FROM lgpd_agendamentos) AS agendamentos;

-- 1. horários futuros confirmados: cancela
UPDATE agendamentos
   SET status = 'cancelado'
 WHERE id IN (SELECT id FROM lgpd_agendamentos)
   AND status = 'confirmado'
   AND inicio > now();

-- 2. agendamentos: tira o que identifica a pessoa
UPDATE agendamentos
   SET cliente_nome     = 'Cliente removido',
       cliente_telefone = NULL,
       codigo           = NULL,
       observacao       = NULL
 WHERE id IN (SELECT id FROM lgpd_agendamentos);

-- 3. cadastro: telefone é obrigatório e único, então vira "removido-<id>"
UPDATE clientes
   SET nome       = 'Cliente removido',
       telefone   = 'removido-' || id,
       email      = NULL,
       senha_hash = NULL
 WHERE id IN (SELECT id FROM lgpd_clientes);

COMMIT;

\echo
\echo 'Pronto. Os dados pessoais desse WhatsApp foram removidos.'
\echo 'Avise o cliente pelo WhatsApp que o pedido foi atendido.'
