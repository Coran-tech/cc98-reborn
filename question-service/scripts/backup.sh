#!/bin/sh
set -eu
umask 077

database=/srv/question-service/data/questions.sqlite
directory=/srv/question-service/backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$directory/questions-$stamp.sqlite"

mkdir -p "$directory"
sqlite3 "$database" ".backup '$destination'"
integrity=$(sqlite3 "$destination" 'PRAGMA integrity_check;')
if [ "$integrity" != ok ]; then
    rm -f "$destination"
    echo 'SQLite backup integrity check failed' >&2
    exit 1
fi

find "$directory" -maxdepth 1 -type f -name 'questions-*.sqlite' -mtime +30 -delete
