# Backend — API da ZT Barber

API em **Node.js + Express** conectada ao **PostgreSQL** (modelagem em
[`../docs/database-schema.md`](../docs/database-schema.md)).

## Rodar localmente

Pré-requisitos: Node.js 20+ e o banco `zt_barber` criado com
`database/schema.sql` e `database/seed.sql`.

```bash
cd backend
npm install
cp .env.example .env      # no Windows: copy .env.example .env
# edite o .env e coloque a senha do seu PostgreSQL
npm run dev
```

Abra http://localhost:3000/api/saude. Deve responder `{"ok":true}`.

`npm run dev` reinicia a API sozinha quando um arquivo muda.
`npm test` roda os testes da lógica de horários.

## Endpoints

Todas as rotas usam o `slug` da barbearia: `zt-barber`.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/saude` | API no ar e conectada ao banco |
| GET | `/api/zt-barber/servicos` | serviços ativos com duração e preço |
| GET | `/api/zt-barber/barbeiros` | barbeiros ativos |
| GET | `/api/zt-barber/horarios?barbeiro_id=1&servico_id=1&data=2026-09-29` | horários livres do dia |
| POST | `/api/zt-barber/agendamentos` | cria um agendamento |

### Horários livres

Considera, nesta ordem:
1. **Expediente** do dia da semana (com a pausa do almoço);
2. **Bloqueios** (feriados e folgas);
3. **Agendamentos** já marcados, com a duração real de cada serviço;
4. Se a data é hoje, esconde o que já passou.

Aceita datas de hoje até 30 dias à frente.

### Criar agendamento

```json
POST /api/zt-barber/agendamentos
{
  "barbeiro_id": 1,
  "servico_id": 3,
  "data": "2026-09-29",
  "horario": "09:00",
  "nome": "Carlos",
  "telefone": "(47) 98435-0000"
}
```

| Resposta | Quando |
|---|---|
| `201` | agendamento criado |
| `400` | campo faltando ou em formato errado |
| `404` | barbearia, barbeiro ou serviço não existe |
| `409` | horário indisponível ou reservado por outra pessoa no mesmo instante |

O cliente é identificado pelo **telefone**. Se já existir, só atualiza o nome.
O preço cobrado é copiado do serviço no momento do agendamento.

## Estrutura

```
backend/
├── src/
│   ├── server.js          # sobe o servidor
│   ├── app.js             # configura o Express (CORS, JSON, rotas)
│   ├── db.js              # conexão com o PostgreSQL
│   ├── agenda.js          # cálculo de horários livres (sem banco, testável)
│   ├── erros.js           # respostas de erro padronizadas
│   └── rotas/
│       └── publicas.js    # rotas usadas pelo site
├── test/
│   └── agenda.test.js
├── .env.example
└── package.json
```

## Próximos passos

- Autenticação dos donos + painel (#3, #18)
- Cancelamento pelo cliente (depende de decidir se o cliente terá conta)
- Confirmação via WhatsApp (#17)
- Trocar o `localStorage` do site pelas chamadas desta API (#5)
