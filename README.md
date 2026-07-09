# Prospecta

**Sistema interno de gestão de substabelecidos (sub-agentes bancários)**

Prospecta é uma aplicação web para gerenciar o relacionamento da empresa com seus substabelecidos — parceiros comerciais vinculados a múltiplos bancos — cobrindo cadastro, acompanhamento de status, produção mensal, documentação, agenda e histórico de auditoria. Todo o sistema é operado em português e pensado para o dia a dia de uma equipe comercial/administrativa em um contexto bancário.

---

## Índice

- [Stack técnica](#stack-técnica)
- [Modos de acesso](#modos-de-acesso)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Banco de dados](#banco-de-dados)
- [Funcionalidades](#funcionalidades)
  - [Substabelecidos](#substabelecidos)
  - [Bancos](#bancos)
  - [Produção mensal](#produção-mensal)
  - [Painel sintético (KPIs)](#painel-sintético-kpis)
  - [Agenda](#agenda)
  - [Dúvidas (modo consulta)](#dúvidas-modo-consulta)
  - [Histórico / auditoria](#histórico--auditoria)
- [Identidade visual](#identidade-visual)
- [Setup do zero](#setup-do-zero)
- [Ferramentas auxiliares](#ferramentas-auxiliares)
- [Convenções de código](#convenções-de-código)
- [Limitações conhecidas](#limitações-conhecidas)

---

## Stack técnica

Frontend puro — sem framework, sem bundler, sem build step.

| Camada | Tecnologia |
|---|---|
| Estrutura | HTML5 (`index.html`) |
| Lógica | JavaScript vanilla (`app.js`) |
| Estilo | CSS puro (`styles.css`) |
| Backend | [Supabase](https://supabase.com) via PostgREST + Storage + RPC (chave anônima, sem servidor próprio) |
| Autenticação do gestor | RPC `public.login_gestor` com `pgcrypto`/`bcrypt` |
| PDFs | jsPDF + jsPDF-AutoTable, carregados sob demanda via CDN (cdnjs) |
| Clima | API pública Open-Meteo |
| Fontes | Google Fonts — Source Serif 4, Inter, IBM Plex Mono |

Não há Node, não há `package.json`, não há etapa de build. Os três arquivos (`index.html`, `app.js`, `styles.css`) sobem direto para qualquer hospedagem estática.

---

## Modos de acesso

O sistema tem duas personas, definidas em tempo de execução (não por rota):

### 🔐 Gestor
Acesso completo, protegido por login (usuário + senha via RPC bcrypt). Hoje contempla duas gestoras: **Michelle** e **Grazi**, cada uma com saudação personalizada ao entrar. Pode:
- Criar, editar e alterar status de substabelecidos e bancos
- Consultar e lançar produção mensal
- Anexar documentos e arquivos de apoio
- Gerenciar a agenda de compromissos
- Responder dúvidas enviadas por consultores
- Ver o histórico completo de auditoria

### 👁️ Consulta
Acesso somente leitura, pensado para quem não é gestor. Sidebar vertical, ícone-only, fixa em 82px (sem expandir). Pode:
- Consultar substabelecidos (com seleção de banco obrigatória antes de listar)
- Ver bancos cadastrados
- Enviar dúvidas ao gestor via modal
- Acompanhar "Minhas dúvidas" — persistidas em `localStorage` sob a chave `prospecta_minhas_duvidas`

---

## Estrutura de arquivos

```
├── index.html                      → estrutura de todas as views/modais
├── app.js                          → toda a lógica (fetch ao Supabase, render, eventos)
├── styles.css                      → identidade visual completa
├── setup_anexos.sql                → tabela + bucket de anexos dos BANCOS
├── setup_anexos_subs.sql           → tabela + bucket de anexos dos SUBSTABELECIDOS
├── setup_producao.sql              → tabela de produção mensal (histórico)
├── setup_producao_convenio.sql     → tabela de produção por convênio (snapshot via API)
└── importador_producao.html        → ferramenta standalone: CSV → SQL de importação
```

Cada arquivo `setup_*.sql` é independente e idempotente (usa `if not exists` / `on conflict do nothing`) — pode ser rodado mais de uma vez sem quebrar nada.

---

## Banco de dados

Todas as tabelas vivem no schema `public` do Supabase, acessadas via PostgREST com a chave `anon`. RLS está habilitado em todas, com policies explícitas liberando `anon` (não há tabela sem policy — isso já causou 401 no passado e ficou documentado como "nunca esquecer").

| Tabela | Finalidade |
|---|---|
| `substabelecidos` | Cadastro principal — nome, CNPJ, empresa/grupo, banco, tipo, códigos, comissão, status, observações (JSON serializado no campo `observacao`) |
| `bancos` | Bancos parceiros — nome, gerente, contato, e-mail, passo a passo, status |
| `empresas_grupo` | Empresas do grupo, usadas para preencher CNPJ automaticamente |
| `historico` | Log de auditoria — toda ação relevante grava aqui (quem, quando, o quê) |
| `banco_arquivos` | Anexos vinculados a um banco (checklists, manuais etc.) |
| `substabelecido_arquivos` | Documentos vinculados a um substabelecido (contrato social, RG, comprovantes) |
| `producao_mensal` | Histórico mensal de produção por sub — banco, convênio, forma de contrato, valor, qtd. contratos |
| `producao_convenio` | Snapshot atual (não histórico) de produção por convênio, sincronizado diariamente via API externa/n8n |
| `agenda` | Compromissos do gestor (reuniões, novos cadastros, outros) |
| `mensagem` | Dúvidas enviadas pelos consultores e respostas do gestor |

Storage buckets (públicos): `arquivos_bancos` e `arquivos_subs`.

### Colunas particulares que valem nota
- O nome do sub é `nome_subs` (não `empresa` — houve rename no meio do projeto)
- O CNPJ do sub é `cnpj_subs`; o CNPJ do grupo é parametrizado via `CONFIG.COL_CNPJ_GRUPO`
- `status` do substabelecido aceita 4 valores: `ATIVO`, `PENDENTE`, `EM_ANDAMENTO`, `INATIVO`
- Todo substabelecido **nasce com status `EM_ANDAMENTO`** — a evolução para os demais status é manual, feita pelo gestor

---

## Funcionalidades

### Substabelecidos

- CRUD completo com modal de criação em 2 passos (formulário → observação inicial opcional)
- **Alterar status**: popover com as 4 opções (Ativo / Pendente / Em andamento / Inativo), cada uma com indicador colorido e marcação da opção atual
- Clique na linha da tabela abre a **ficha completa do sub** — containers separados (Identificação, Vínculo bancário, Gestão comercial), com exportação em PDF com a identidade visual do sistema
- Ordenação alfabética clicável nas colunas **Empresa, Banco, Tipo e Comissão** (seta ▲/▼, com números tratados corretamente)
- Campo **Comissão obrigatório** apenas quando o tipo de cadastro é `SUBSTABELECIDO` (ex.: "90%" = repasse ao sub, o restante fica com a empresa)
- Modal de **Observações** em formato de chat (blocos com autor/data), com painel lateral de **documentos anexados** (Storage), disponível só depois que o sub já foi salvo
- Telefone do gerente vira link `wa.me` direto para o WhatsApp

### Bancos

- CRUD com inativação/reativação
- Modal de **passo a passo** por banco: anotações + painel de arquivos anexados com título customizável (checklists, manuais)
- Sidebar de filtros usa a tabela `bancos` como fonte única de verdade (não deriva de valores distintos em `substabelecidos`)

### Produção mensal

Aba exclusiva do gestor. Fluxo de filtros progressivos:

1. Busca por **nome ou código do substabelecido** (autocomplete deduplicado por código — não repete por banco)
2. Ao selecionar, revela filtros de **Banco** e **Mês** (populados só com os valores existentes para aquele sub)
3. Mostra **produção sintética**: KPIs (valor produzido, contratos, bancos, meses com produção) + containers de Bancos vendidos / Convênios / Formas de contrato
4. Bloco separado: **Situação atual por convênio** — snapshot vindo da tabela `producao_convenio` (atualizada diariamente via n8n), com pendente/pago/em andamento/cancelado/líquido/bruto/base de comissão
5. Tabela detalhada linha a linha, filtrável

Se o sub não tiver nenhum dado em nenhuma das duas fontes, aparece um aviso claro em vez de zeros.

### Painel sintético (KPIs)

- KPIs clicáveis (Total, Ativos, Pendentes, Em andamento, Inativos, Incompatíveis) que filtram todos os gráficos abaixo
- Donut **Por região** (grande, ocupa a linha inteira), com legenda clicável — abre modal de detalhe com breakdown por UF e lista de subs da região
- Torres **Por banco** e **Por UF**, lado a lado — barras clicáveis abrem modal de detalhe (lista de subs daquele banco / ranking de bancos daquela UF)
- Todo modal de detalhe tem botão **Exportar PDF**, com relatório formatado (cabeçalho institucional, KPIs, tabelas)

### Agenda

- Calendário mensal com eventos coloridos por tipo (Reunião, Novo cadastro, Outro) e alerta visual para eventos vencidos/urgentes
- Lista lateral de próximos compromissos

### Dúvidas (modo consulta)

- Consultor envia dúvida via modal; fica salva em `mensagem` e espelhada em `localStorage` ("Minhas dúvidas")
- Gestor responde pela aba Dúvidas; notificação com contador não lido

### Histórico / auditoria

- Toda ação relevante (criar sub, mudar status, anexar documento, responder dúvida etc.) grava linha em `historico` com quem/quando/ação/descrição

---

## Identidade visual

Estilo **corporativo sóbrio**, tema branco com paleta azul institucional.

| Elemento | Valor |
|---|---|
| Azul institucional | `#1a56c4` |
| Navy (faixa superior / sidebar) | `#0f1f38` |
| Fonte de título | Source Serif 4 |
| Fonte de UI | Inter |
| Fonte de dados/códigos | IBM Plex Mono |
| Border-radius | **Zero em todo o sistema** — única exceção são os gráficos donut (que precisam ser círculos) |

Faixa superior fixa com relógio de Brasília ao vivo e ticker de previsão do tempo (Open-Meteo, Maceió).

---

## Setup do zero

1. Crie um projeto no Supabase
2. No SQL Editor, rode nesta ordem (todos são idempotentes):
   ```
   setup_anexos.sql
   setup_anexos_subs.sql
   setup_producao.sql
   setup_producao_convenio.sql
   ```
   (as tabelas base — `substabelecidos`, `bancos`, `empresas_grupo`, `historico`, `agenda`, `mensagem` — precisam existir antes; se você está clonando este repositório para reconstruir o schema do zero, entre em contato com o mantenedor para o SQL das tabelas base, que não está incluso aqui)
3. Em `app.js`, atualize `CONFIG.SUPABASE_URL` e `CONFIG.SUPABASE_KEY` (chave `anon`) para o seu projeto
4. Suba `index.html`, `app.js` e `styles.css` para qualquer hospedagem estática (ou abra `index.html` localmente)
5. Crie os logins de gestor via RPC `login_gestor` com a senha em bcrypt

---

## Ferramentas auxiliares

### `importador_producao.html`

Ferramenta standalone (não faz parte do app principal) para transformar planilhas CSV de produção em SQL pronto para colar no Supabase. Não depende de nenhuma CDN — parser CSV embutido, decodificação automática (UTF-8/Windows-1252), detecção de delimitador.

Fluxo: upload → mapeamento de colunas (com auto-detecção) → seleção de status a incluir → geração do SQL (`DELETE` de segurança + `INSERT`) com prévia e botões de copiar/baixar.

Abrir localmente no navegador, sem instalação.

---

## Convenções de código

- Helpers e padrões que **sempre** devem ser preservados em qualquer alteração: `H()` (headers Supabase), `norm()`, `parseObs()`/`serialObs()`, `fmtData()`, `logHist()`, `ufDoSub()`, e o objeto `state`
- Toda nova tabela vem acompanhada de um `.sql` próprio, seguindo o padrão de RLS explícito para `anon`
- Assinaturas de função existentes não são quebradas — mudanças são aditivas
- Antes de qualquer alteração visual, `border-radius: 0` é regra absoluta (exceto donuts)

---

## Limitações conhecidas

- Buckets de Storage (`arquivos_bancos`, `arquivos_subs`) são **públicos** — qualquer pessoa com o link acessa o arquivo. Coerente com a arquitetura de chave `anon`, mas não anexar documentos extremamente sensíveis sem ciência disso
- `producao_convenio` é um **snapshot atual**, sem dimensão de tempo — não serve para série histórica (isso é papel da `producao_mensal`)
- Documentos de substabelecido só podem ser anexados **depois** que o cadastro é salvo (a etapa de criação não tem ID ainda para vincular o arquivo)
- Sem autenticação de usuário real — o "login" do gestor é um RPC de verificação de senha, não um sistema de sessão com JWT de usuário

---

*Projeto mantido com o apoio do Claude (Anthropic).*
