# Prospecta — Gestão de Substabelecidos

Sistema interno da Prospecta pra gerenciar os substabelecidos (parceiros comerciais cadastrados em nome da empresa em diversos bancos).

## O que o sistema faz

- Cadastra e acompanha os substabelecidos: status (Ativo, Pendente, Em Andamento, Inativo), banco vinculado, códigos internos, comissão, documentos e histórico.
- Cadastra os bancos parceiros, com dados de contato, CNPJ da empresa credenciada em cada um, e "passo a passo" de credenciamento.
- Mostra a produção mensal por banco e por parceiro (dados importados manualmente ou vindos de integração automática).
- Painel com indicadores gerais: total de ativos/inativos, bancos com mais parceiros, cadastros incompletos, etc.
- Modo **Gestor** (acesso completo, com login) e modo **Consulta** (visualização, com senha própria).

## Tecnologia

Site estático (HTML, CSS e JavaScript puro, sem framework), hospedado no GitHub Pages. Os dados ficam no [Supabase](https://supabase.com) (banco de dados + autenticação), acessados através de um proxy (Cloudflare Worker) que mantém as credenciais do banco fora do código do site.

## Estrutura

- `index.html` — estrutura das telas
- `app.js` — toda a lógica do sistema
- `styles.css` — visual
- `importador_producao.html` — ferramenta separada pra converter planilhas de produção em comandos prontos para o banco de dados

## Acesso

Este é um sistema interno da Prospecta. O acesso é restrito a gestores autorizados e consultores com senha.
