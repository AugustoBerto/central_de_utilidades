# API

Referência: `FINAL.MD`, Seção 5.6.

## Convenções

- prefixo: `/api`;
- JSON UTF-8;
- erros seguem `{ "error": { "code", "message", "fields?", "requestId?" } }`;
- erros internos não incluem stack trace ou segredos;
- rotas mutáveis exigem token CSRF no header `X-CSRF-Token` e `Origin` ou
  `Referer` com o mesmo hostname.

## Implementado

### `GET /api/health`

Endpoint público para healthcheck. Retorna `200`:

```json
{
  "status": "ok",
  "service": "backend",
  "timestamp": "2026-07-21T00:00:00.000Z"
}
```

Os endpoints de arquivos, atalhos e automações permanecem planejados e não
devem ser assumidos como disponíveis antes de suas fases.

### `GET /api/setup/status`

Retorna se o bootstrap ainda é necessário:

```json
{ "setupRequired": true }
```

### `POST /api/setup/initialize`

Disponível apenas enquanto não existe administrador. Recebe `bootstrapToken`,
`username` e `password`; cria o administrador, retorna o URI TOTP e dez códigos
de recuperação. A resposta deve ser mostrada uma única vez ao administrador.

### `POST /api/auth/login`

Recebe `username`, `password`, `totpCode` ou `recoveryCode`, e `deviceLabel`
opcional. Em sucesso, cria o cookie `panel_session` e retorna usuário e token
CSRF em memória.

### Sessão

- `GET /api/auth/me` exige cookie e retorna o usuário atual;
- `GET /api/auth/csrf` exige cookie e emite novo token CSRF;
- `GET /api/auth/sessions` lista os navegadores confiáveis do administrador;
- `DELETE /api/auth/sessions/:sessionId` revoga outro navegador, com CSRF e
  origem válida; a sessão atual deve usar logout;
- `POST /api/auth/sessions/revoke-others` revoga todos os demais navegadores,
  com CSRF e origem válida;
- `POST /api/auth/logout` exige cookie e header `X-CSRF-Token`, revoga a
  sessão e remove o cookie. As sessões são rotacionadas periodicamente; o
  token anterior tem apenas uma janela curta para requisições concorrentes.

### `GET /api/system/metrics`

Exige sessão. Aceita `range=1h|6h|24h` e retorna um envelope versionado com
`source`, `status`, `collectedAt`, métricas com unidades explícitas, `history`
persistido e `samplingIntervalSeconds`. `source.type` é `host`,
`container` ou `disabled`; no Compose, o backend declara `container` para não
atribuir métricas do host a uma origem que não controla. Campos sem coleta são
`null`, nunca `0` artificial. A primeira amostra de CPU/rede pode estar
incompleta porque ainda não há base de comparação. As leituras são coletadas no
backend a cada 5 segundos por padrão e retidas por 24 horas.

### Notas

- `GET /api/notes?q=&sort=&from=&to=` lista notas por atualização, criação ou
  título; a busca é parametrizada em título/conteúdo e o período usa a data de
  atualização inclusiva;
- `GET /api/notes/:noteId` retorna uma nota;
- `POST /api/notes` cria uma nota com `title` opcional e `content` obrigatório;
- `PATCH /api/notes/:noteId` exige `updatedAt` da versão aberta. Se a nota foi
  modificada, retorna `409 NOTE_CONFLICT` para impedir sobrescrita silenciosa;
- `DELETE /api/notes/:noteId` remove a nota.

As mutações exigem sessão, CSRF e origem válida. O conteúdo é retornado como
texto; esta fase não interpreta nem renderiza HTML ou Markdown.

### Drive

- `GET /api/files?q=&sort=&order=&limit=&offset=` lista arquivos por atualização
  ou nome/tamanho, permite busca e paginação no backend;
- `POST /api/files` recebe o corpo do arquivo em streaming, com os headers
  `X-File-Name` e `Content-Type`;
- `GET /api/files/:fileId/download` transmite o arquivo autenticado como anexo;
- `GET /api/files/:fileId/preview` só permite texto simples, PDF e imagens
  explicitamente permitidas;
- `DELETE /api/files/:fileId` remove o arquivo.

O backend limita o fluxo a 2 GiB por padrão, grava primeiro em temporário e só
promove o arquivo ao destino após sucesso. Nomes internos são aleatórios e o
nome original não participa do caminho físico.

### Atalhos

- `GET /api/shortcuts` lista atalhos por grupo e posição;
- `POST /api/shortcuts`, `PATCH /api/shortcuts/:shortcutId` e
  `DELETE /api/shortcuts/:shortcutId` gerenciam os atalhos;
- `PATCH` aceita `position` para reordenar de forma persistente.

Por padrão, URLs aceitam apenas `https:`. `http:` só é habilitado com
`ALLOW_HTTP_SHORTCUTS=true`. Os ícones são chaves de uma lista local permitida;
o servidor não busca favicons remotos.

### Automações controladas

- `GET /api/automations` retorna somente o catálogo autorizado;
- `POST /api/automations/:automationId/runs` inicia uma execução após validar
  parâmetros tipados;
- `GET /api/automation-runs/:runId` consulta seu estado;
- `GET /api/automation-runs/:runId/events` transmite SSE autenticado;
- `POST /api/automation-runs/:runId/cancel` solicita cancelamento quando ainda
  permitido.

A API nunca recebe comando, shell ou caminho de execução. O catálogo permanece
desabilitado até `AUTOMATIONS_ENABLED=true`; veja o
[threat model](THREAT_MODEL_AUTOMATIONS.md).
