# Nutanix Calm Onboarding - Polling App

This is a full-stack polling application built with React/TypeScript and
Golang. The frontend is compiled into static assets and served by the Go
backend, keeping the application within the required database and backend
service layout for Nutanix Calm.

## Architecture

- React is built into static assets.
- Go serves both the REST API and the compiled frontend.
- PostgreSQL schema provisioning is separate from backend startup. Apply the
  generated `schema.sql` before starting the backend.
- The backend does not perform automatic runtime migrations.

## Prerequisites

- Node.js 20 or newer
- Go 1.22 or newer
- PostgreSQL

## Local PostgreSQL lifecycle

PostgreSQL 16 may use a new cluster when it is installed alongside an older
PostgreSQL version. The application database from the older cluster will not
automatically appear in the new one. Confirm that the PostgreSQL 16 cluster
contains `poll_app` before starting the application.

### First-time setup for a PostgreSQL cluster

Run this once for a new or empty local PostgreSQL cluster. Use the same local
database password in the `CREATE USER` command and in `DB_PASSWORD` below:

```bash
sudo systemctl start postgresql
pg_isready -h 127.0.0.1 -p 5432

sudo -u postgres psql -c "CREATE USER poll_app WITH PASSWORD 'your-local-password';"
sudo -u postgres psql -c "CREATE DATABASE poll_app OWNER poll_app;"
psql -h 127.0.0.1 -U poll_app -d poll_app -W -f ./schema.sql
```

If `poll_app` or the `poll_app` role already exists, skip its corresponding
creation command. Apply `schema.sql` only to a new or empty database. Running
`systemctl restart postgresql` does not delete stored users, polls, or votes.

### Routine local startup

Run these commands from the repository root each time you start the
application. Reuse the same `JWT_SECRET` value across restarts:

```bash
cd /home/siddhant.bhadra/poll-app

sudo systemctl start postgresql
pg_isready -h 127.0.0.1 -p 5432

export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_USER=poll_app
export DB_PASSWORD='your-local-password'
export DB_NAME=poll_app
export JWT_SECRET='your-fixed-secret-value'
export PORT=8080

make run
```

Open `http://localhost:8080` after the backend starts. Stop the backend with
`Ctrl+C` in the terminal running `make run`. If port 8080 is already in use,
stop the existing `poll-app` process before starting another one.

## Build and package

From the repository root:

```bash
make all
```

This creates a self-contained package:

```text
build/
├── poll-app
└── static/       # compiled React frontend
```

Useful targets:

```bash
make verify       # Go tests/vet, frontend lint, and frontend build
make run          # build and start the packaged application
make dev          # start the Vite development server
make clean        # remove generated build output
```

To run the PostgreSQL API integration suite as part of verification, provide a
dedicated test database:

```bash
export API_TEST_DATABASE_URL='postgres://user:password@127.0.0.1:5432/poll_app_test?sslmode=disable'
make verify
```

The integration suite is skipped when `API_TEST_DATABASE_URL` is unset.

`make run` expects the database to be provisioned and the required environment
variables to be set as shown in the routine startup instructions above.
Exported variables apply only to the current terminal session. If you open a
new terminal, export them again before running the application.

The backend uses `STATIC_DIR` to locate the compiled frontend. It defaults to
`frontend/dist` for direct local execution; the packaged `make run` target sets
it to `static` inside `build/`.

To stop the local environment:

```text
Ctrl+C                         # stop the Go application
sudo systemctl stop postgresql # stop PostgreSQL when no longer needed
```

To restart it later, start PostgreSQL again, re-export configuration variables
if using a new terminal, and run `make run`.