# Design system — Nutri Helper

Registro das decisões visuais do app, derivadas do logo oficial, para manter consistência
nas próximas fatias. Fonte do logo (lockup completo, ícone + texto):
[`src/assets/brand/logo-lockup-source.png`](src/assets/brand/logo-lockup-source.png) — esse
arquivo é só a imagem da marca, sem dado pessoal, por isso fica versionado (diferente do
briefing, que fica fora do Git). O recorte usado no app vem de
[`src/assets/logo-mark.png`](src/assets/logo-mark.png) (só o ícone, sem o texto).

## Logo

- **Símbolo**: uma tigela (bowl) com folhas, tomate e cenoura saindo por cima, e uma lista
  de compras/checklist integrada à tigela. Representa literalmente os dois pilares do app:
  comida (o prato) e acompanhamento (a lista).
- **Versões**:
  - Lockup completo (ícone + "Nutri Helper") → arquivo fonte em `refs/`, não entra no app
    por enquanto (é PNG pesado, pensado para redes sociais/apresentação).
  - Só o ícone (`logo-mark.png`) → usado dentro do app (tela de login, cabeçalhos).
  - Ícones do PWA (`public/icons/`) e favicon (`public/favicon.png`) → o mesmo ícone,
    recortado e com fundo branco sólido (ver "Ícones do PWA" abaixo).
- **Não usar**: o símbolo sem a tigela (só os vegetais), nem recolorir o símbolo fora da
  paleta abaixo.

## Paleta de cores

Extraída por amostragem de pixel do logo oficial (não são valores "de olho"):

| Token CSS | Hex | Uso |
|---|---|---|
| `--green` | `#104030` | Verde escuro principal do logo (tigela, checklist, palavra "Nutri"). Cor primária de botões, ícones de marca, cabeçalhos de destaque. |
| `--green-dark` | `#0b2e21` | Variante mais escura de `--green`, usada em `:hover`/`:active` de botões primários. |
| `--green-bright` | `#409828` | Verde vivo do logo (folhas, palavra "Helper"). Para estados de sucesso/confirmação ("refeição marcada como feita") e realces secundários — ainda não usado nesta fatia, reservado para a tela "Hoje". |
| `--tomato` | `#f85048` | Vermelho do tomate no logo. Reservado para estados de alerta/erro visualmente alinhados à marca (hoje os banners de erro usam um vermelho mais neutro, `--error-text`/`--error-bg`; considerar migrar para este tom quando a tela "Hoje" tiver mais estados). |
| `--carrot` | `#f09820` | Laranja da cenoura no logo. Reservado para estados de atenção/pendência (ex.: "troca aguardando validação", like o `status` do plano do Thiago — seção 9 do briefing). |
| `--blue` | `#2f8fd1` | **Não vem do logo** — o logo não cobre o tema de hidratação. Azul escolhido à parte para água (barra de progresso, botão "Entrar com Google" não usa esta cor; é só reserva para a fatia de água). Pode ser ajustado quando a tela de água for desenhada. |

Neutros (claro/escuro, com suporte a `prefers-color-scheme: dark` — ver `src/index.css`):

| Token | Claro | Escuro |
|---|---|---|
| `--bg` | `#ffffff` | `#12151a` |
| `--surface` (campos de formulário) | `#f6f8f7` | `#1b1f24` |
| `--text` | `#16201b` | `#e7ece9` |
| `--text-muted` | `#5b655f` | `#9aa49e` |
| `--border` | `#e1e6e3` | `#2a2f34` |

Todos os tokens ficam em `src/index.css`: os claros em `:root`, os escuros repetidos em
`@media (prefers-color-scheme: dark)` (segue o sistema) e em `:root[data-theme='dark']`
(escolha manual no botão de tema, salva no aparelho — ver `src/lib/theme.ts`). Token
escuro novo entra nos dois blocos. Qualquer cor nova deve entrar como variável ali, não
hardcoded em componentes.

## Tipografia

- Fonte do sistema (`system-ui, 'Segoe UI', Roboto, sans-serif`) — sem fonte customizada
  carregada, para manter o app leve e sem dependência externa.
- O wordmark do logo usa uma fonte bold arredondada (estilo "geométrica"), mas o app **não**
  tenta replicar essa fonte em texto comum — só o logo em si carrega o lockup tipográfico.
  Títulos do app (`h1`) usam peso forte da fonte do sistema (`font-weight` padrão do
  navegador para `<h1>`), não negrito extra.

## Ícones do PWA

Gerados a partir do mesmo recorte do logo (`src/assets/logo-mark.png`), compostos sobre um
quadrado branco sólido:

- `public/icons/icon-192.png` e `icon-512.png`: ícone com ~12% de margem, fundo branco.
  Usados como ícone "any" do manifest.
- `public/icons/icon-512-maskable.png`: mesmo ícone com ~19% de margem (zona de segurança
  maior), fundo branco **sem** transparência nas bordas — necessário porque ícones
  "maskable" são recortados pelo sistema operacional em formas variadas (círculo, squircle
  etc.) e qualquer conteúdo fora da zona de segurança pode ser cortado.
- `public/favicon.png`: versão pequena (64×64) do mesmo ícone.

Se o logo for atualizado no futuro, regenerar esses arquivos a partir do novo PNG fonte
mantendo as mesmas proporções de margem (script usado nesta fatia: recorte do ícone sem o
texto, `sharp.trim()` para remover a margem transparente, depois compor sobre fundo branco
nos tamanhos acima).

## Botões e componentes (convenções já em uso)

- Alvo de toque mínimo: **44–48px de altura** (`.btn`, `.btn-link`, campos de formulário) —
  exigência do briefing (interface pensada para celular, alvos de toque grandes).
- Raio de borda: `10px` em campos de input, `12px` em botões — cantos suaves, consistentes
  com o estilo arredondado do próprio logo (folhas e tigela sem cantos vivos).
- Botão primário (`.btn-primary`): fundo `--primary`, texto branco, hover `--primary-hover`.
  No claro, `--primary` = `--green` / `--green-dark`. No escuro, `#237f58` / `#1a6b4a`:
  o verde do logo some no fundo escuro (contraste 1.6:1); este tom mantém texto branco em
  4.9:1 e o botão em 3.7:1 contra `--bg`.
- Logo no modo escuro (`.login-logo`): ganha fundo branco com cantos arredondados, igual ao
  ícone do PWA — a tigela verde-escura sumiria no fundo escuro, e recolorir o símbolo não é
  permitido (ver "Logo").
- Botão secundário "Google" (`.btn-google`): fundo neutro (`--bg`), borda `--border` — não
  usa a paleta de marca, para não competir com o ícone oficial do Google.
- Banners de mensagem (`.banner-error`, `.banner-info`): fundo suave + texto escuro da
  mesma família de cor, nunca cor pura sobre fundo branco (acessibilidade de contraste).

## Estrutura das telas

- **Telas logadas**: cabeçalho fixo no topo (`.app-header`) com logo + "Nutri Helper" à
  esquerda (leva para "Hoje") e, à direita, botão de tema e menu ☰ da conta (e-mail, "Minha
  conta", "Sair"). Ações da conta ficam só no menu, não soltas nas telas.
- **Telas sem login** (convite e login): sem cabeçalho; o botão de tema flutua no canto
  (`.theme-toggle-floating`). O login põe logo e nome lado a lado para caber sem rolar
  em 390×664.
- **Atenção/pendência** (`.banner-attention`, tokens `--attention-bg`/`--attention-text`):
  família do laranja-cenoura do logo. Usado no aviso do plano ("trocas aguardando validação").
- **Refeição em destaque**: borda `--primary` de 2px e selo "Agora"/"Próxima · em 1h20".

## O que falta decidir (próximas fatias)

- Cor definitiva para a função de água (hoje é só um `--blue` provisório, sem relação com o
  logo).
- Se `--green-bright`, `--tomato` e `--carrot` vão virar estados de UI (sucesso, erro,
  pendência) ou ficar só como cores decorativas do ícone.
- Ícone/ilustração para a tela "Hoje" e para o fluxo de envio de PDF (ainda não existem).
