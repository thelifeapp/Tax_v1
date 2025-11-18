#!/bin/bash
set -e
# Set SUPABASE_DB_URL for this run (kept out of .env.local to avoid zsh parsing issues with &)
export SUPABASE_DB_URL='postgresql://postgres.rugvwkgalijdqmbmmijy:REPLACE_PASSWORD@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require&channel_binding=disable'
mkdir -p supabase/migrations
OUT="supabase/migrations/$(date +%Y%m%d-%H%M)-schema.sql"
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-privileges -f "$OUT"
echo "✅ Schema dumped to $OUT"
