# Instruções do projeto para o Claude

> Copie este arquivo para a raiz de cada projeto e ajuste a seção "Stack" e "Comandos".
> Mantenha curto: tudo aqui é lido em toda conversa.

## Sobre
- Projeto: <NOME DO CLIENTE / PRODUTO>
- Tipo: site / SaaS / sistema de agendamento
- Responsáveis: Luís e Anthony
- Idioma: responda e comente o código em português do Brasil; nomes de variáveis em inglês.

## Stack
- Frontend: HTML, CSS e JavaScript puros (sem build), na raiz do repositório (`index.html`, `painel.html`, `css/`, `js/`).
- Backend: Node.js 20+ com Express 5 (ES modules), em `backend/`. Login do painel com bcrypt + JWT.
- Banco: PostgreSQL acessado com `pg` puro (sem ORM). Esquema em `database/schema.sql`, migrações numeradas em `database/NNN-*.sql`.
- Deploy: VPS própria (Hostinger ou Vultr, ainda a definir), com Nginx como proxy reverso na frente da API.

## Comandos
Os comandos do npm rodam dentro de `backend/`.
- Instalar: `npm install`
- Rodar local: `npm run dev` (reinicia sozinho ao salvar; produção usa `npm start`)
- Testes: `npm test` (runner nativo `node --test`)
- Criar/trocar senha de dono: `npm run criar-admin`
- Não há lint nem TypeScript configurados.

Sempre rode `npm test` antes de dizer que uma tarefa terminou.

## Forma de trabalhar
- Antes de mudanças grandes, proponha um plano curto e espere aprovação.
- Prefira mudanças pequenas e revisáveis. Não reescreva arquivos inteiros sem motivo.
- Use Context7 para consultar a documentação atual de bibliotecas antes de escrever código com APIs que você não tem certeza.
- Para validar telas, use o Playwright no `localhost` e confira o console.

## Git e GitHub
- Pode fazer commits locais com mensagens descritivas.
- **Nunca crie issues nem pull requests no GitHub.** Prepare título, descrição e o código, e deixe que eu crio.
- Nunca use `git push --force`.

## Design
- Siga os tokens em `design/tokens.md` (cores, fontes, espaçamentos) se o arquivo existir.
- Use componentes já existentes antes de criar novos.
- Todo layout precisa funcionar no celular (a maioria dos clientes finais agenda pelo celular).
- Acessibilidade básica: contraste, `alt` em imagens, labels em formulários.

## Segurança (obrigatório)
- Nunca coloque chaves, senhas ou tokens no código. Use variáveis de ambiente e mantenha `.env*` fora do git.
- Segredos (`DATABASE_URL`, `JWT_SEGREDO`, chave secreta do Stripe etc.) só no `backend/.env` do servidor, nunca no frontend.
- PostgreSQL: toda query usa parâmetros (`$1, $2…`), nunca texto do usuário concatenado no SQL.
- PostgreSQL: a API conecta com um usuário próprio de permissões mínimas (SELECT/INSERT/UPDATE/DELETE nas tabelas dela), nunca com `postgres`/superusuário. Migrações rodam com outro usuário.
- PostgreSQL: toda query de dados filtra por `barbearia_id` (o isolamento entre barbearias é feito no código, não no banco).
- Mudança de esquema vira um arquivo novo de migração em `database/`; não edite migrações já aplicadas.
- Valide toda entrada do usuário no servidor (use as funções de `backend/src/comum.js`), não só no formulário.
- Rotas da API (Express) precisam checar autenticação e autorização (o usuário pode mexer NESSE registro?).
- Dados pessoais (nome, telefone, e-mail de clientes) seguem a LGPD: colete o mínimo, não registre em logs, permita exclusão.
- VPS: Postgres escuta só em `localhost` (porta 5432 fechada no firewall); a API (porta 3000) só é acessada pelo Nginx.
- VPS: HTTPS obrigatório (Let's Encrypt), `TRUST_PROXY=1` no `.env` de produção, SSH só com chave (sem senha e sem login de root), atualizações de segurança automáticas e backup diário do banco guardado fora da VPS.
- Ao terminar uma feature que mexe com auth, pagamentos ou dados pessoais, rode a habilidade `revisao-seguranca`.

## Antes do deploy na VPS
- Instalar o plugin claude-security e rodar a varredura no projeto inteiro antes do primeiro deploy. Avise o Luís disso sempre que o assunto for deploy, VPS, Hostinger ou Vultr.
