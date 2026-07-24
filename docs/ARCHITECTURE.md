# Arquitetura

Referência: `FINAL.MD`, requisitos `FOUND-01` e `NET-01`.

O browser acessa `http://IP_DA_VPS:80`. Nginx entrega o bundle Vue estático e
encaminha `/api` ao Express em uma rede Docker interna. O backend será o único
processo com acesso aos volumes persistentes de SQLite e arquivos.

O Compose publica apenas Nginx. Backend, banco e conteúdo de uploads não devem
expor portas ao host. O build do frontend ocorre em estágio Docker separado;
não há Vite em produção.

## Decisões iniciais

- monorepo npm com workspaces `backend` e `frontend`;
- Vue 3 + Vite + Tailwind para a interface;
- Node.js LTS + Express para API;
- SQLite/`better-sqlite3` será introduzido na fase de autenticação;
- HTTP é aceito somente dentro de uma rede confiável;
- mudanças estruturais exigem ADR e atualização do plano.

## Operação e recuperação

Nginx desativa buffering para `/api`, preservando streaming de upload. O proxy
gera `X-Request-Id`, repassado e devolvido pelo backend para diagnóstico sem
registrar conteúdo sensível. O backup cria snapshot online do SQLite e cópia do
volume de arquivos, gera checksums e criptografa o archive fora do repositório.
