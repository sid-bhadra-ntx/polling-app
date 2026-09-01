# Calm Blueprint specification

This is the implementation guide for creating the Blueprint in Calm. The
exported Blueprint should be saved beside this document after it is created in
the target Calm environment. Exact macro syntax depends on the Calm version
and Blueprint editor, so use the editor's generated service-IP macro rather
than copying a literal address.

## Services

### `postgres`

- One VM on the approved database subnet.
- Package-install action: `postgres/setup.sh`.
- Runtime variables: `DB_NAME`, `DB_USER`, `DB_PORT`, `BACKEND_CIDR`,
  `SCHEMA_FILE`.
- Secret variables: `DB_PASSWORD`, `SERVICE_ACCOUNT_PASSWORD_HASH`.
- Expose `DB_PORT` to the backend service.
- Publish the VM/service IP as the database endpoint consumed by the backend.
- Service action: restart PostgreSQL.

### `backend`

- One VM on the approved application subnet.
- Depends on successful PostgreSQL setup.
- Package-install action: `backend/install.sh`.
- Runtime variables: `APP_REPOSITORY_URL`, `APP_REF`, `APP_DIR`, `APP_USER`,
  `APP_PORT`, `DB_PORT`, `DB_USER`, `DB_NAME`, `DB_SSLMODE`.
- Macro variable: `DB_HOST` set to the PostgreSQL service IP.
- Secret variables: `DB_PASSWORD`, `JWT_SECRET`, and the GitHub credential when
  the repository is private.
- Validation action: `backend/healthcheck.sh`.
- Optional service action: `backend/restart.sh`.

## Profile actions

Configure these as profile-level actions and grant execution to the Operator
role:

1. **Clear all data via API**
   - Run `actions/clear-all-data-api.sh` on the backend VM or an action
     execution host.
   - Provide `API_BASE_URL`, `SERVICE_ACCOUNT_USERNAME`, and the service-account
     password as variables/secrets.
   - The endpoint preserves users and removes polls, options, and votes.

2. **Clear all votes via SSH**
   - Run `postgres/cleanup.sh` on the PostgreSQL VM.
   - Set `MODE=votes`.
   - Use a separate action with `MODE=all` only when all poll data should be
     removed.

## Dependency and validation sequence

1. Provision the PostgreSQL VM.
2. Run PostgreSQL setup and verify the schema.
3. Resolve the PostgreSQL service IP.
4. Provision the backend VM with `DB_HOST` set from that service IP.
5. Start the backend service.
6. Run `backend/healthcheck.sh`.
7. Execute the API smoke tests in the deployment checklist.

## Blueprint variables

Use `config/part-2.env.example` as the starting list. Keep secrets as Calm
secret variables, and keep environment-specific values such as cluster,
subnet, image, service IP, GitHub credential, and database CIDR outside the
repository.
