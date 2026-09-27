package db

import (
	"database/sql"
	"fmt"
)

// Customer is an entry in the customer master (first piece of the Sales feature).
// Surrogate `id` PK; `name` is NOT unique (unlike companies) — two customers may share a
// display name. Only Name and City are required; every other field may be blank and
// filled in later. See docs/DATA_MODEL.md (customers table).
type Customer struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	NickName string `json:"nickName"`
	Address1 string `json:"address1"`
	Address2 string `json:"address2"`
	City     string `json:"city"`
	State    string `json:"state"`
	Pincode  string `json:"pincode"`
	GSTIN    string `json:"gstin"`
	Mobile   string `json:"mobile"`
}

// AddCustomer inserts a new customer and returns it with its assigned id.
func AddCustomer(conn *sql.DB, c Customer) (Customer, error) {
	res, err := conn.Exec(
		`INSERT INTO customers (name, nick_name, address1, address2, city, state, pincode, gstin, mobile)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.Name, c.NickName, c.Address1, c.Address2, c.City, c.State, c.Pincode, c.GSTIN, c.Mobile,
	)
	if err != nil {
		return Customer{}, fmt.Errorf("insert customer: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Customer{}, fmt.Errorf("customer id: %w", err)
	}
	c.ID = id
	return c, nil
}

// UpdateCustomer overwrites a customer's fields and returns the updated record.
func UpdateCustomer(conn *sql.DB, c Customer) (Customer, error) {
	if _, err := conn.Exec(
		`UPDATE customers SET name = ?, nick_name = ?, address1 = ?, address2 = ?, city = ?,
			state = ?, pincode = ?, gstin = ?, mobile = ? WHERE id = ?`,
		c.Name, c.NickName, c.Address1, c.Address2, c.City, c.State, c.Pincode, c.GSTIN, c.Mobile, c.ID,
	); err != nil {
		return Customer{}, fmt.Errorf("update customer: %w", err)
	}
	return c, nil
}

// DeleteCustomer removes a customer. It refuses (with a friendly error) when a sales
// order still references the customer, since FK enforcement would otherwise fail with an
// opaque message — same guard shape as DeleteCompany/DeleteItem.
func DeleteCustomer(conn *sql.DB, id int64) error {
	var orders int
	if err := conn.QueryRow(`SELECT COUNT(1) FROM sales_orders WHERE customer_id = ?`, id).Scan(&orders); err != nil {
		return fmt.Errorf("count orders: %w", err)
	}
	if orders > 0 {
		return fmt.Errorf("can't delete: %d order(s) still use this customer", orders)
	}
	if _, err := conn.Exec(`DELETE FROM customers WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete customer: %w", err)
	}
	return nil
}

// ListCustomers returns all customers, ordered by name.
func ListCustomers(conn *sql.DB) ([]Customer, error) {
	rows, err := conn.Query(
		`SELECT id, name, nick_name, address1, address2, city, state, pincode, gstin, mobile
			FROM customers ORDER BY name`,
	)
	if err != nil {
		return nil, fmt.Errorf("query customers: %w", err)
	}
	defer rows.Close()

	customers := []Customer{}
	for rows.Next() {
		var c Customer
		if err := rows.Scan(
			&c.ID, &c.Name, &c.NickName, &c.Address1, &c.Address2,
			&c.City, &c.State, &c.Pincode, &c.GSTIN, &c.Mobile,
		); err != nil {
			return nil, fmt.Errorf("scan customer: %w", err)
		}
		customers = append(customers, c)
	}
	return customers, rows.Err()
}
