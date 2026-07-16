# Mapa do Projeto — Gestão de Substabelecidos

Documento de referência do sistema: o que existe, como as peças conversam, onde cada coisa mora e quais pontos merecem atenção. Escrito para quem vai **manter**, **auditar** ou **assumir** o projeto.

Para a visão de negócio resumida, veja o [README](README.md). Para a identidade visual e os padrões de UI, veja o [DESIGN-SYSTEM](DESIGN-SYSTEM.md).

---

## 1. Visão geral

O sistema controla os **substabelecidos** da Prospecta — parceiros comerciais cadastrados em nome da empresa nos bancos — e tudo que orbita esse cadastro: os bancos parceiros, a produção mensal, a agenda de compromissos, os documentos anexados e um canal de dúvidas entre consultores e gestores.

É um **site estático** (HTML + CSS + JavaScript puro, sem framework e sem etapa de build) que fala direto com o **Supabase** (banco de dados PostgreSQL + autenticação + storage de arquivos) através de um **proxy Cloudflare Worker**.

```
Navegador (GitHub Pages)                Cloudflare Worker                Supabase
┌──────────────────────┐               ┌──────────────────┐            ┌──────────────────┐
│ index.html           │               │ prospecta-proxy  │            │ PostgREST  /rest │
│ styles.css           │  fetch  ───▶  │ .cayonauta       │  ────────▶ │ GoTrue     /auth │
│ app.js               │               │ .workers.dev     │            │ Storage /storage │
│ brasil-mapa.svg      │               │                  │            │                  │
└──────────────────────┘               │ injeta a apikey  │            │ RLS por token    │
                                       └──────────────────┘            └──────────────────┘
```

O papel do Worker é guardar a chave do Supabase. Repare em [app.js:3](app.js#L3): `SUPABASE_KEY` é **string vazia** no código do site — quem preenche o header `apikey` real é o Worker. Por isso `SUPABASE_URL` aponta para o domínio do Worker, e não para o Supabase.

> **O código-fonte do Worker não está neste repositório.** Ele é parte essencial da arquitetura e precisa ser localizado/versionado antes de qualquer auditoria séria — é ele quem detém a credencial e decide o que passa.

---

## 2. Arquivos

| Arquivo | Linhas | Papel |
|---|---|---|
| [index.html](index.html) | ~783 | Estrutura de todas as telas e modais. Tudo já existe no DOM; a navegação só troca `display`. |
| [app.js](app.js) | ~3710 | Toda a lógica: auth, chamadas REST, renderização, validação, PDFs, gráficos. |
| [styles.css](styles.css) | ~743 | Visual completo. Sem pré-processador. |
| [brasil-mapa.svg](brasil-mapa.svg) | — | Mapa do Brasil por UF, carregado sob demanda e colorido pelo painel. |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | — | Tokens e componentes visuais, para reuso em outros projetos. |

**Não há `package.json`, build, testes automatizados nem workflow de CI.** O deploy é o próprio push para o GitHub Pages: o que está no `main` é o que está no ar.

### Nota sobre o estilo do `app.js`

O arquivo tem marcas claras de ter passado por um **minificador e depois um beautifier**: `new Date` sem parênteses, `1e3`/`6e4` no lugar de `1000`/`60000`, ausência quase total de comentários. Ele é legível e editável, mas não é "código escrito à mão" no formato atual. Quem for auditar deve saber disso antes de julgar o estilo; quem for editar deve saber que não existe um fonte "original" mais bonito em outro lugar — **este é o fonte**.

---

## 3. Modos de acesso

São **dois modos**, com dois logins reais no Supabase (dois slots de sessão independentes, ver [app.js:245](app.js#L245)):

| Modo | Como entra | O que vê |
|---|---|---|
| **Consulta** | Senha única na conta compartilhada `consultor@prospecta.local` ([app.js:3254](app.js#L3254)) | Navegação lateral reduzida, sem botões de criar/editar, sem KPIs de gestão. Pode enviar dúvidas. |
| **Gestor** | Login + senha individuais (`login` vira `login@prospecta.local`, ver [app.js:250](app.js#L250)) | Todas as abas, criação/edição/exclusão, painel, histórico, respostas às dúvidas. |

Login é `password grant` no GoTrue; a sessão vai para `sessionStorage` e é renovada por um timer agendado um minuto antes de expirar ([app.js:335](app.js#L335)). Fechar o navegador encerra a sessão.

> **Ponto central para a auditoria:** `entrarGestor()` e `sairGestor()` ([app.js:1910](app.js#L1910)) apenas **mostram e escondem elementos da interface**. Não existe — nem poderia existir de forma confiável — controle de permissão no cliente. Quem realmente precisa impedir um consultor de gravar dados é a **RLS (Row Level Security) do Supabase**, avaliando o JWT de cada requisição. O código do site presume que essa RLS existe e está correta (ele até trata o caso, ver as mensagens "RLS bloqueou a exclusão" em [app.js:2846](app.js#L2846) e [app.js:2971](app.js#L2971)), mas **isso não é verificável a partir deste repositório**. Confirmar as políticas RLS tabela por tabela é o item número um de qualquer auditoria aqui.

---

## 4. Modelo de dados

Todas as tabelas são acessadas via PostgREST. Os nomes estão centralizados no `CONFIG` em [app.js:1-17](app.js#L1-L17).

| Tabela | Guarda | Campos principais |
|---|---|---|
| `substabelecidos` | O cadastro central | `nome_subs`, `cnpj_subs`, `cnpj_empresa`, `banco`, `tipo_cadastro`, `cod_loja_banco`, `cod_substabelecido`, `cod_parceiro`, `responsavel_empresa`, `superintendente`, `supervisor`, `gerente`, `comissao`, `status`, `obs` |
| `empresas_grupo` | Empresas do grupo Prospecta | `razao_social`, `fantasia`, `cnpj` |
| `bancos` | Bancos parceiros | `nome_banco`, `gerente_banco`, `contato_gerente`, `email_gerente`, `suporte_banco` |
| `banco_vinculos` | Qual empresa do grupo é credenciada em qual banco | `banco_id`, `empresa_grupo_id`, `codigo_corban`, `tipo_sub`, `status` |
| `producao_mensal` | Produção por sub e mês | `cod_substabelecido`, `mes_referencia`, `valor_bruto`, … |
| `producao_convenio` | Produção quebrada por convênio | `cod_substabelecido`, `banco`, `convenio_nome`, `valor_bruto`, `valor_liquido`, `valor_pago`, `valor_pendente`, `valor_cancelado`, `valor_em_andamento`, `valor_base_comissao` |
| `agenda` | Compromissos | `titulo`, `tipo`, `data`, `hora`, `alerta_dias_antes`, `vinculo_tipo`, `vinculo_nome`, `com_quem`, `link`, `observacoes` |
| `historico` | Trilha de auditoria | `acao`, `entidade`, `ref_id`, `descricao`, `criado_em` |
| `mensagem` | Dúvidas e respostas | `nome_enviou`, `mensagem_enviada`, `nome_respondeu`, `mensagem_respondida` |
| `banco_arquivos` | Anexos de banco (metadados) | aponta para o bucket `arquivos_bancos` |
| `substabelecido_arquivos` | Documentos do sub (metadados) | aponta para o bucket `arquivos_subs` |

**Storage:** dois buckets, `arquivos_bancos` e `arquivos_subs` ([app.js:2723](app.js#L2723) e [app.js:2855](app.js#L2855)). Os arquivos são lidos por **URL pública** (`/storage/v1/object/public/...`). Ou seja: quem tiver o link do arquivo acessa o arquivo, sem autenticação. Considerando que aqui trafegam documentos de credenciamento e CNPJs de parceiros, **avaliar se esses buckets deveriam ser privados com URL assinada é um item de auditoria.**

### Convenções importantes do domínio

- **Texto é gravado em maiúsculas.** Quase todo campo passa por `maiusc()` antes de ir ao banco ([app.js:1489](app.js#L1489)). Campo vazio vira `null`, nunca `""`.
- **A UF do sub é derivada do código, não é uma coluna.** `ufDoSub()` ([app.js:169](app.js#L169)) lê as duas primeiras letras de `cod_substabelecido` e valida contra a tabela `UF_REGIAO`. Se o padrão de codificação dos subs mudar, o mapa do painel e os recortes por região param de funcionar silenciosamente.
- **Status do sub:** `ATIVO`, `PENDENTE`, `EM_ANDAMENTO`, `INATIVO` ([app.js:1571](app.js#L1571)). Todo cadastro novo nasce `EM_ANDAMENTO`.
- **Um cadastro só é "real"** se tiver nome ou CNPJ preenchido (`isReal`, [app.js:137](app.js#L137)) — é isso que separa as linhas de verdade dos rascunhos nas contagens.
- **`comissao` é texto livre**, não número. Convenção: `"90%"` significa que o sub recebe 90% e 10% fica com a empresa. Obrigatório apenas quando `tipo_cadastro = SUBSTABELECIDO`.

---

## 5. As telas

A navegação é feita por `switchTab()` ([app.js:3282](app.js#L3282)), que troca a visibilidade de dez `<div>` já presentes no HTML e dispara o render da aba escolhida.

| Aba | View | O que faz |
|---|---|---|
| Painel | `viewPainel` | Indicadores gerais, donut/radar/barras/linha e o mapa do Brasil por UF. Clicar num recorte abre o detalhe. |
| Substabelecidos | `viewSubs` | Tabela principal com filtros, ordenação por coluna, paginação (25/página) e ficha em PDF. |
| Pendentes | `viewPendentes` | Recorte dos cadastros incompletos. |
| Bancos | `viewBancos` / `viewBancosConsulta` | Cadastro dos bancos, vínculo com empresa do grupo, passo a passo de credenciamento e anexos. Duas versões: gestor e consulta. |
| Produção | `viewProducao` | Busca um sub, mostra produção mensal e por convênio, com KPIs e barras. |
| Agenda | `viewAgenda` | Calendário mensal + lista, com alerta antecipado configurável por compromisso. |
| Histórico | `viewHist` | Últimos 300 registros da trilha de auditoria. |
| Dúvidas | `viewDuvidas` | Caixa de mensagens: consultor pergunta, gestor responde. |

Boa parte dos dados é carregada **uma vez** em `carregar()` ([app.js:400](app.js#L400)), que dispara cinco requisições em paralelo (subs, empresas, bancos, agenda, vínculos) e guarda tudo no objeto `state` ([app.js:19](app.js#L19)). Filtros, ordenação e KPIs trabalham em memória, sem novas idas ao servidor. Produção, histórico e dúvidas são carregados sob demanda ao abrir a aba.

---

## 6. Trilha de auditoria

`logHist()` ([app.js:2521](app.js#L2521)) grava na tabela `historico` a cada ação relevante — criar/editar sub, mudar status, criar/editar banco, mexer na agenda. É a fonte para responder "quem mudou o quê e quando".

Duas limitações a registrar:

1. **A gravação do histórico não bloqueia a ação.** Se o `logHist` falhar, a operação de negócio já aconteceu e simplesmente não fica registrada. A trilha é *best-effort*, não transacional.
2. **O histórico é exibido limitado aos 300 registros mais recentes** ([app.js:2546](app.js#L2546)). Os antigos continuam na tabela, mas não aparecem na tela — para auditar período anterior, é preciso consultar o Supabase direto.

---

## 7. Dados no navegador

Além da sessão, o app guarda três listas em `localStorage` ([app.js:87-135](app.js#L87-L135)):

| Chave | Para quê |
|---|---|
| `prospecta_duvidas_pendentes` | Dúvidas enviadas aguardando resposta, para acender o badge de notificação |
| `prospecta_minhas_duvidas` | As dúvidas que este navegador enviou |
| `prospecta_notif_historico` | Histórico local de notificações lidas |

Consequência prática: **"minhas dúvidas" é por navegador, não por pessoa.** Trocar de máquina ou limpar o navegador perde o vínculo — as mensagens continuam no banco, mas o usuário não as reconhece mais como suas.

---

## 8. Dependências externas

| O quê | De onde | Como é carregado |
|---|---|---|
| Fontes Inter, Source Serif 4, IBM Plex Mono | Google Fonts | `<link>` no `<head>` |
| jsPDF + html2canvas | CDN | Sob demanda, só ao exportar PDF (`loadPdfLibs`, [app.js:1077](app.js#L1077)) |
| Previsão do tempo | Open-Meteo | Ticker do topo (`initTicker`, [app.js:3636](app.js#L3636)) |
| Mapa do Brasil | arquivo local | `fetch` sob demanda, com cache em memória |

Não há gerenciador de pacotes: as versões das bibliotecas de CDN estão fixadas nas URLs dentro do `app.js`.

---

## 9. Pontos de atenção

Levantados a partir da leitura do código. **Nenhum deles é um problema confirmado** — são as perguntas que uma auditoria precisa responder olhando também o Supabase e o Worker, que estão fora deste repositório.

1. **Políticas RLS** — o item mais importante. Toda a separação entre gestor e consulta depende delas. O cliente não protege nada.
2. **O Cloudflare Worker não está versionado aqui.** Detém a credencial do Supabase e não há como revisar seu código, seu CORS ou seu rate limiting a partir deste repositório.
3. **Buckets públicos.** Documentos de credenciamento acessíveis por link direto, sem autenticação.
4. **Conta de consulta compartilhada.** Uma senha única para todos os consultores significa que a trilha de auditoria não consegue distinguir *qual* consultor fez o quê, e que a rotação da senha exige avisar todo mundo ao mesmo tempo.
5. **O README cita `importador_producao.html`, que não existe neste repositório.** Ou a ferramenta se perdeu, ou vive em outro lugar, ou a linha ficou obsoleta. Vale resolver — hoje é a única instrução escrita sobre como a produção entra no sistema.
6. **Sem testes e sem CI.** Todo push para o `main` vai direto ao ar. Não existe rede de segurança automatizada; a verificação é manual.
7. **A UF derivada do código do sub** é um acoplamento implícito entre uma convenção de nomenclatura e um recurso visível (mapa e recortes regionais).

---

## 10. Para quem vai mexer no código

- **Rodar localmente:** basta servir a pasta (`python -m http.server`, Live Server do VS Code, qualquer coisa). Abrir o `index.html` direto pelo `file://` quebra o `fetch` do `brasil-mapa.svg`.
- **Não há build.** Editou, salvou, recarregou. Publicar é dar push no `main`.
- **Ao adicionar um campo ao cadastro:** o campo precisa aparecer em quatro lugares — o `<input>` no `index.html`, o `payloadDoForm()` ([app.js:1484](app.js#L1484)), o preenchimento em `abrirForm()` ([app.js:1452](app.js#L1452)) e a coluna no Supabase.
- **Ao adicionar uma aba:** botão no `index.html` com `data-tab`, uma `<div id="viewX">`, e as duas entradas correspondentes em `switchTab()` ([app.js:3282](app.js#L3282)).
- **Ao adicionar um status ou um estilo:** siga as fórmulas do [DESIGN-SYSTEM](DESIGN-SYSTEM.md) — em especial a regra dos cantos retos e a das três famílias tipográficas. É o que mantém o sistema parecendo um sistema só.
- **Toda ação que muda dados deve chamar `logHist()`.** É o que sustenta a trilha de auditoria.
