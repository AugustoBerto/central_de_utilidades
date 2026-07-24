# Operação

Referência: `FINAL.MD`, requisito `OPS-01`.

## Healthcheck

Use `GET /api/health` para verificar disponibilidade pública mínima.

## Dados

Os volumes Docker são `panel_db` e `panel_files`. Não armazene backup real no
repositório. Crie um backup consistente com:

```bash
BACKUP_PASSPHRASE='valor fora do .env' ./scripts/backup.sh /caminho/seguro
```

O script usa o backup online do SQLite, inclui os arquivos, gera checksums e
criptografa o archive. Para restaurar, valide primeiro em homologação e use:

```bash
BACKUP_PASSPHRASE='valor fora do .env' ./scripts/restore.sh --replace arquivo.tar.gz.enc
```

O restore exige digitar `RESTAURAR`, para e reinicia somente o backend. Após a
operação, confira `/api/health`, login, uma nota e um arquivo antes de liberar
o painel.

## Diagnóstico inicial

- confirme allowlist/rede antes de investigar a aplicação;
- valide `docker compose config` antes de subir containers;
- não copie `.env`, token de bootstrap, cookie ou logs sensíveis para tickets.
- use o `X-Request-Id` retornado pela API para correlacionar falhas sem anexar
  payloads privados a tickets.
