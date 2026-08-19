package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Poll is a question created by a user.
type Poll struct {
	ent.Schema
}

func (Poll) Fields() []ent.Field {
	return []ent.Field{
		field.String("title").NotEmpty(),
		field.String("description").Default(""),
		field.Int("creator_id"),
	}
}

func (Poll) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("creator", User.Type).
			Ref("polls").
			Field("creator_id").
			Required().
			Unique(),
		edge.To("options", PollOption.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}
