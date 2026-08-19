package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Vote records one user's selection of one option.
type Vote struct {
	ent.Schema
}

func (Vote) Fields() []ent.Field {
	return []ent.Field{
		field.Int("user_id"),
		field.Int("option_id"),
	}
}

func (Vote) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).
			Ref("votes").
			Field("user_id").
			Required().
			Unique(),
		edge.From("option", PollOption.Type).
			Ref("votes").
			Field("option_id").
			Required().
			Unique(),
	}
}

func (Vote) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("user_id", "option_id").Unique(),
	}
}
