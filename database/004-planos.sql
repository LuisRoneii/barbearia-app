-- Planos mensais (#19).
-- Rodar UMA vez em bancos criados antes desta mudança:
--   psql ... -f database/004-planos.sql
-- Bancos novos já recebem tudo pelo schema.sql e seed.sql.

-- ---------------------------------------------------------------------
-- planos: o que a barbearia vende (Plano Corte, Plano Completo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planos (
  id                     SERIAL PRIMARY KEY,
  barbearia_id           INT NOT NULL REFERENCES barbearias(id),
  nome                   VARCHAR(100) NOT NULL,
  valor                  NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  visitas_por_pagamento  INT NOT NULL DEFAULT 4 CHECK (visitas_por_pagamento > 0),
  validade_meses         INT NOT NULL DEFAULT 2 CHECK (validade_meses > 0),
  ativo                  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (barbearia_id, nome),
  UNIQUE (barbearia_id, id)
);

-- ---------------------------------------------------------------------
-- plano_servicos: em quais serviços cada plano pode ser usado
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plano_servicos (
  barbearia_id  INT NOT NULL,
  plano_id      INT NOT NULL,
  servico_id    INT NOT NULL,
  PRIMARY KEY (plano_id, servico_id),
  FOREIGN KEY (barbearia_id, plano_id)   REFERENCES planos   (barbearia_id, id),
  FOREIGN KEY (barbearia_id, servico_id) REFERENCES servicos (barbearia_id, id)
);

-- ---------------------------------------------------------------------
-- assinaturas: UM registro por pagamento (cada um libera 4 visitas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assinaturas (
  id               SERIAL PRIMARY KEY,
  barbearia_id     INT NOT NULL REFERENCES barbearias(id),
  cliente_id       INT NOT NULL,
  barbeiro_id      INT NOT NULL,           -- quem vendeu = quem atende
  plano_id         INT NOT NULL,
  pago_em          DATE NOT NULL,
  valor            NUMERIC(10,2) NOT NULL CHECK (valor >= 0),  -- copiado do plano na hora
  forma_pagamento  VARCHAR(20) NOT NULL
                   CHECK (forma_pagamento IN ('pix', 'dinheiro', 'debito', 'credito')),
  valido_ate       DATE NOT NULL,          -- pago_em + validade (o último dia ainda vale)
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (EXTRACT(DAY FROM pago_em) BETWEEN 1 AND 5),   -- só do dia 1 ao 5
  CHECK (valido_ate > pago_em),
  UNIQUE (barbearia_id, id),
  FOREIGN KEY (barbearia_id, cliente_id)  REFERENCES clientes  (barbearia_id, id),
  FOREIGN KEY (barbearia_id, barbeiro_id) REFERENCES barbeiros (barbearia_id, id),
  FOREIGN KEY (barbearia_id, plano_id)    REFERENCES planos    (barbearia_id, id)
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_cliente ON assinaturas (cliente_id);

-- ---------------------------------------------------------------------
-- agendamentos: de qual pagamento saiu a visita + forma "plano"
-- ---------------------------------------------------------------------
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS assinatura_id INT;

ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_assinatura_fk;
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_assinatura_fk
  FOREIGN KEY (barbearia_id, assinatura_id) REFERENCES assinaturas (barbearia_id, id);

ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_forma_pagamento_check;
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix', 'dinheiro', 'debito', 'credito', 'plano'));

-- ---------------------------------------------------------------------
-- dados: os dois planos e os serviços de cada um (busca por nome, porque
-- os ids podem ser diferentes em cada banco)
-- ---------------------------------------------------------------------
INSERT INTO planos (barbearia_id, nome, valor)
SELECT 1, v.nome, v.valor
  FROM (VALUES ('Plano Corte', 110.00),
               ('Plano Completo', 160.00)) AS v(nome, valor)
 WHERE NOT EXISTS (SELECT 1 FROM planos p WHERE p.barbearia_id = 1 AND p.nome = v.nome);

INSERT INTO plano_servicos (barbearia_id, plano_id, servico_id)
SELECT 1, p.id, s.id
  FROM (VALUES ('Plano Corte',    'Corte'),
               ('Plano Corte',    'Sobrancelha'),
               ('Plano Corte',    'Corte + Sobrancelha'),
               ('Plano Completo', 'Corte'),
               ('Plano Completo', 'Barba'),
               ('Plano Completo', 'Sobrancelha'),
               ('Plano Completo', 'Corte + Barba'),
               ('Plano Completo', 'Corte + Sobrancelha'),
               ('Plano Completo', 'Corte + Barba + Sobrancelha')) AS v(plano, servico)
  JOIN planos   p ON p.barbearia_id = 1 AND p.nome = v.plano
  JOIN servicos s ON s.barbearia_id = 1 AND s.nome = v.servico
ON CONFLICT DO NOTHING;
