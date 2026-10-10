# ZT Barber Club

Site e sistema de agendamento online da barbearia **ZT Barber Club**, em Rio Negro (PR).

O cliente marca o horário pelo site em menos de um minuto, sem criar conta: escolhe o
serviço, o barbeiro, o dia e o horário, e informa só o nome e o WhatsApp. Ele vê apenas
horários realmente livres. Os donos têm um painel com login para cuidar da agenda, dos
bloqueios, dos planos mensais e do faturamento.

Projeto desenvolvido em dupla para um cliente real.

---

## Funcionalidades

### Site (para o cliente)
- Seções: início, sobre, equipe, serviços, portfólio (fotos e vídeo), depoimentos, perguntas frequentes e contato
- Layout responsivo, tema preto e dourado
- Agendamento em 4 passos: serviço → barbeiro → dia → horário
- Dias fechados, feriados e dias lotados aparecem sinalizados
- Serviços longos ocupam o tempo todo que duram e não atravessam o almoço
- Lista dos próximos horários marcados naquele aparelho

### Painel dos donos (`painel.html`)
- Login com e-mail e senha
- **Agenda do dia:** concluir (valor, forma de pagamento e troca de serviço), marcar falta, cancelar e desfazer
- **Encaixe:** lança o cliente que chegou sem marcar e tira o horário do site na hora
- **Bloqueios:** folgas e feriados, avisando quem já estava marcado no período
- **Planos mensais:** venda do plano e consulta das visitas do cliente
- **Faturamento do mês:** total por barbeiro, por forma de pagamento e planos vendidos
- Conta de dono vê todos os barbeiros; conta de barbeiro vê só a própria agenda

### Regras garantidas pelo sistema
- Dois clientes nunca pegam o mesmo horário, mesmo clicando ao mesmo tempo (regra no próprio banco)
- Expediente com pausa de almoço, domingo fechado e feriados bloqueados até 2027
- Agendamento de hoje até 30 dias à frente
- Proteção contra abuso: limite de tentativas de login, de agendamentos por hora e de 3 horários futuros por WhatsApp

---

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Site e painel | HTML, CSS e JavaScript puro, sem framework nem build. Fontes Cinzel e Inter |
| API | Node.js 20+ com Express 5, `pg`, `bcryptjs`, `jsonwebtoken`, `helmet`, `express-rate-limit` |
| Banco de dados | PostgreSQL 14+ (usamos o 18) |
| Testes | `node:test`, sem dependências extras |

O PostgreSQL foi escolhido pela constraint `EXCLUDE`, que impede no próprio banco dois
agendamentos sobrepostos do mesmo barbeiro.

---

## Estrutura de pastas

```
barbearia-app/
├── index.html              # site do cliente
├── painel.html             # painel dos donos
├── css/                    # style.css (site) e painel.css (painel)
├── js/                     # script.js (site) e painel.js (painel)
├── img/                    # logo, ícones, equipe e portfólio
├── backend/                # API em Node.js (detalhes em backend/README.md)
│   ├── src/                # servidor, rotas, regras de agenda e segurança
│   ├── scripts/            # criar-admin.js (contas do painel)
│   └── test/
├── database/
│   ├── schema.sql          # cria as tabelas (banco novo)
│   ├── seed.sql            # dados iniciais da ZT Barber (banco novo)
│   └── 00N-*.sql           # atualizações para bancos que já existem
└── docs/
    └── database-schema.md  # modelagem do banco: diagrama, tabelas e regras
```

---

## Como rodar localmente

### 1. Banco de dados

Com o PostgreSQL instalado, abra o **SQL Shell (psql)** e rode:

```sql
\encoding UTF8
CREATE DATABASE zt_barber;
\c zt_barber
\encoding UTF8
\i 'C:/caminho/para/barbearia-app/database/schema.sql'
\i 'C:/caminho/para/barbearia-app/database/seed.sql'
```

`\dt` deve listar **11 tabelas**.

**Banco criado antes de alguma atualização?** O `schema.sql` e o `seed.sql` só valem para
banco novo. Num banco que já existe, rode em ordem os scripts numerados que ainda não
rodou: `002-combos-sobrancelha.sql`, `003-foto-train.sql`, `004-planos.sql`,
`005-codigo-agendamento.sql`, `006-telefone-barbeiros.sql`, `007-foto-zefe.sql` e
`008-confere-foto-zefe.sql`. Eles podem rodar mais de uma vez sem problema.

Antes dos `\i`, rode `\set ON_ERROR_STOP on`: assim o psql para no primeiro erro, em vez
de imprimir uma linha e seguir para o próximo script. A `008` dá erro de propósito se não
achar exatamente um barbeiro "Zefe" na barbearia 1. Nesse caso, confira o nome no banco
antes de continuar.

### 2. API

```bash
cd backend
npm install
copy .env.example .env     # Linux/Mac: cp .env.example .env
```

No `.env`, coloque a senha do PostgreSQL e um `JWT_SEGREDO` longo (o próprio arquivo
explica como gerar). Depois:

```bash
npm run dev
```

Teste em http://localhost:3000/api/saude, que deve responder `{"ok":true}`.

### 3. Conta do painel

```bash
npm run criar-admin
```

O script pergunta nome, e-mail, barbeiro ligado à conta, papel (`dono` ou `barbeiro`) e
senha. Rodar de novo com o mesmo e-mail troca a senha.

### 4. Site e painel

Abra o `index.html` e o `painel.html` com a extensão **Live Server** do VS Code (porta 5500).
Rodando localmente, as páginas falam com a API em `localhost:3000`; publicadas, usam
`/api` no mesmo domínio.

### Testes

```bash
cd backend
npm test
```

Rotas da API, respostas de erro e detalhes de segurança estão em
[`backend/README.md`](backend/README.md).

---

## Roadmap

- [x] Definir a tecnologia do backend (#1)
- [x] Modelar e implementar o banco de dados (#2)
- [x] Login dos donos (#3)
- [x] API de agendamento (#4)
- [x] Integrar o site com a API (#5)
- [x] Fotos e vídeo do portfólio (#6)
- [x] Dados reais da barbearia: equipe, preços e contato (#7)
- [x] Horários de funcionamento reais (#15)
- [x] Bloqueio de horários pelo painel (#16)
- [x] Painel dos donos com faturamento por barbeiro (#18)
- [x] Planos mensais (#19)
- [x] Segurança básica: limites de uso, cabeçalhos e aviso de privacidade
- [ ] Mensagem pronta no WhatsApp para confirmar, lembrar e avisar cancelamento (#17)
- [ ] Cliente ver e cancelar os próprios horários pelo site
- [ ] Domínio próprio
- [ ] Deploy do site, da API e do banco

---

## Como contribuir

Ninguém faz commit direto na `main`: ela só recebe mudanças por Pull Request com uma aprovação.

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
3. Confira o que vai no commit e suba:
   ```bash
   git status
   git add <arquivos>
   git commit -m "feat: descrição curta do que mudou"
   git push -u origin feature/nome-da-tarefa
   ```
4. Abra o PR (`base: main` ← `compare: sua-branch`), escreva `Closes #N` na descrição para
   fechar a issue no merge e coloque o outro como revisor.
5. O revisor testa, aprova em **Files changed → Review changes → Approve** e faz o merge
   (merge normal, sem squash).
6. Apague a branch no GitHub e, no PC:
   ```bash
   git checkout main
   git pull
   git fetch --prune
   git branch -d nome-da-branch
   ```

**Mudou o banco?** Além de atualizar o `schema.sql` e o `seed.sql`, crie um script numerado
em `database/` (`005-nome.sql`, ...) que possa rodar mais de uma vez sem quebrar, para os
bancos que já existem.

**Nunca vão para o GitHub:** o `backend/.env` (senha do banco e `JWT_SEGREDO`),
`node_modules`, arquivos zip e dados pessoais de clientes.

---

## Equipe

- [LuisRoneii](https://github.com/LuisRoneii): backend, banco de dados e lógica de agendamento
- [Fariolli](https://github.com/Fariolli): conteúdo, frontend, planos mensais e contato com o cliente