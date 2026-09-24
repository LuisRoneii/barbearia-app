# Train Barber

Site institucional e de agendamento online para a barbearia **Train Barber**.
Projeto desenvolvido em dupla, também usado como peça de portfólio.

---

## Sobre o projeto

Site em página única com identidade visual em preto e azul neon, apresentando
a barbearia, a equipe, os serviços e um sistema de agendamento onde o cliente
escolhe o profissional, o dia e o horário.

**Status atual:** frontend funcional, com cadastro/agendamento simulado no
navegador (`localStorage`). Aguardando informações do cliente para avançar
para um backend com banco de dados real.

---

## Tecnologias

- HTML5
- CSS3 (sem framework — CSS puro, com variáveis de tema)
- JavaScript vanilla (sem framework/build step)
- Fontes: [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) e [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts)

Planejado para as próximas etapas:
- Backend (a definir: Node.js ou serviço gerenciado tipo Supabase/Firebase)
- Banco de dados real (clientes, barbeiros, agendamentos)

---

## Estrutura de pastas

```
barbearia-app/
├── index.html          # página principal
├── css/
│   └── style.css       # estilos do site
├── img/                # fotos (equipe, portfólio) — vazio até o cliente enviar o material
├── js/
│   └── script.js       # lógica: cadastro, login, agendamento, conteúdo dinâmico
├── .gitignore
└── README.md
```

---

## Como rodar localmente

Não precisa de instalação nem servidor — é um site estático.

1. Clone o repositório:
   ```
   git clone https://github.com/LuisRoneii/barbearia-app.git
   cd barbearia-app
   ```
2. Abra o `index.html` direto no navegador, **ou** use a extensão "Live Server"
   do VS Code pra recarregar automaticamente a cada alteração.

---

## Funcionalidades atuais

- **Seções institucionais:** hero, sobre, equipe, serviços, portfólio, depoimentos, FAQ e contato.
- **Cadastro e login** de clientes (simulado no navegador via `localStorage`).
- **Agendamento em 4 passos:** serviço → profissional → dia → horário, mostrando
  apenas os horários realmente livres na agenda de cada barbeiro.
- **"Meus agendamentos"**, listando os horários marcados pelo cliente logado.

### Limitação conhecida

Cadastros e agendamentos ficam salvos **apenas no navegador de quem acessa**
(não há banco de dados nem servidor ainda). Ótimo para demonstração e
portfólio; para uso real em produção, é necessário o backend planejado no
roadmap abaixo.

---

## Roadmap

- [ ] Definir e modelar o banco de dados (clientes, barbeiros, serviços, agendamentos)
- [ ] Construir API de backend (cadastro, login, agendamento)
- [ ] Trocar o `localStorage` do `script.js` por chamadas reais à API
- [ ] Substituir fotos placeholder (equipe/portfólio) pelas imagens reais do cliente
- [ ] Preencher dados reais (endereço, telefone, redes sociais, valores)
- [ ] Deploy do site (frontend) e do backend
- [ ] Domínio próprio

---

## Como contribuir (fluxo de Git do projeto)

1. Sempre partir da `main` atualizada:
   ```
   git checkout main
   git pull
   ```
2. Criar uma branch por tarefa, com prefixo `feature/` (novidade) ou `fix/` (correção):
   ```
   git checkout -b feature/nome-da-tarefa
   ```
3. Commitar e subir a branch:
   ```
   git add .
   git commit -m "Descrição curta do que mudou"
   git push -u origin feature/nome-da-tarefa
   ```
4. Abrir um Pull Request no GitHub (`base: main` ← `compare: feature/nome-da-tarefa`)
   para o outro revisar antes do merge.
5. Depois do merge, apagar a branch e atualizar a `main` local.

Nunca commitar direto na `main`.

---

## Equipe do projeto

- Desenvolvimento frontend, produto e organização do repositório
- Colaborador: desenvolvimento e conteúdo (equipe/fotos)

Projeto de portfólio desenvolvido para um cliente real (barbearia parceira).