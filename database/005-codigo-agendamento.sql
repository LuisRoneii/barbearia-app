-- Código secreto de cada agendamento (#25): só quem agendou consegue ver,
-- cancelar e remarcar o horário pelo site.
-- Rodar UMA vez em bancos criados antes desta mudança:
--   psql "$DATABASE_URL" -f database/005-codigo-agendamento.sql
-- Bancos novos já recebem a coluna pelo schema.sql.
-- Agendamentos antigos ficam com codigo nulo (o cliente cancela pelo WhatsApp).

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS codigo VARCHAR(64) UNIQUE;