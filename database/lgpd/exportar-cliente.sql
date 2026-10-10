-- =====================================================================
-- LGPD: tudo o que o sistema guarda de um cliente, a partir do WhatsApp.
-- Use quando o cliente pedir acesso aos dados dele (prazo: 15 dias).
-- Só LÊ o banco: não muda nada.
--
-- Como usar (no psql):
--   \c zt_barber
--   \set telefone '(41) 99999-0000'        -- pode digitar com ou sem ( ) - e espaços
--   \o 'C:/Users/SEU_USUARIO/Desktop/dados-cliente.txt'   -- (opcional) salva num arquivo
--   \i 'C:/caminho/para/barbearia-app/database/lgpd/exportar-cliente.sql'
--   \o                                     -- volta a mostrar na tela
--
-- Depois é só mandar o arquivo para o cliente pelo WhatsApp.
-- =====================================================================

-- só os números, igual o site guarda (ex.: 41999990000)

SELECT regexp_replace(:'telefone', '\D', '', 'g') AS tel \gset

\echo
\echo '===== Cadastro ====='
SELECT nome, telefone, email,
       to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS cadastrado_em
  FROM clientes
 WHERE barbearia_id = 1 AND telefone = :'tel';

\echo
\echo '===== Agendamentos ====='
SELECT to_char(a.inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
       s.nome  AS servico,
       b.nome  AS barbeiro,
       a.status,
       a.preco_cobrado   AS valor,
       a.forma_pagamento AS pagamento,
       a.origem,
       a.cliente_nome    AS nome_informado,
       a.observacao,
       to_char(a.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS marcado_em
  FROM agendamentos a
  JOIN servicos  s ON s.id = a.servico_id
  JOIN barbeiros b ON b.id = a.barbeiro_id
 WHERE a.barbearia_id = 1
   AND (a.cliente_telefone = :'tel'
        OR a.cliente_id IN (SELECT id FROM clientes WHERE barbearia_id = 1 AND telefone = :'tel'))
 ORDER BY a.inicio;

\echo
\echo '===== Planos mensais ====='
SELECT p.nome AS plano,
       b.nome AS barbeiro,
       to_char(s.pago_em, 'DD/MM/YYYY')    AS pago_em,
       s.valor,
       s.forma_pagamento                    AS pagamento,
       to_char(s.valido_ate, 'DD/MM/YYYY') AS valido_ate
  FROM assinaturas s
  JOIN planos    p ON p.id = s.plano_id
  JOIN barbeiros b ON b.id = s.barbeiro_id
  JOIN clientes  c ON c.id = s.cliente_id
 WHERE s.barbearia_id = 1 AND c.telefone = :'tel'
 ORDER BY s.pago_em;

