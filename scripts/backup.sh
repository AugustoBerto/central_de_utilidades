#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: BACKUP_PASSPHRASE=... $0 <diretorio-destino>" >&2
  exit 64
fi
if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "BACKUP_PASSPHRASE é obrigatório e não deve ser salvo no repositório." >&2
  exit 64
fi
for command in docker tar openssl sha256sum; do
  command -v "$command" >/dev/null || { echo "Dependência ausente: $command" >&2; exit 69; }
done

destination=$1
mkdir -p "$destination"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$destination/painel-$stamp.tar.gz.enc"
stage=$(mktemp -d)
container_snapshot="/tmp/painel-$stamp.sqlite"
cleanup() {
  docker compose exec -T backend rm -f "$container_snapshot" >/dev/null 2>&1 || true
  rm -rf "$stage"
}
trap cleanup EXIT

docker compose exec -T --user node backend node src/backup-snapshot.js "$container_snapshot"
docker compose cp "backend:$container_snapshot" "$stage/app.sqlite"
mkdir -p "$stage/files"
docker compose cp backend:/files/. "$stage/files"
find "$stage" -type f -print0 | sort -z | xargs -0 sha256sum > "$stage/SHA256SUMS"
tar -C "$stage" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$archive"
echo "Backup criado: $archive"
