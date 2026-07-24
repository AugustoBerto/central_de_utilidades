#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 || "${1:-}" != "--replace" ]]; then
  echo "Uso: BACKUP_PASSPHRASE=... $0 --replace <arquivo.tar.gz.enc>" >&2
  exit 64
fi
if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "BACKUP_PASSPHRASE é obrigatório." >&2
  exit 64
fi
archive=$2
[[ -f "$archive" ]] || { echo "Backup não encontrado." >&2; exit 66; }
for command in docker tar openssl sha256sum; do
  command -v "$command" >/dev/null || { echo "Dependência ausente: $command" >&2; exit 69; }
done

stage=$(mktemp -d)
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$archive" | tar -C "$stage" -xzf -
(cd "$stage" && sha256sum -c SHA256SUMS)
[[ -f "$stage/app.sqlite" && -d "$stage/files" ]] || { echo "Conteúdo de backup inválido." >&2; exit 65; }

echo "A restauração substituirá banco e arquivos persistentes."
read -r -p "Digite RESTAURAR para continuar: " confirmation
[[ "$confirmation" == "RESTAURAR" ]] || { echo "Cancelado."; exit 0; }
docker compose stop backend
docker compose cp "$stage/app.sqlite" backend:/data/app.sqlite
docker compose cp "$stage/files/." backend:/files
docker compose start backend
echo "Restauração concluída. Execute o smoke test documentado antes de liberar o acesso."
