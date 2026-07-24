#!/bin/sh
set -eu

database_path=${DATABASE_PATH:-/data/app.sqlite}
database_directory=$(dirname "$database_path")
files_directory=${FILES_DIR:-/files}
temporary_directory=${TEMP_UPLOAD_DIR:-$files_directory/.tmp}

mkdir -p "$database_directory" "$files_directory" "$temporary_directory"
chown -R node:node "$database_directory" "$files_directory"

exec gosu node "$@"
