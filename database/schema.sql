-- =====================================================================
-- ZT BARBER — schema do banco (PostgreSQL 14+)
-- Rodar num banco vazio:  psql -U postgres -d zt_barber -f database/schema.sql
-- =====================================================================

-- extensão que permite a regra "sem sobreposição de horário" (EXCLUDE)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- barbearias: cada cliente do sistema (multi-tenant)
-- ---------------------------------------------------------------------
CREATE TABLE barbearias (
  id                               SERIAL PRIMARY KEY,
  nome                             VARCHAR(150) NOT NULL,
  slug                             VARCHAR(100) NOT NULL UNIQUE,
  telefone                         VARCHAR(20),
  endereco                         VARCHAR(255),
  fuso_horario                     VARCHAR(50)  NOT NULL DEFAULT 'America/Sao_Paulo',
  antecedencia_cancelamento_horas  INT          NOT NULL DEFAULT 3,
  criado_em                        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- barbeiros
-- ---------------------------------------------------------------------
CREATE TABLE barbeiros (
  id             SERIAL PRIMARY KEY,
  barbearia_id   INT NOT NULL REFERENCES barbearias(id),
  nome           VARCHAR(150) NOT NULL,
  especialidade  VARCHAR(150),
  telefone       VARCHAR(20),              -- recebe aviso de novo agendamento (WhatsApp)
  foto_url       VARCHAR(255),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (barbearia_id, id)                -- alvo das FKs compostas abaixo
);

-- ---------------------------------------------------------------------
-- servicos
-- ---------------------------------------------------------------------
CREATE TABLE servicos (
  id            SERIAL PRIMARY KEY,
  barbearia_id  INT NOT NULL REFERENCES barbearias(id),
  nome          VARCHAR(150) NOT NULL,
  duracao_min   INT NOT NULL CHECK (duracao_min > 0),
  preco         NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (barbearia_id, id)
);

-- ---------------------------------------------------------------------
-- clientes: identificados pelo WhatsApp. E-mail e senha são opcionais
-- (pendente: cliente precisa ou não criar conta)
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
  id            SERIAL PRIMARY KEY,
  barbearia_id  INT NOT NULL REFERENCES barbearias(id),
  nome          VARCHAR(150) NOT NULL,
  telefone      VARCHAR(20)  NOT NULL,
  email         VARCHAR(150),
  senha_hash    VARCHAR(255),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (barbearia_id, telefone),
  UNIQUE (barbearia_id, email),
  UNIQUE (barbearia_id, id)
);

-- ---------------------------------------------------------------------
-- contas_admin: quem entra no painel (donos / barbeiros)
-- ---------------------------------------------------------------------
CREATE TABLE contas_admin (
  id            SERIAL PRIMARY KEY,
  barbearia_id  INT NOT NULL REFERENCES barbearias(id),
  barbeiro_id   INT,                       -- NULL se a conta não for de um barbeiro
  nome          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  papel         VARCHAR(20)  NOT NULL CHECK (papel IN ('dono', 'barbeiro')),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (barbearia_id, email),
  FOREIGN KEY (barbearia_id, barbeiro_id) REFERENCES barbeiros (barbearia_id, id)
);

-- ---------------------------------------------------------------------
-- expediente: turnos de funcionamento. Vários turnos no mesmo dia
-- = pausa de almoço entre eles. barbeiro_id NULL = vale para todos.
-- ---------------------------------------------------------------------
CREATE TABLE expediente (
  id            SERIAL PRIMARY KEY,
  barbearia_id  INT NOT NULL REFERENCES barbearias(id),
  barbeiro_id   INT,
  dia_semana    SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0 = domingo
  hora_inicio   TIME NOT NULL,
  hora_fim      TIME NOT NULL,
  CHECK (hora_fim > hora_inicio),
  FOREIGN KEY (barbearia_id, barbeiro_id) REFERENCES barbeiros (barbearia_id, id)
);

-- ---------------------------------------------------------------------
-- bloqueios: folga, férias, feriado. barbeiro_id NULL = barbearia toda
-- ---------------------------------------------------------------------
CREATE TABLE bloqueios (
  id            SERIAL PRIMARY KEY,
  barbearia_id  INT NOT NULL REFERENCES barbearias(id),
  barbeiro_id   INT,
  inicio        TIMESTAMPTZ NOT NULL,
  fim           TIMESTAMPTZ NOT NULL,
  motivo        VARCHAR(150),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fim > inicio),
  FOREIGN KEY (barbearia_id, barbeiro_id) REFERENCES barbeiros (barbearia_id, id)
);

-- ---------------------------------------------------------------------
-- planos: o que a barbearia vende (Plano Corte, Plano Completo)
-- ---------------------------------------------------------------------
CREATE TABLE  planos (
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
CREATE TABLE  plano_servicos (
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
CREATE TABLE  assinaturas (
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
);-- ---------------------------------------------------------------------
-- agendamentos
-- ---------------------------------------------------------------------
CREATE TABLE agendamentos (
  id                SERIAL PRIMARY KEY,
  barbearia_id      INT NOT NULL REFERENCES barbearias(id),
  cliente_id        INT,                   -- NULL em encaixe de quem não tem cadastro
  cliente_nome      VARCHAR(150) NOT NULL, -- copiado na hora (encaixe não tem cliente_id)
  cliente_telefone  VARCHAR(20),
  barbeiro_id       INT NOT NULL,
  servico_id        INT NOT NULL,
  inicio            TIMESTAMPTZ NOT NULL,
  fim               TIMESTAMPTZ NOT NULL,
  preco_cobrado     NUMERIC(10,2) NOT NULL CHECK (preco_cobrado >= 0),
  forma_pagamento   VARCHAR(20) CHECK (forma_pagamento IN ('pix', 'dinheiro', 'debito', 'credito', 'plano')),
  assinatura_id     INT,                   -- de qual pagamento de plano saiu a visita
  status            VARCHAR(20) NOT NULL DEFAULT 'confirmado'
                    CHECK (status IN ('confirmado', 'concluido', 'cancelado', 'nao_compareceu')),
  origem            VARCHAR(20) NOT NULL DEFAULT 'site'
                    CHECK (origem IN ('site', 'encaixe', 'painel')),
  observacao        VARCHAR(255),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fim > inicio),

  -- barbeiro, serviço e cliente precisam ser da MESMA barbearia do agendamento
  FOREIGN KEY (barbearia_id, barbeiro_id) REFERENCES barbeiros (barbearia_id, id),
  FOREIGN KEY (barbearia_id, servico_id)  REFERENCES servicos  (barbearia_id, id),
  FOREIGN KEY (barbearia_id, cliente_id)  REFERENCES clientes  (barbearia_id, id),
  FOREIGN KEY (barbearia_id, assinatura_id) REFERENCES assinaturas (barbearia_id, id),

  -- o mesmo barbeiro não pode ter dois agendamentos que se sobreponham
  -- (cancelados não contam, liberam o horário)
  CONSTRAINT agendamentos_sem_sobreposicao
    EXCLUDE USING gist (barbeiro_id WITH =, tstzrange(inicio, fim) WITH &&)
    WHERE (status <> 'cancelado')
);

CREATE INDEX idx_agendamentos_barbearia_inicio ON agendamentos (barbearia_id, inicio);
CREATE INDEX idx_agendamentos_cliente         ON agendamentos (cliente_id);
CREATE INDEX idx_bloqueios_barbearia_inicio   ON bloqueios    (barbearia_id, inicio);
CREATE INDEX idx_assinaturas_cliente          ON assinaturas  (cliente_id);
