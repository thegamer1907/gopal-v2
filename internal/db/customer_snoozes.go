package db

import (
	"database/sql"
	"fmt"
)

// CustomerSnooze is a Dashboard "Don't remind me" for one customer: hidden from the
// lapsed-customers card from SnoozedOn (dd-mmm-yy) for Amount × Unit. The expiry is derived
// on the frontend (lib/lapsedCustomers.ts) — month math lives there with the other date
// math — so only the inputs are stored. See docs/DATA_MODEL.md (customer_snoozes table).
type CustomerSnooze struct {
	CustomerID int64  `json:"customerId"`
	SnoozedOn  string `json:"snoozedOn"`
	Amount     int    `json:"amount"`
	Unit       string `json:"unit"` // "day" | "week" | "month"
}

// SnoozeCustomer records (or replaces) the customer's snooze.
func SnoozeCustomer(conn *sql.DB, customerID int64, snoozedOn string, amount int, unit string) error {
	if amount < 1 {
		return fmt.Errorf("snooze amount must be at least 1")
	}
	if unit != "day" && unit != "week" && unit != "month" {
		return fmt.Errorf("snooze unit must be day, week or month")
	}
	if _, err := conn.Exec(
		`INSERT INTO customer_snoozes (customer_id, snoozed_on, amount, unit) VALUES (?, ?, ?, ?)
			ON CONFLICT(customer_id) DO UPDATE SET snoozed_on = excluded.snoozed_on,
				amount = excluded.amount, unit = excluded.unit`,
		customerID, snoozedOn, amount, unit,
	); err != nil {
		return fmt.Errorf("snooze customer: %w", err)
	}
	return nil
}

// ListCustomerSnoozes returns every stored snooze (expired ones included — the frontend
// decides what is still active).
func ListCustomerSnoozes(conn *sql.DB) ([]CustomerSnooze, error) {
	rows, err := conn.Query(`SELECT customer_id, snoozed_on, amount, unit FROM customer_snoozes ORDER BY customer_id`)
	if err != nil {
		return nil, fmt.Errorf("query snoozes: %w", err)
	}
	defer rows.Close()
	snoozes := []CustomerSnooze{}
	for rows.Next() {
		var s CustomerSnooze
		if err := rows.Scan(&s.CustomerID, &s.SnoozedOn, &s.Amount, &s.Unit); err != nil {
			return nil, fmt.Errorf("scan snooze: %w", err)
		}
		snoozes = append(snoozes, s)
	}
	return snoozes, rows.Err()
}
