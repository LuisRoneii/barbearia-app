# Design tokens do projeto

> Um "design system" enxuto: só o que o Claude precisa para não inventar cores e tamanhos a cada tela.
> Preencha uma vez por cliente (a partir da logo/identidade dele) e mantenha na pasta `design/`.

## Cores
| Token | Valor | Uso |
|---|---|---|
| `--cor-primaria` | `#______` | botões principais, links |
| `--cor-primaria-hover` | `#______` | hover dos botões |
| `--cor-fundo` | `#______` | fundo das páginas |
| `--cor-superficie` | `#______` | cards, modais |
| `--cor-texto` | `#______` | texto principal |
| `--cor-texto-suave` | `#______` | legendas, placeholders |
| `--cor-sucesso` | `#______` | confirmação de agendamento |
| `--cor-erro` | `#______` | erros, cancelamentos |

Contraste mínimo: 4,5:1 entre texto e fundo.

## Tipografia
- Títulos: `<fonte>` (peso 600–700)
- Texto: `<fonte>` (peso 400), tamanho base 16px
- Escala: 12 / 14 / 16 / 20 / 24 / 32 / 40

## Espaçamento e forma
- Escala de espaço: 4 / 8 / 12 / 16 / 24 / 32 / 48 px
- Bordas arredondadas: 8px (cards), 999px (botões tipo pílula, se combinar com a marca)
- Sombras: no máximo 2 níveis

## Componentes base
Botão (primário, secundário, perigo), campo de texto, seletor de data/horário, card de serviço, modal de confirmação, toast.

## Tom
<ex.: "barbearia premium: escuro, dourado, direto ao ponto">
