# Design System — Prospecta (base para reuso)

Referência extraída de `styles.css` deste projeto. Copie os blocos de código abaixo como ponto de partida para um novo projeto com a mesma identidade visual.

## Filosofia

- **Cantos retos, sem arredondamento.** Todo elemento é reto (`border-radius:0`), exceto pontos/dots de status e o donut de gráfico, que são os únicos círculos propositais do sistema.
- **Sidebar escura (navy) + conteúdo claro.** Contraste forte entre a navegação (`--side-*`) e a área de trabalho (`--bg`, `--panel`).
- **Um único accent color** (`--cyan`) usado com moderação: links, foco, botão primário, barra ativa da aba.
- **Serifada para títulos, sans para o corpo, mono para números/códigos.** Essa mistura de 3 famílias é a assinatura visual do projeto.
- **Sombras suaves e rasas**, nunca sombras fortes — o sistema é "flat" com profundidade sutil.

## Tokens (cole direto no seu `:root`)

```css
:root{
  /* superfícies */
  --bg:#f3f6fa; --bg2:#eaf0f7; --panel:#ffffff; --panel2:#f6f9fd;
  --line:#dfe6f0; --line2:#c8d4e5;
  --col-alt:rgba(26,86,196,.04);

  /* texto */
  --txt:#122135; --muted:#54687f; --dim:#7f92a9;

  /* accent */
  --cyan:#1a56c4; --cyan-dim:#12409a;

  /* estados/status */
  --ativo:#0e8a5f; --inativo:#c93a3f; --warn:#a06514;

  /* sidebar (navy) */
  --side-bg:#0f1f38; --side-bg2:#182b4c; --side-line:#26395c;
  --side-txt:#e9eef8; --side-muted:#9aabc9; --side-dim:#6c7fa3;

  /* sombras */
  --shadow:0 12px 34px rgba(15,31,56,.10);
  --shadow-sm:0 2px 8px rgba(15,31,56,.05);

  /* tipografia */
  --sans:'Inter',system-ui,sans-serif;
  --disp:'Source Serif 4',Georgia,serif;
  --mono:'IBM Plex Mono','Roboto Mono',monospace;

  --tb-h:54px; /* altura da top band fixa */
}

*{box-sizing:border-box;border-radius:0!important}
.donut,.donut-hole{border-radius:50%!important} /* única exceção a cantos retos */

html,body{margin:0;height:100%}
body{
  background:var(--bg); color:var(--txt); font-family:var(--sans);
  font-size:15.5px; line-height:1.55; -webkit-font-smoothing:antialiased;
}
```

Fontes (Google Fonts), inclua no `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
```

## Uso dos tokens

| Token | Para que serve |
|---|---|
| `--txt` / `--muted` / `--dim` | texto principal / secundário / terciário (labels, hints) |
| `--cyan` / `--cyan-dim` | accent — links, foco, botão primário, hover de accent |
| `--ativo` / `--inativo` / `--warn` | verde/vermelho/âmbar para status (badges, KPIs, dots) |
| `--panel` / `--panel2` | fundo de cards (branco) / fundo levemente alternativo (barras de tabela, headers) |
| `--line` / `--line2` | bordas sutis / bordas um pouco mais fortes (hover, foco de tabela) |
| `--side-*` | tudo que é sidebar/topbar navy — nunca usar no conteúdo principal |
| `--disp` | títulos (`h1`, `h2`, `.k-val` de KPI, cabeçalhos de modal) |
| `--mono` | números, códigos, horários, valores tabulares |

## Botões

```css
.btn{
  border:1px solid var(--line2); background:#fff; color:var(--txt);
  padding:11px 18px; font-size:14px; font-weight:600; letter-spacing:.01em;
  transition:transform .12s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
  box-shadow:var(--shadow-sm);
}
.btn:hover{transform:translateY(-1px); border-color:#adbfd8; box-shadow:0 6px 18px rgba(15,31,56,.09)}
.btn:active{transform:translateY(0)}
.btn.primary{background:var(--cyan); border-color:var(--cyan); color:#fff}
.btn.primary:hover{background:var(--cyan-dim); border-color:var(--cyan-dim)}
.btn.ghost{background:transparent; box-shadow:none}
.btn.ghost:hover{background:#eef4fc}
.btn.danger{color:var(--inativo); border-color:#eecdce}
.btn.danger:hover{background:#fbeeee; border-color:var(--inativo)}
.btn.sm{padding:7px 13px; font-size:13px}
.btn:disabled{opacity:.55; cursor:not-allowed}
```

## Campos de formulário

```css
.field{display:flex; flex-direction:column; gap:6px; min-width:0}
.field label{font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:var(--dim); font-weight:600}
.field input,.field select,.field textarea{
  padding:13px 14px; font-size:15px; color:var(--txt);
  border:1px solid var(--line2); background:#fff; transition:.15s; width:100%;
}
.field input:focus,.field select:focus,.field textarea:focus{
  border-color:var(--cyan); box-shadow:0 0 0 3px rgba(26,86,196,.12); outline:none;
}
.field input[readonly]{background:var(--panel2); color:var(--muted); cursor:not-allowed; box-shadow:none}
```

## Badges de status

```css
.badge{display:inline-block; padding:4px 10px; font-size:11px; font-weight:600; letter-spacing:.08em; border:1px solid}
.badge.ativo{color:var(--ativo); background:#e6f5ef; border-color:#b3e0cd}
.badge.inativo{color:var(--inativo); background:#fbeeee; border-color:#f0cbcc}
.badge.pendente{color:var(--warn); background:#fdf6e7; border-color:#e8d5a4}
.badge.andamento{color:var(--cyan-dim); background:#eaf1fc; border-color:#b9cff2}
```

Padrão: `cor = var(--status)`, `background = versão bem clara (~95% branco) da mesma cor`, `border = versão ~70% clara`. Use essa fórmula pra criar novos status sem quebrar o padrão.

## Cards e KPIs

```css
.kpis{display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px}
.kpi{
  background:var(--panel); border:1px solid var(--line); border-top:3px solid var(--line2);
  padding:17px 20px; box-shadow:var(--shadow-sm); transition:.18s;
}
.kpi:hover{transform:translateY(-2px); border-top-color:var(--cyan); box-shadow:0 10px 26px rgba(15,31,56,.09)}
.kpi .k-label{font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:var(--dim); font-weight:600}
.kpi .k-val{font-family:var(--disp); font-weight:700; font-size:34px; margin-top:8px; color:var(--txt)}
.kpi .k-sub{font-size:13px; color:var(--muted); margin-top:7px}
```

Regra: card = fundo branco + borda cinza fina + **borda superior grossa (3px)** que fica cyan no hover. Esse "top accent" é reutilizado em cards, modais (`.modal{border-top:3px solid var(--cyan)}`) e no toast.

## Tabelas

```css
table{width:100%; border-collapse:collapse; font-size:14.5px; white-space:nowrap}
thead th{
  position:sticky; top:0; background:#fff; color:var(--muted);
  font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.1em;
  padding:12px 16px; text-align:left;
  box-shadow:inset 0 -2px var(--side-bg), inset 0 -3px var(--line);
}
tbody td{padding:15px 16px; border-bottom:1px solid var(--line)}
tbody tr:nth-child(even){background:#f9fbfe}
tbody tr:hover{background:#eef4fc}
```

Nota curiosa: o cabeçalho da tabela usa uma borda dupla (`inset 0 -2px var(--side-bg), inset 0 -3px var(--line)`) — uma linha escura fininha por cima de uma linha cinza mais grossa. Dá um efeito de "régua" sutil que reforça a identidade navy mesmo fora da sidebar.

## Modal / Overlay

```css
.overlay{
  position:fixed; inset:0; background:rgba(15,31,56,.42); backdrop-filter:blur(5px);
  display:none; align-items:center; justify-content:center; z-index:100; padding:20px;
}
.overlay.show{display:flex; animation:fadeIn .2s ease both}
.modal{
  background:var(--panel); border:1px solid var(--line2); border-top:3px solid var(--cyan);
  box-shadow:var(--shadow); width:100%; max-width:880px; max-height:90vh; overflow-y:auto;
}
.overlay.show .modal{animation:modalIn .28s cubic-bezier(.2,.8,.25,1) both}
.modal-head{display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-bottom:1px solid var(--line)}
.modal-head h2{font-family:var(--disp); font-weight:700; font-size:21px; margin:0; color:var(--txt)}
.modal-foot{display:flex; gap:11px; justify-content:flex-end; padding:18px 24px; border-top:1px solid var(--line); background:var(--panel2)}

@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes modalIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
```

### Variante "hero" (login, avisos importantes)

Um cabeçalho navy dentro do próprio modal, com ícone + kicker + título, usado quando a ação pede mais destaque (login, confirmação de acesso restrito):

```css
.login-hero{
  position:relative; background:var(--side-bg); color:var(--side-txt);
  padding:34px 34px 30px; text-align:center; border-bottom:3px solid var(--cyan);
}
.login-shield{width:46px; height:46px; color:#7fa9ee; margin-bottom:12px}
.login-kicker{display:block; font-size:10px; font-weight:600; letter-spacing:.28em; text-transform:uppercase; color:#7fa9ee}
.login-hero h2{font-family:var(--disp); font-weight:700; font-size:26px; margin:0; color:#fff}
.login-sub{font-size:13.5px; line-height:1.6; color:var(--side-muted); margin:12px auto 0; max-width:380px}
```

## Sidebar / navegação lateral (colapsável)

Ícone-only por padrão (84px), expande pra 220px com nome das abas ao clicar num toggle:

```css
.sidebar-col{
  flex:0 0 84px; background:var(--side-bg); border-right:1px solid var(--side-line);
  padding:14px 10px; display:flex; flex-direction:column; gap:16px;
  transition:flex-basis .2s ease;
}
.sidebar-col.expanded{flex-basis:220px!important}

.tab{
  background:none; border:none; border-left:3px solid transparent;
  display:flex; align-items:center; justify-content:center;
  padding:15px 0; font-size:0; font-weight:600; color:var(--side-muted); transition:.15s;
}
.tab-ic{width:26px; height:26px}
.tab:hover{color:#fff; background:var(--side-bg2)}
.tab.active{color:#fff; background:var(--side-bg2); border-left-color:var(--cyan)}

.sidebar-col.expanded .tab{justify-content:flex-start; gap:12px; padding:13px 12px; font-size:13.5px}
.sidebar-col.expanded .tab-ic{width:20px; height:20px}
```

Padrão de "aba ativa": fundo `--side-bg2` + barra esquerda de 3px na cor accent. É o mesmo padrão usado em `.badge.andamento`/links — sempre o cyan marca "isto está ativo/selecionado".

### Dot de notificação sobre um ícone de aba

```css
.tab{position:relative}
.tab-dot{
  display:none; position:absolute; top:9px; right:10px;
  width:9px; height:9px; border-radius:50%;
  background:var(--inativo); box-shadow:0 0 0 2px var(--side-bg);
}
.tab-dot.show{display:block}
```

## Toast

```css
#toast{
  position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(20px); opacity:0; transition:.25s;
  background:var(--side-bg); border:1px solid var(--side-line); border-left:3px solid var(--cyan);
  padding:13px 22px; font-weight:600; font-size:14px; z-index:200; box-shadow:var(--shadow); color:#fff;
}
#toast.show{opacity:1; transform:translateX(-50%) translateY(0)}
#toast.ok{border-left-color:#35c98e}
#toast.err{border-left-color:var(--inativo)}
```

## Regras rápidas ao aplicar em um novo projeto

1. Nunca arredondar nada, exceto dots/círculos de status — é isso que dá a sensação "régua/documento" do sistema.
2. Título de seção/modal sempre em `--disp` (serifada); todo o resto em `--sans`.
3. Todo número que representa quantidade/código/hora vai em `--mono` com `font-variant-numeric:tabular-nums`.
4. Accent (`--cyan`) é escasso de propósito — se tudo for azul, nada parece importante.
5. Card/modal/kpi sempre com uma borda superior grossa (3px) que serve de "assinatura" do bloco.
6. Sidebar e topbar são os únicos lugares com fundo escuro; conteúdo é sempre claro.
