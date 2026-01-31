package domain

import "testing"

func TestMapStatusCode(t *testing.T) {
	tests := []struct {
		code     string
		expected ContainerStatus
	}{
		{"M", StatusManifested},
		{"D", StatusDischarged},
		{"Y", StatusInYard},
		{"A", StatusAvailable},
		{"H", StatusOnHold},
		{"C", StatusCustomsHold},
		{"I", StatusGateIn},
		{"O", StatusGateOut},
		{"R", StatusReleased},
		{"L", StatusLoaded},
		{"N", StatusNotManifested},
		{"Z", StatusInYard}, // unknown defaults to IN_YARD
		{"", StatusInYard},  // empty defaults to IN_YARD
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			got := MapStatusCode(tt.code)
			if got != tt.expected {
				t.Errorf("MapStatusCode(%q) = %q, want %q", tt.code, got, tt.expected)
			}
		})
	}
}
