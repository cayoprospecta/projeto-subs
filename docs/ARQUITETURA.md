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

O papel do Worker é guardar a chave do Supabase. No código do site **não existe mais** uma `SUPABASE_KEY` — ela foi removida do `CONFIG` ([app.js:1-16](app.js#L1-L16)); quem preenche o header `apikey` real é o Worker. Por isso `SUPABASE_URL` aponta para o domínio do Worker, e não para o Supabase. O site envia apenas o `Authorization: Bearer <JWT do usuário>` ([app.js:55](app.js#L55)), e é esse JWT que a RLS avalia.

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

São **três modos**, sobre dois slots de sessão independentes (ver [app.js:245](app.js#L245)): consulta usa o slot `consultor`; gestor e diretoria dividem o slot `gestor`, distinguidos pelo papel no token.

| Modo | Como entra | O que vê |
|---|---|---|
| **Consulta** | Senha única na conta compartilhada `consultor@prospecta.local` ([app.js:3254](app.js#L3254)) | Navegação lateral reduzida, sem botões de criar/editar, sem KPIs de gestão. Pode enviar dúvidas. |
| **Diretoria** | Login individual com `app_metadata.role = 'diretor'` | Somente leitura: Painel Sintético, Substabelecidos, Pendentes/Andamento e Produção. Sem Colaboradores (PII), Bancos, Empresas, Agenda, Histórico e Dúvidas. Não cria nem edita nada. |
| **Gestor** | Login + senha individuais (`login` vira `login@prospecta.local`, ver [app.js:250](app.js#L250)) | Todas as abas, criação/edição/exclusão, painel, histórico, respostas às dúvidas. |

O papel sai de `app_metadata.role` no JWT, lido por `papelDoUsuario()`. **Só `role = 'gestor'` abre a tela de gestor** — qualquer outro valor, inclusive papel ausente, cai na visão de leitura da diretoria. Isso é deliberado: usuário criado pela UI do Supabase nasce sem `app_metadata`, e errar para o lado restritivo mostra pouco demais, enquanto errar para o outro daria escrita a quem não deveria. Ainda assim, **todo usuário novo deve receber papel explícito**. A UI de Authentication → Users não edita `app_metadata`, então o papel é setado por SQL, sempre com merge (`||`) para não apagar o `{"provider":"email",...}` que já está lá e quebrar o login:

```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"diretor"}'::jsonb
 where email = 'fulano@prospectapromotora.com.br';

-- conferir que ninguém ficou sem papel:
select email, raw_app_meta_data ->> 'role' as papel from auth.users order by email;
```

No código, `state.gestor` continua sendo o **único** gate de edição em toda a tela; `state.diretor` só libera leitura. Um papel novo que não deva escrever não precisa tocar em nenhum dos gates existentes.

Login é `password grant` no GoTrue; a sessão vai para `sessionStorage` e é renovada por um timer agendado um minuto antes de expirar ([app.js:335](app.js#L335)). Fechar o navegador encerra a sessão.

> **Ponto central:** `entrarGestor()` e `sairGestor()` ([app.js:1910](app.js#L1910)) apenas **mostram e escondem elementos da interface**. Não existe — nem poderia existir de forma confiável — controle de permissão no cliente. Quem impede um consultor de gravar dados é a **RLS (Row Level Security) do Supabase**, avaliando o JWT de cada requisição (as mensagens "RLS bloqueou a exclusão" em [app.js:2846](app.js#L2846) e [app.js:2971](app.js#L2971) tratam justamente esse caso).
>
> **Estado em 17/07/2026:** as políticas RLS foram revisadas tabela por tabela e reescritas para separar gestor de consulta de verdade. A distinção usa o papel gravado em `app_metadata` de cada usuário (`role = gestor` ou `consulta`), lido pela função `public.eh_gestor()`. Escrita (INSERT/UPDATE/DELETE) exige gestor; leitura é liberada para qualquer autenticado; `historico` é append-only. O passo a passo, os scripts e os testes estão em [docs/seguranca/](seguranca/). Antes disso, as políticas existiam mas eram permissivas (`using true`) — a separação era só visual.
>
> **Estado em 22/07/2026:** somou-se o papel `diretor`, com a função `public.eh_diretor()` no mesmo desenho da `eh_gestor()` (lê `app_metadata`, não é `SECURITY DEFINER`, `auth.jwt()` qualificada pelo schema). Como `eh_gestor()` exige `role = 'gestor'`, o diretor já é negado por todas as policies de escrita sem que nenhuma precise mudar. A única concessão é leitura de `producao_mensal`, via policy **aditiva** — policies permissivas são combinadas com OR, então dá para conceder sem `DROP POLICY` (que trava com o site aberto, pelo lock do polling):
>
> ```sql
> create or replace function public.eh_diretor() returns boolean language sql stable as $$
>   select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'diretor', false);
> $$;
> revoke all on function public.eh_diretor() from public;
> grant execute on function public.eh_diretor() to authenticated;
>
> create policy producao_mensal_select_diretor on public.producao_mensal
>   for select to authenticated using (public.eh_diretor());
> ```
>
> O diretor **não** ganha `gerentes_comerciais` (PII — usa a view `gerentes_publicos`), `empresas_grupo`, `agenda`, `historico`, `mensagem` nem os anexos. `substabelecidos`, `bancos` e `banco_vinculos` já eram select para qualquer autenticado, então Painel, Subs e Pendentes funcionaram sem mudança.
>
> Os scripts `.sql` não são versionados aqui (ver `.gitignore`) — por isso o essencial está transcrito acima.

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

**Storage:** dois buckets, `arquivos_bancos` e `arquivos_subs` ([app.js:2722](app.js#L2722) e [app.js:2856](app.js#L2856)). **Desde 17/07/2026 os buckets são privados.** Não há mais URL pública: o app gera um **link assinado** que expira em 5 minutos no momento em que o usuário clica no anexo (`abrirArquivoAssinado`, [app.js:2728](app.js#L2728)), e só quem está autenticado consegue gerar o link. Subir e apagar arquivo exige gestor (RLS de `storage.objects`); ver/gerar link é liberado a qualquer autenticado. Detalhes e o roteiro em [docs/seguranca/](seguranca/).

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

### 9.1. Segurança — endurecimento de 17/07/2026

Uma revisão de segurança olhou o Supabase de verdade (não só o código do site) e fechou os itens abaixo. Todo o trabalho — diagnóstico, scripts, testes e rollback — está versionado em [docs/seguranca/](seguranca/).

| O que era | O que se descobriu / fez | Estado |
|---|---|---|
| **Políticas RLS** | RLS estava ligada, mas as políticas eram `using true` — a separação gestor/consulta só existia na interface. Reescritas por papel (`eh_gestor()` via `app_metadata`). | ✅ Fechado |
| **Buckets públicos** | Eram públicos e liam por link permanente. Agora privados, com link assinado que expira em 5 min. | ✅ Fechado |
| **`anon` no storage** | Qualquer um sem login podia subir e apagar arquivos. Políticas removidas. | ✅ Fechado |
| **RPC legado `verificar_acesso_consultor`** | Função `SECURITY DEFINER` com `EXECUTE` para `anon`/`PUBLIC` — oráculo de senha aberto à internet. `EXECUTE` revogado. | ✅ Fechado |
| **`mensagem` e `codigo_parceiro` legíveis por `anon`** | Qualquer um sem login lia as dúvidas / a tabela. Políticas `anon` removidas. | ✅ Fechado |
| **Consultor escrevendo no storage** | Políticas de storage não checavam papel. Agora upload/exclusão exigem gestor. | ✅ Fechado |

**Ainda aberto:**

1. **O Cloudflare Worker não está versionado aqui.** Detém a credencial do Supabase. Duas coisas precisam ser confirmadas no código dele: que injeta a chave **anon** (nunca a `service_role` — senão toda a RLS acima é ignorada) e que o **CORS** restringe a origem ao domínio do GitHub Pages. Todas as evidências indicam que a RLS está de fato valendo, mas o Worker é a única peça não auditável a partir deste repositório.
2. **Conta de consulta compartilhada.** Uma senha única para todos os consultores significa que a trilha de auditoria não distingue *qual* consultor fez o quê, e que a rotação da senha exige avisar todo mundo ao mesmo tempo. A estrutura para logins individuais parece já existir (tabela `acessos`, hoje sem uso).

### 9.2. Outros pontos

3. **O README cita `importador_producao.html`, que não existe neste repositório.** Ou a ferramenta se perdeu, ou vive em outro lugar, ou a linha ficou obsoleta. Vale resolver — hoje é a única instrução escrita sobre como a produção entra no sistema.
4. **`producao_convenio` ainda não existe no banco.** O `CONFIG` a referencia ([app.js:12](app.js#L12)) e a aba Produção a consulta ([app.js:3126](app.js#L3126)). A chamada falha silenciosamente (o `catch` guarda lista vazia) — adiado por decisão, será populado depois. Quem for escrever SQL sobre ela deve **checar a existência antes** (`to_regclass('public.producao_convenio') is not null`, dentro de um `do $$ ... $$`): ao criar o papel `diretor` em 22/07/2026, uma `create policy` direta sobre ela abortou o script inteiro, e como o SQL Editor roda em transação isso quase reverteu o que já tinha funcionado. A tabela de produção que **existe** hoje é a `producao_mensal`.
5. **Sem testes e sem CI.** Todo push para o `main` vai direto ao ar. Não existe rede de segurança automatizada; a verificação é manual.
6. **A UF derivada do código do sub** é um acoplamento implícito entre uma convenção de nomenclatura e um recurso visível (mapa e recortes regionais).

---

## 10. Para quem vai mexer no código

- **Rodar localmente:** basta servir a pasta (`python -m http.server`, Live Server do VS Code, qualquer coisa). Abrir o `index.html` direto pelo `file://` quebra o `fetch` do `brasil-mapa.svg`.
- **Não há build.** Editou, salvou, recarregou. Publicar é dar push no `main`.
- **Ao adicionar um campo ao cadastro:** o campo precisa aparecer em quatro lugares — o `<input>` no `index.html`, o `payloadDoForm()` ([app.js:1484](app.js#L1484)), o preenchimento em `abrirForm()` ([app.js:1452](app.js#L1452)) e a coluna no Supabase.
- **Ao adicionar uma aba:** botão no `index.html` com `data-tab`, uma `<div id="viewX">`, e as duas entradas correspondentes em `switchTab()` ([app.js:3282](app.js#L3282)).
- **Ao adicionar um status ou um estilo:** siga as fórmulas do [DESIGN-SYSTEM](DESIGN-SYSTEM.md) — em especial a regra dos cantos retos e a das três famílias tipográficas. É o que mantém o sistema parecendo um sistema só.
- **Toda ação que muda dados deve chamar `logHist()`.** É o que sustenta a trilha de auditoria.
