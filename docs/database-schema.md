# Modelagem do banco de dados — ZT Barber

Banco **PostgreSQL**, modelado como **multi-tenant**: uma tabela `barbearias`
e uma coluna `barbearia_id` em todas as outras. Hoje só existe a ZT Barber
(`id = 1`), mas o mesmo banco pode atender outras barbearias no futuro sem
redesenho, com cada uma enxergando apenas os próprios dados.

Arquivos:

- `database/schema.sql` — cria as tabelas
- `database/seed.sql` — dados iniciais da ZT Barber (barbeiros, serviços, expediente, feriados)

Itens marcados com ⚠️ dependem de confirmação do cliente.

---

## Diagrama

```mermaid
erDiagram
    BARBEARIAS ||--o{ BARBEIROS : possui
    BARBEARIAS ||--o{ SERVICOS : oferece
    BARBEARIAS ||--o{ CLIENTES : atende
    BARBEARIAS ||--o{ CONTAS_ADMIN : "tem acesso"
    BARBEARIAS ||--o{ EXPEDIENTE : funciona
    BARBEARIAS ||--o{ BLOQUEIOS : fecha
    BARBEIROS ||--o{ AGENDAMENTOS : atende
    SERVICOS ||--o{ AGENDAMENTOS : "é feito em"
    CLIENTES |o--o{ AGENDAMENTOS : marca
    BARBEIROS |o--o{ BLOQUEIOS : "folga de"
    BARBEIROS |o--o| CONTAS_ADMIN : "loga como"

    BARBEARIAS {
        int id PK
        string nome
        string slug
        string telefone
        string endereco
        string fuso_horario
        int antecedencia_cancelamento_horas
    }
    BARBEIROS {
        int id PK
        int barbearia_id FK
        string nome
        string especialidade
        string telefone
        string foto_url
        bool ativo
    }
    SERVICOS {
        int id PK
        int barbearia_id FK
        string nome
        int duracao_min
        decimal preco
        bool ativo
    }
    CLIENTES {
        int id PK
        int barbearia_id FK
        string nome
        string telefone
        string email
        string senha_hash
    }
    CONTAS_ADMIN {
        int id PK
        int barbearia_id FK
        int barbeiro_id FK
        string email
        string senha_hash
        string papel
    }
    EXPEDIENTE {
        int id PK
        int barbearia_id FK
        int barbeiro_id FK
        int dia_semana
        time hora_inicio
        time hora_fim
    }
    BLOQUEIOS {
        int id PK
        int barbearia_id FK
        int barbeiro_id FK
        timestamptz inicio
        timestamptz fim
        string motivo
    }
    AGENDAMENTOS {
        int id PK
        int barbearia_id FK
        int cliente_id FK
        string cliente_nome
        string cliente_telefone
        int barbeiro_id FK
        int servico_id FK
        timestamptz inicio
        timestamptz fim
        decimal preco_cobrado
        string forma_pagamento
        string status
        string origem
    }
```

---

## Tabelas

### `barbearias`
O cliente do sistema. Todas as outras tabelas pertencem a uma barbearia.

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| nome | varchar(150) | "ZT Barber" |
| slug | varchar(100) unique | `zt-barber`, para URL caso o sistema atenda várias barbearias |
| telefone, endereco | varchar | |
| fuso_horario | varchar(50) | `America/Sao_Paulo`; usado nos relatórios por mês |
| antecedencia_cancelamento_horas | int | ⚠️ cliente disse "3 a 5h"; começamos com 3 |

### `barbeiros`
| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| barbearia_id | FK | |
| nome, especialidade | varchar | Train e Zefe |
| telefone | varchar | recebe aviso de novo agendamento pelo WhatsApp |
| foto_url | varchar | nulo até termos as fotos |
| ativo | boolean | desativar sem apagar o histórico |

### `servicos`
| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| barbearia_id | FK | |
| nome | varchar | |
| duracao_min | int | usado para calcular o fim do agendamento |
| preco | numeric(10,2) | preço de tabela |
| ativo | boolean | |

Não existe preço por barbeiro: os dois cobram o mesmo. O desconto "de amigo"
é aplicado no próprio agendamento (`preco_cobrado`).

### `clientes`
Quem agenda pelo site. A identificação é pelo **WhatsApp**; e-mail e senha são
opcionais.

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| barbearia_id | FK | |
| nome | varchar | |
| telefone | varchar | único por barbearia |
| email | varchar, nulo | único por barbearia quando preenchido |
| senha_hash | varchar, nulo | ⚠️ só se decidirem que o cliente precisa de conta |

### `contas_admin`
Quem entra no painel. É separado de `clientes` porque tem outra permissão.

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| barbearia_id | FK | |
| barbeiro_id | FK, nulo | liga a conta ao barbeiro (Train e Zefe são donos **e** barbeiros) |
| nome, email | varchar | email único por barbearia |
| senha_hash | varchar | sempre bcrypt; criada pela API, nunca à mão no SQL |
| papel | `dono` \| `barbeiro` | dono vê o faturamento de todos |

### `expediente`
Turnos de funcionamento. Dois turnos no mesmo dia = pausa de almoço entre eles.

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| barbearia_id | FK | |
| barbeiro_id | FK, nulo | nulo = vale para todos (caso da ZT Barber) |
| dia_semana | smallint | 0 = domingo … 6 = sábado |
| hora_inicio, hora_fim | time | |

| Dia | Turnos |
|---|---|
| Segunda | 13:30–20:00 |
| Terça a sexta | 09:00–12:00 e 13:30–20:00 |
| Sábado | 09:00–12:00 e 13:30–16:00 |
| Domingo | sem linhas = fechado |

### `bloqueios`
Folga, férias, feriado ou compromisso.

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| barbearia_id | FK | |
| barbeiro_id | FK, nulo | nulo = barbearia inteira (feriado) |
| inicio, fim | timestamptz | |
| motivo | varchar | |

O `seed.sql` já cadastra os feriados nacionais até janeiro de 2027.
⚠️ Faltam os feriados municipais de Rio Negro.

### `agendamentos`
| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| barbearia_id | FK | |
| cliente_id | FK, nulo | nulo em encaixe de quem não tem cadastro |
| cliente_nome, cliente_telefone | varchar | copiados na hora; funcionam mesmo sem cadastro |
| barbeiro_id, servico_id | FK | |
| inicio, fim | timestamptz | `fim = inicio + duracao_min` do serviço |
| preco_cobrado | numeric(10,2) | copia o preço do serviço ao agendar; o barbeiro pode alterar (desconto) ao concluir |
| forma_pagamento | `pix` \| `dinheiro` \| `debito` \| `credito` | preenchida ao concluir |
| status | `confirmado` \| `concluido` \| `cancelado` \| `nao_compareceu` | |
| origem | `site` \| `encaixe` \| `painel` | |
| observacao | varchar | |

---

## Regras garantidas pelo próprio banco

**1. Sem choque de horário.** A constraint `agendamentos_sem_sobreposicao`
impede que o mesmo barbeiro tenha dois agendamentos com intervalos
sobrepostos, considerando a duração real de cada um:

```sql
EXCLUDE USING gist (barbeiro_id WITH =, tstzrange(inicio, fim) WITH &&)
WHERE (status <> 'cancelado')
```

Um combo das 09:00 às 10:00 bloqueia um corte às 09:30 do mesmo barbeiro,
mesmo que dois clientes cliquem ao mesmo tempo. Agendamento cancelado libera
o horário. Depende da extensão `btree_gist`, que o `schema.sql` já ativa.

**2. Isolamento entre barbearias.** As chaves estrangeiras compostas
`(barbearia_id, barbeiro_id)`, `(barbearia_id, servico_id)` e
`(barbearia_id, cliente_id)` impedem, por exemplo, um agendamento da
barbearia 2 com um barbeiro da barbearia 1.

**3. Valores válidos.** `CHECK` em status, forma de pagamento, papel,
`fim > inicio`, preço e duração não negativos.

---

## Consultas principais

**Faturamento do mês por barbeiro** (painel dos donos):

```sql
SELECT b.nome AS barbeiro,
       COUNT(*)             AS atendimentos,
       SUM(a.preco_cobrado) AS total
FROM agendamentos a
JOIN barbeiros b ON b.id = a.barbeiro_id
WHERE a.barbearia_id = $1
  AND a.status = 'concluido'
  AND a.inicio >= $2   -- início do mês
  AND a.inicio <  $3   -- início do mês seguinte
GROUP BY b.nome
ORDER BY b.nome;
```

**Agenda do dia de um barbeiro:**

```sql
SELECT a.inicio, a.fim, a.cliente_nome, s.nome AS servico, a.status
FROM agendamentos a
JOIN servicos s ON s.id = a.servico_id
WHERE a.barbeiro_id = $1
  AND a.status <> 'cancelado'
  AND a.inicio >= $2 AND a.inicio < $3
ORDER BY a.inicio;
```

**Horários livres:** calculados na API. Ela gera os horários de 30 em 30
minutos dentro de cada turno do `expediente` e descarta os que se sobrepõem a
agendamentos ou `bloqueios`. É a mesma lógica que hoje roda no `script.js`.

---

## Como rodar localmente

```bash
psql -U postgres -c "CREATE DATABASE zt_barber;"
psql -U postgres -d zt_barber -f database/schema.sql
psql -U postgres -d zt_barber -f database/seed.sql
```

---

## Fica para depois

| Tabela | Quando |
|---|---|
| `planos`, `assinaturas` | planos mensais (R$110 e R$160), versão 2 |
| `mensagens_whatsapp` | log de confirmações/lembretes enviados, para não mandar em duplicidade |
| `avaliacoes` | depoimentos reais no site |

Não entram: `produtos` (não vendem) e `pagamentos` online (não cobram sinal).
