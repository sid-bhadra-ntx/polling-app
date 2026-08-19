package database

import (
	"poll-app/backend/ent"
	"poll-app/backend/internal/config"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	_ "github.com/lib/pq"
)

// Open creates an Ent client using the configured PostgreSQL connection.
// It does not run migrations; schema provisioning is handled by schema.sql.
func Open(cfg config.Config) (*ent.Client, error) {
	driver, err := entsql.Open(dialect.Postgres, cfg.DSN())
	if err != nil {
		return nil, err
	}
	return ent.NewClient(ent.Driver(driver)), nil
}
