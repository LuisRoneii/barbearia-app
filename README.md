# ZT Barber

Site institucional e sistema de agendamento online para a barbearia **ZT Barber**,
em Rio Negro (PR). O cliente escolhe o serviço, o barbeiro, o dia e o horário, e
só vê horários realmente livres.

Projeto desenvolvido em dupla para um cliente real e usado como peça de portfólio.

---

## Status

| Parte | Situação |
|---|---|
| Site (frontend) | Funcionando. Agendamento ainda salvo no navegador (`localStorage`) |
| Banco de dados | Modelado em PostgreSQL, com dados reais da barbearia |
| API (backend) | Consulta de serviços, barbeiros e horários livres + criação de agendamento |
| Integração site ↔ API | Próxima etapa (#5) |

---

## Tecnologias

**Frontend:** HTML5, CSS3 puro (variáveis de tema) e JavaScript vanilla, sem
framework nem build. Fontes [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk)
e [Inter](https://fonts.google.com/specimen/Inter).

**Backend:** Node.js 20+ com Express 5 e a biblioteca `pg`.

**Banco de dados:** PostgreSQL 18. Escolhido pela constraint `EXCLUDE`, que
impede no próprio banco dois agendamentos sobrepostos do mesmo barbeiro.

---

## Estrutura de pastas

```
barbearia-app/
├── index.html              # página do site
├── css/style.css           # estilos
├── js/script.js            # agendamento, login e conteúdo dinâmico do site
├── backend/                # API em Node.js (ver backend/README.md)
│   ├── src/
│   └── test/
├── database/
│   ├── schema.sql          # cria as tabelas
│   └── seed.sql            # dados iniciais da ZT Barber
├── docs/
│   └── database-schema.md  # modelagem do banco: diagrama, tabelas e regras
├── .gitignore
└── README.md
```

---

## Como rodar localmente

### Só o site

Abra o `index.html` no navegador ou use a extensão **Live Server** do VS Code.
Nessa forma o agendamento funciona, mas os dados ficam só no seu navegador.

### Banco de dados

Com o PostgreSQL instalado, abra o **SQL Shell (psql)** e rode:

```sql
\encoding UTF8
CREATE DATABASE zt_barber;
\c zt_barber
\encoding UTF8
\i 'C:/caminho/para/barbearia-app/database/schema.sql'
\i 'C:/caminho/para/barbearia-app/database/seed.sql'
```

`\dt` deve listar 8 tabelas.

### API

```bash
cd backend
npm install
copy .env.example .env     # Linux/Mac: cp .env.example .env
```

Coloque a senha do PostgreSQL no `.env` e rode:

```bash
npm run dev
```

Teste em http://localhost:3000/api/saude, que deve responder `{"ok":true}`.
Rotas e detalhes em [`backend/README.md`](backend/README.md).

---

## Funcionalidades

**Site**
- Seções: hero, sobre, equipe, serviços, portfólio, depoimentos, FAQ e contato
- Layout responsivo
- Agendamento em 4 passos: serviço → barbeiro → dia → horário
- Horários por dia da semana, com pausa de almoço e domingo fechado
- Serviços longos bloqueiam o tempo todo que ocupam, sem sobreposição

**API**
- Lista serviços e barbeiros
- Calcula horários livres a partir do expediente, feriados e agenda já marcada
- Cria agendamentos identificando o cliente pelo WhatsApp
- Recusa horário ocupado, mesmo com dois clientes clicando ao mesmo tempo

**Banco**
- Multi-tenant: pronto para atender outras barbearias no mesmo sistema
- Feriados e folgas como bloqueios de agenda
- Preço cobrado e forma de pagamento guardados em cada atendimento, para o relatório de faturamento

---

## Roadmap

- [x] Definir stack do backend (#1)
- [x] Modelar e implementar o banco de dados (#2)
- [x] API de agendamento (#4)
- [x] Horários de funcionamento reais (#15)
- [ ] Login dos donos (#3)
- [ ] Integrar o site com a API (#5)
- [ ] Fotos e vídeo reais (#6)
- [ ] Dados reais do cliente: equipe, preços, contato (#7)
- [ ] Bloqueio de horários pelo painel (#16)
- [ ] Confirmação de agendamento via WhatsApp (#17)
- [ ] Painel dos donos com faturamento por barbeiro (#18)
- [ ] Deploy do site (#8) e do backend + banco (#9)
- [ ] Domínio próprio (#10)
- [ ] Planos mensais (#19, versão 2)

---

## Como contribuir

Ninguém faz commit direto na `main`. Toda mudança passa por branch e Pull Request.

1. Parta da `main` atualizada:
   ```bash
   git checkout main
   git pull
   ```
2. Crie uma branch por tarefa:
   ```bash
   git checkout -b feature/nome-da-tarefa
   ```
   | Prefixo | Uso |
   |---|---|
   | `feature/` | funcionalidade ou conteúdo novo |
   | `fix/` | correção de bug |
   | `docs/` | só documentação |
3. Confira o que vai no commit, depois suba:
   ```bash
   git status
   git add <arquivos>
   git commit -m "feat: descrição curta do que mudou"
   git push -u origin feature/nome-da-tarefa
   ```
4. Abra o PR (`base: main` ← `compare: sua-branch`). Escreva `Closes #N` na
   descrição para fechar a issue no merge e coloque o outro como revisor.
5. O revisor testa, aprova em **Files changed → Review changes → Approve** e só
   então faz o merge.
6. Apague a branch no GitHub e rode `git checkout main` + `git pull`.

O arquivo `backend/.env` guarda a senha do banco e nunca vai para o GitHub
(já está no `.gitignore`).

---

## Equipe

- [LuisRoneii](https://github.com/LuisRoneii): backend, banco de dados e lógica de agendamento
- [Fariolli](https://github.com/Fariolli): conteúdo, frontend e contato com o cliente