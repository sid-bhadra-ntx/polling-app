// Command schema writes the PostgreSQL DDL and required bootstrap data for Calm.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"regexp"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	sqlschema "entgo.io/ent/dialect/sql/schema"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"poll-app/backend/ent"
)

func main() {
	output := flag.String("out", "../schema.sql", "path for the generated PostgreSQL schema")
	flag.Parse()

	hash, err := existingServiceAccountHash(*output)
	if err != nil {
		log.Fatalf("read existing service account seed: %v", err)
	}
	if password := os.Getenv("SERVICE_ACCOUNT_PASSWORD"); password != "" {
		hashBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("hash service account password: %v", err)
		}
		hash = string(hashBytes)
	}
	if hash == "" {
		log.Fatalf("SERVICE_ACCOUNT_PASSWORD must be set when %s does not already contain a service_account seed", *output)
	}

	file, err := os.Create(*output)
	if err != nil {
		log.Fatalf("create schema file: %v", err)
	}
	defer file.Close()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5432 user=postgres dbname=postgres sslmode=disable"
	}
	baseDriver, err := entsql.Open(dialect.Postgres, dsn)
	if err != nil {
		log.Fatalf("open PostgreSQL driver: %v", err)
	}
	defer baseDriver.Close()
	driver := &sqlschema.WriteDriver{Driver: baseDriver, Writer: file}
	client := ent.NewClient(ent.Driver(driver))
	if err := client.Schema.Create(context.Background()); err != nil {
		log.Fatalf("write Ent schema: %v", err)
	}

	if _, err := fmt.Fprintf(file, `
-- Bootstrap account for Nutanix Calm EScripts.
INSERT INTO "users" ("username", "email", "password_hash")
VALUES ('service_account', 'service_account@local.invalid', '%s')
ON CONFLICT ("username") DO NOTHING;
`, hash); err != nil {
		log.Fatalf("write service account seed: %v", err)
	}
}

func existingServiceAccountHash(path string) (string, error) {
	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	pattern := regexp.MustCompile(`(?s)VALUES\s*\(\s*'service_account'\s*,\s*'[^']*'\s*,\s*'([^']+)'\s*\)`)
	matches := pattern.FindStringSubmatch(string(content))
	if len(matches) != 2 {
		return "", nil
	}
	return matches[1], nil
}
