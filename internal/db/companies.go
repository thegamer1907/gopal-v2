package db

import (
	"database/sql"
	"fmt"
)

// Company is an entry in the company master. Surrogate `id` PK (so bills FK to it
// and survive renames); `name` is unique. For now just those two; more columns will
// follow. See docs/DATA_MODEL.md (companies table).
type Company struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// AddCompany inserts a new company and returns it with its assigned id. Name must be unique.
func AddCompany(conn *sql.DB, name string) (Company, error) {
	res, err := conn.Exec(`INSERT INTO companies (name) VALUES (?)`, name)
	if err != nil {
		return Company{}, fmt.Errorf("insert company: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Company{}, fmt.Errorf("company id: %w", err)
	}
	return Company{ID: id, Name: name}, nil
}

// ListCompanies returns all companies, ordered by name.
func ListCompanies(conn *sql.DB) ([]Company, error) {
	rows, err := conn.Query(`SELECT id, name FROM companies ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("query companies: %w", err)
	}
	defer rows.Close()

	companies := []Company{}
	for rows.Next() {
		var c Company
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, fmt.Errorf("scan company: %w", err)
		}
		companies = append(companies, c)
	}
	return companies, rows.Err()
}
