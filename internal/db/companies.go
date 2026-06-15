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

// UpdateCompany renames a company and returns the updated record. Name must stay unique.
func UpdateCompany(conn *sql.DB, id int64, name string) (Company, error) {
	if _, err := conn.Exec(`UPDATE companies SET name = ? WHERE id = ?`, name, id); err != nil {
		return Company{}, fmt.Errorf("update company: %w", err)
	}
	return Company{ID: id, Name: name}, nil
}

// DeleteCompany removes a company. It refuses (with a friendly error) when items or
// purchase bills still reference the company, since FK enforcement would otherwise
// fail with an opaque message.
func DeleteCompany(conn *sql.DB, id int64) error {
	var items, bills int
	if err := conn.QueryRow(`SELECT COUNT(1) FROM items WHERE company_id = ?`, id).Scan(&items); err != nil {
		return fmt.Errorf("count items: %w", err)
	}
	if err := conn.QueryRow(`SELECT COUNT(1) FROM purchase_bills WHERE company_id = ?`, id).Scan(&bills); err != nil {
		return fmt.Errorf("count bills: %w", err)
	}
	if items > 0 || bills > 0 {
		return fmt.Errorf("can't delete: %d item(s) and %d bill(s) still use this company", items, bills)
	}
	if _, err := conn.Exec(`DELETE FROM companies WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete company: %w", err)
	}
	return nil
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
