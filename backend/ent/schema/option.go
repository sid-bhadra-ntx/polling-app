package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// PollOption is one selectable answer on a poll. Its database table is named
// "options"; the Poll prefix avoids Ent's reserved Option identifier.
type PollOption struct {
	ent.Schema
}

func (PollOption) Fields() []ent.Field {
	return []ent.Field{
		field.String("text").NotEmpty(),
		field.Int("poll_id"),
	}
}

func (PollOption) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("poll", Poll.Type).
			Ref("options").
			Field("poll_id").
			Required().
			Unique(),
		edge.To("votes", Vote.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (PollOption) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "options"},
	}
}
