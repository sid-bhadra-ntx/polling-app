package auth

import (
	"testing"
	"time"
)

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if err := CheckPassword(hash, "correct horse battery staple"); err != nil {
		t.Fatalf("matching password rejected: %v", err)
	}
	if err := CheckPassword(hash, "wrong password"); err == nil {
		t.Fatal("wrong password accepted")
	}
}

func TestTokenRoundTrip(t *testing.T) {
	const secret = "test-secret"
	token, err := IssueToken(42, "alice", secret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseToken(token, secret)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != 42 || claims.Username != "alice" {
		t.Fatalf("unexpected claims: %#v", claims)
	}
	if _, err := ParseToken(token, "wrong-secret"); err == nil {
		t.Fatal("token accepted with wrong secret")
	}
}
