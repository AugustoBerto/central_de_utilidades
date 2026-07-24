# AGENTS.md

## Missão e autoridade

Construir do zero o Painel de Utilidades Privado descrito em `FINAL.MD`.
O produto é uma ferramenta operacional de uso contínuo; usabilidade,
segurança, persistência e recuperação de falhas têm o mesmo peso funcional.

`FINAL.MD` é a fonte única de verdade. Em caso de conflito, ele prevalece sobre
README, issues, comentários e documentos auxiliares. Nada está implementado
apenas porque aparece no plano.

## Leitura eficiente do plano

Evite carregar `FINAL.MD` inteiro sem necessidade:

```bash
rg -n '^## |^### ' FINAL.MD
rg -n 'AUTH-|NET-|UX-|MON-|NOTE-|DRIVE-|LINK-|AUTO-|SEC-|OPS-|QUAL-' FINAL.MD
```

1. Consulte o mapa da Seção 0.3 e a matriz da Seção 15.1.
2. Identifique o ID do requisito da tarefa.
3. Leia apenas as seções ligadas ao requisito, sua fase, gate e aceite.
4. Leia o plano completo somente para mudanças transversais ou de arquitetura.
5. Não replique longos trechos do plano em código, respostas ou outros docs.

## Invariantes do projeto

- Projeto novo, um administrador, sem cadastro público ou colaboração.
- Acesso em `http://IP_DA_VPS:80`, sem domínio, TLS ou porta 443.
- Somente Nginx publica `80:80`; backend e dados ficam na rede interna.
- Em produção, Nginx serve o bundle Vue e encaminha `/api` ao backend.
- A segurança do transporte depende de rede privada, VPN ou allowlist. Não
  descreva HTTP aberto como confidencial ou seguro contra interceptação.
- Stack: Vue 3, `<script setup>`, Vite, Tailwind, Pinia, Vue Router, Lucide,
  Chart.js, Node.js LTS, Express, SQLite/`better-sqlite3`, Nginx e Compose.
- Persistência em volumes separados para SQLite e arquivos.
- Upload máximo de 2 GiB, validado no Nginx e novamente no backend.
- Automações ficam desabilitadas até a Fase 7 e nunca recebem shell arbitrário.

Alterar uma invariante exige decisão explícita do usuário e atualização prévia
ou simultânea de `FINAL.MD`.

## Segurança obrigatória

### Autenticação

- Bootstrap único protegido por token aleatório obtido no servidor.
- Senha com Argon2id; TOTP para navegador novo; recovery codes com hash.
- Sessão opaca persistente no cookie `panel_session` com `HttpOnly`,
  `SameSite=Strict`, `Path=/` e sem `Domain`.
- `COOKIE_SECURE=false` é intencional por causa do HTTP. Não use `Secure` nem
  prefixo `__Host-` enquanto essa arquitetura permanecer.
- Armazene somente hash do token; implemente rotação, validade e revogação por
  dispositivo.
- Nunca salve senha, sessão ou token em `localStorage`, `sessionStorage`,
  IndexedDB, banco em texto puro ou logs.
- Toda mutação exige CSRF e validação de `Origin`/`Referer`.
- Aplique rate limiting no bootstrap, senha e TOTP.

### API, dados e arquivos

- Valide entradas na borda; use schemas, queries parametrizadas e códigos HTTP
  consistentes (`401`, `403`, `404`, `413`, `422`, `429`, `500`).
- Não retorne stack trace, caminho interno ou segredo.
- Não registre cookies, tokens, senha, TOTP, notas ou conteúdo de arquivos.
- Escape texto e sanitize Markdown; não renderize HTML bruto por padrão.
- Armazene uploads fora da raiz pública com nome interno aleatório.
- Use streaming, temporário no mesmo filesystem e promoção atômica.
- Remova partes após falha/cancelamento; rejeite traversal e sobrescrita.
- Automações usam allowlist, argumentos tipados, processo sem shell, timeout,
  limite de saída, usuário sem privilégio e auditoria sanitizada.

## Frontend e UX

- Visual Modern GitHub Dark conforme Seção 2; não usar Warm/Cozy Dark.
- Componentes modulares; lógica de domínio fica na feature correspondente.
- Pinia apenas para estado transversal; estado local permanece local/composable.
- Cliente HTTP centralizado com `credentials: include` e erros normalizados.
- Toda tela deve cobrir loading, vazio, erro, sucesso e indisponibilidade.
- Preserve contexto de filtro, ordenação e item selecionado quando possível.
- Garanta teclado, foco visível, WCAG AA, redução de movimento e mobile.
- Não simule dados ausentes. Métricas devem informar origem e horário.
- Ações destrutivas exigem confirmação contextual e feedback claro.

## Estrutura e convenções

Estrutura-alvo resumida:

```text
backend/       API, domínio, migrações e testes
frontend/      Vue, design system, features e testes
nginx/         proxy HTTP, headers e limite de upload
scripts/       backup, restore, deploy e tarefas operacionais
docs/          arquitetura, API, segurança, UX, deploy, operação e ADRs
FINAL.MD       documento mestre
```

- Separe rotas, middleware, schemas, serviços, persistência e UI.
- Migrações são idempotentes e transacionais.
- Fixe versões de dependências e imagens; processos rodam como não-root.
- Não adicione serviço ou dependência sem necessidade demonstrável.
- Não versione `.env`, banco, uploads, backups reais, logs, segredos, builds ou
  dependências instaladas.
- Preserve alterações do usuário e evite reescritas fora do requisito.

## Fluxo de produção otimizado

1. Associe a tarefa a um ID da Seção 15.1.
2. Use `rg --files` e `rg` para localizar somente arquivos relevantes.
3. Verifique o estado atual antes de editar; não presuma fases concluídas.
4. Implemente a menor mudança completa que satisfaça o requisito e seu gate.
5. Adicione ou atualize testes junto da mudança de comportamento.
6. Atualize contratos/docs derivados; altere `FINAL.MD` se o plano mudou.
7. Execute validações proporcionais ao risco, uma vez após estabilizar o diff.
8. Revise o diff por segredos, regressões, portas indevidas e arquivos gerados.

Para economizar contexto e tempo:

- agrupe leituras e buscas relacionadas;
- não releia arquivos inalterados;
- não faça inventários amplos quando o requisito já delimita uma feature;
- não gere resumos extensos durante a implementação;
- não execute build de containers para uma alteração textual isolada;
- reutilize componentes, schemas e helpers existentes antes de criar novos.

## Validação

Quando os scripts existirem, use na raiz:

```bash
npm ci
npm run lint
npm test
npm run build
docker compose config
docker compose build
docker compose up -d
curl -fsS http://localhost:80/api/health
docker compose down
```

Escopo mínimo por mudança:

- frontend: lint, testes da feature e build;
- backend/API/banco: lint, testes unitários e integração relevantes;
- autenticação/upload/automação: testes negativos e de segurança associados;
- Compose/Nginx/volumes: `docker compose config`, build e smoke test;
- documentação: revisar links, headings, exemplos e coerência com `FINAL.MD`.

Se código, script ou runtime ainda não existir, não invente resultado. Registre
a limitação e valide apenas o que estiver disponível.

## Critério de conclusão

Uma tarefa termina somente quando:

- requisito, fase e aceite estão identificados;
- comportamento completo foi implementado sem violar invariantes;
- testes aplicáveis passaram e falhas relevantes foram exercitadas;
- UX inclui estados, teclado e viewport pertinentes;
- configuração, API e documentação estão coerentes;
- não há segredo, dado real ou artefato indevido no diff.

Na entrega, informe apenas: requisito atendido, arquivos alterados, validações
executadas e pendências/riscos reais. Evite repetir o plano.
