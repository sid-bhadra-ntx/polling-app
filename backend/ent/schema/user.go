package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// User represents an account that can create polls and cast votes.
type User struct {
	ent.Schema
}

func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("username").NotEmpty().Unique(),
		field.String("email").NotEmpty().Unique(),
		field.String("password_hash").NotEmpty().Sensitive(),
	}
}

func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("polls", Poll.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("votes", Vote.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}
