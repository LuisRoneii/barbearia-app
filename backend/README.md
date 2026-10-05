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
# edite o .env: senha do PostgreSQL e JWT_SEGREDO
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
| GET | `/api/zt-barber/dias?barbeiro_id=1&servico_id=1&quantidade=14` | próximos dias: aberto, lotado, fechado ou bloqueado (feriado) |
| GET | `/api/zt-barber/horarios?barbeiro_id=1&servico_id=1&data=2026-09-29` | horários livres do dia |
| POST | `/api/zt-barber/agendamentos` | cria um agendamento |

### Painel dos donos (exige login)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/zt-barber/admin/login` | e-mail + senha → token (vale 12h) |
| GET | `/api/zt-barber/admin/agenda?data=2026-10-01` | agendamentos e bloqueios do dia |
| PATCH | `/api/zt-barber/admin/agendamentos/:id` | `cancelar`, `concluir` (valor + forma de pagamento), `nao_compareceu`, `reabrir` |
| POST | `/api/zt-barber/admin/encaixe` | lança cliente que chegou sem marcar |
| GET/POST/DELETE | `/api/zt-barber/admin/bloqueios` | folgas e feriados; ao criar, avisa quem já estava marcado |
| GET | `/api/zt-barber/admin/faturamento?mes=2026-10` | total do mês por barbeiro e por forma de pagamento |

As rotas do painel recebem o token no cabeçalho `Authorization: Bearer <token>`.
A senha fica guardada com **bcrypt** (nunca em texto puro).

**Criar a conta de cada dono** (uma vez, com o banco já criado):

```bash
npm run criar-admin
```

O script pergunta nome, e-mail, o barbeiro ligado à conta e a senha.
Rodar de novo com o mesmo e-mail troca a senha.

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
│   ├── comum.js           # validações e buscas usadas pelas duas rotas
│   ├── autenticacao.js    # login: bcrypt + token JWT
│   └── rotas/
│       ├── publicas.js    # rotas usadas pelo site
│       └── admin.js       # rotas do painel (com login)
├── scripts/
│   └── criar-admin.js     # cria/atualiza conta de dono
├── test/
│   └── agenda.test.js
├── .env.example
└── package.json
```

## Próximos passos

- Cancelamento pelo cliente (depende de decidir se o cliente terá conta)
- Confirmação via WhatsApp (#17)
- Trocar o `localStorage` do site pelas chamadas desta API (#5)

## Segurança

- **Limites de uso** (`src/limites.js`): 10 tentativas de login erradas a cada 15 min, 10 pedidos de agendamento por hora e 120 requisições por minuto, sempre por IP. Passou disso, a API responde `429`.
- **Limite por WhatsApp:** o mesmo número pode ter no máximo 3 horários futuros marcados pelo site. Encaixes lançados pelo painel não entram nessa conta.
- **Cabeçalhos de segurança** com o pacote `helmet` e corpo das requisições limitado a 10 kB.
- **No servidor**, atrás do Nginx, defina `TRUST_PROXY=1` no `.env`. Sem isso a API enxerga todos os visitantes com o IP do proxy e os limites valem para todo mundo junto.
