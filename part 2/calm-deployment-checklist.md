# Calm deployment checklist

Use this checklist with the Calm UI. Values such as cluster, subnet, image,
service-IP macros, credentials, and GitHub access are environment-specific and
must be filled in after the Remote PC account is ready.

## 1. Account and project

- [ ] Create the Remote PC account.
- [ ] Verify the account can access Calm and the target Prism Central.
- [ ] Create the project.
- [ ] Whitelist the Remote PC account in the project.
- [ ] Whitelist the target cluster and application/database subnet.
- [ ] Add the required users as Project Admin, Developer, Consumer, and
      Operator.
- [ ] Confirm the Consumer can launch an application.
- [ ] Confirm the Operator can execute profile and service actions.

## 2. Source and secrets

- [ ] Push the application to a GitHub repository reachable from the backend
      VM, preferably private.
- [ ] Configure a Calm GitHub credential or deploy key for that repository.
- [ ] Create secret variables for `DB_PASSWORD`, `JWT_SECRET`,
      `SERVICE_ACCOUNT_PASSWORD`, and any GitHub credential.
- [ ] Create non-secret variables from
      `config/part-2.env.example`.
- [ ] Keep one stable `JWT_SECRET` for the application lifetime.
- [ ] Generate a bcrypt hash for the service-account password and provide it to
      the PostgreSQL setup action as `SERVICE_ACCOUNT_PASSWORD_HASH`.

## 3. PostgreSQL service

- [ ] Create the first service and select the approved Linux image/substrate.
- [ ] Configure the PostgreSQL VM NIC on the approved database subnet.
- [ ] Attach `postgres/setup.sh` as the package-install or first-boot action.
- [ ] Provide `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `BACKEND_CIDR`, and
      `SCHEMA_FILE`.
- [ ] Ensure `schema.sql` is copied to the database VM or fetched from the
      repository before `postgres/setup.sh` runs.
- [ ] Confirm PostgreSQL is enabled and listening on `DB_PORT`.
- [ ] Confirm the database firewall and `pg_hba.conf` allow only the backend
      CIDR.
- [ ] Add a service-level PostgreSQL restart action using
      `systemctl restart`.

## 4. Backend service

- [ ] Create the second service and select the approved Linux image/substrate.
- [ ] Configure the backend VM NIC on the approved application subnet.
- [ ] Add a dependency so the backend starts after PostgreSQL setup completes.
- [ ] Attach `backend/install.sh` as the package-install action.
- [ ] Provide `APP_REPOSITORY_URL`, `APP_REF`, and application configuration.
- [ ] Set `DB_HOST` from the PostgreSQL service IP using the Calm service-IP
      macro for the selected Blueprint model.
- [ ] Inject `DB_PASSWORD` and `JWT_SECRET` as secret variables.
- [ ] Confirm `backend/install.sh` can clone, build, and start the application.
- [ ] Attach `backend/healthcheck.sh` as a deployment validation action.
- [ ] Optionally add `backend/restart.sh` as a service-level action.

## 5. Deploy and validate

- [ ] Deploy the Blueprint as the Consumer user.
- [ ] Confirm both VMs are powered on and their services are active.
- [ ] Confirm `GET /api/health` returns HTTP 200.
- [ ] Create a test account with `POST /api/signup`.
- [ ] Login with `POST /api/login` and save the returned token.
- [ ] Create a poll with `POST /api/polls`.
- [ ] Vote with `POST /api/polls/{id}/vote`.
- [ ] Confirm poll results with `GET /api/polls/{id}/counts`.
- [ ] Run PostgreSQL and backend restart actions.
- [ ] Re-run the health and API checks after each restart.

## 6. Day 2 actions

- [ ] Configure the profile-level API cleanup action from
      `actions/clear-all-data-api.sh`.
- [ ] Configure the profile-level SSH cleanup action from
      `postgres/cleanup.sh` with `MODE=votes`.
- [ ] If required, configure a separate full poll-data cleanup with
      `MODE=all`.
- [ ] Run each action as the Operator user.
- [ ] Verify that users remain available and the intended poll/vote data is
      removed.

## 7. Runbooks

- [ ] Create an add-poll runbook using `runbooks/add-poll.sh`.
- [ ] Add runtime parameters for title, description, and options.
- [ ] Create a vote runbook using `runbooks/vote.sh`.
- [ ] Add runtime parameters for poll ID and option ID.
- [ ] Store API tokens or login credentials as secret runbook variables.
- [ ] Execute both runbooks and verify the resulting API state.

## 8. Marketplace

- [ ] Confirm a clean Blueprint deployment from the original project.
- [ ] Confirm all actions and runbooks work.
- [ ] Add Blueprint version and Marketplace metadata.
- [ ] Publish the Blueprint to Marketplace.
- [ ] Create the second project.
- [ ] Whitelist the account, cluster, and subnets in the second project.
- [ ] Create a Marketplace-ready environment.
- [ ] Deploy the Marketplace item using the Consumer user.
- [ ] Run the full API, action, and runbook validation again.
