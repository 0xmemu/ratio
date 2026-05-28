#!/bin/bash
set -e

# Ensure ratio user exists
su - postgres -c "psql -c \"DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ratio') THEN CREATE USER ratio WITH PASSWORD 'kebanaran123' CREATEDB; END IF; END \$\$;\"" 2>/dev/null || true

# Ensure ratio_db exists
su - postgres -c "psql -c \"SELECT 1 FROM pg_database WHERE datname = 'ratio_db'\" | grep -q 1 || psql -c \"CREATE DATABASE ratio_db OWNER ratio;\"" 2>/dev/null || true

# Start PostgreSQL
pg_ctlcluster 15 main start

# Keep alive
tail -f /var/log/postgresql/postgresql-15-main.log
