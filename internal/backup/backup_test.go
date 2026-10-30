package backup

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "live.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := conn.Exec(`CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES ('a'), ('b'), ('c');`); err != nil {
		t.Fatal(err)
	}
	return conn
}

func at(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 9, 30, 0, 0, time.Local) }

func TestRunCreatesYesterdaysBackupOnce(t *testing.T) {
	conn := openTestDB(t)
	dir := filepath.Join(t.TempDir(), "DB backup") // doesn't exist yet

	res, err := Run(conn, dir, at(2026, time.October, 30))
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(dir, "inventory-backup-2026-10-29.db")
	if res.Created != want {
		t.Fatalf("created %q, want %q", res.Created, want)
	}

	// The copy is a real database holding the same rows.
	bk, err := sql.Open("sqlite", "file:"+want)
	if err != nil {
		t.Fatal(err)
	}
	defer bk.Close()
	var n int
	if err := bk.QueryRow(`SELECT COUNT(*) FROM t`).Scan(&n); err != nil || n != 3 {
		t.Fatalf("backup rows = %d, err %v; want 3", n, err)
	}
	if _, err := os.Stat(want + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("temp file should be gone, stat err = %v", err)
	}

	// A second boot the same day does nothing — even though the data has changed since.
	before, _ := os.Stat(want)
	if _, err := conn.Exec(`INSERT INTO t (v) VALUES ('d')`); err != nil {
		t.Fatal(err)
	}
	res, err = Run(conn, dir, at(2026, time.October, 30).Add(5*time.Hour))
	if err != nil || res.Created != "" {
		t.Fatalf("second run: created %q, err %v; want no-op", res.Created, err)
	}
	after, _ := os.Stat(want)
	if !after.ModTime().Equal(before.ModTime()) || after.Size() != before.Size() {
		t.Error("existing backup must not be rewritten")
	}

	// The next day's first boot writes the next file, now containing the new row.
	res, err = Run(conn, dir, at(2026, time.October, 31))
	if err != nil || filepath.Base(res.Created) != "inventory-backup-2026-10-30.db" {
		t.Fatalf("next day: created %q, err %v", res.Created, err)
	}
}

func TestRunNamesDayAcrossMonthAndYearBoundaries(t *testing.T) {
	conn := openTestDB(t)
	for _, c := range []struct {
		now  time.Time
		want string
	}{
		{at(2027, time.January, 1), "inventory-backup-2026-12-31.db"},
		{at(2026, time.March, 1), "inventory-backup-2026-02-28.db"},
		{at(2028, time.March, 1), "inventory-backup-2028-02-29.db"},
	} {
		dir := t.TempDir()
		res, err := Run(conn, dir, c.now)
		if err != nil || filepath.Base(res.Created) != c.want {
			t.Errorf("now %v: created %q, err %v; want %s", c.now.Format("2006-01-02"), res.Created, err, c.want)
		}
	}
}

func TestRunKeepsOnlyNewest30AndLeavesOtherFilesAlone(t *testing.T) {
	conn := openTestDB(t)
	dir := t.TempDir()
	// 35 older backups + files that are not ours.
	for i := 1; i <= 35; i++ {
		day := time.Date(2026, time.September, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, i-1)
		if err := os.WriteFile(filepath.Join(dir, FileNameFor(day)), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"notes.txt", "inventory-backup-2026-13-45.db", "inventory-backup-latest.db", "inventory.db"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("keep"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	res, err := Run(conn, dir, at(2026, time.October, 30)) // creates ...-10-29 (the 36th)
	if err != nil {
		t.Fatal(err)
	}
	names, _ := list(dir)
	if len(names) != KeepDays {
		t.Fatalf("%d backups kept, want %d", len(names), KeepDays)
	}
	if names[0] != "inventory-backup-2026-10-29.db" {
		t.Errorf("newest = %s", names[0])
	}
	// Sep 1..Oct 5 = 35 files + the new one = 36 → the 6 oldest (Sep 1..6) go.
	if len(res.Pruned) != 6 {
		t.Errorf("pruned %d, want 6: %v", len(res.Pruned), res.Pruned)
	}
	if _, err := os.Stat(filepath.Join(dir, "inventory-backup-2026-09-06.db")); !os.IsNotExist(err) {
		t.Error("oldest backup should have been deleted")
	}
	for _, name := range []string{"notes.txt", "inventory-backup-2026-13-45.db", "inventory-backup-latest.db", "inventory.db"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s must be left alone: %v", name, err)
		}
	}
}

func TestRunReportsUnusableFolderWithoutPanicking(t *testing.T) {
	conn := openTestDB(t)
	blocker := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A path *under a regular file* can never be created.
	if _, err := Run(conn, filepath.Join(blocker, "DB backup"), at(2026, time.October, 30)); err == nil {
		t.Fatal("expected an error for an uncreatable folder")
	}
}

func TestResolveDirAndSummary(t *testing.T) {
	db := filepath.Join("data", "inventory.db")
	if got := ResolveDir(db, ""); got != filepath.Join("data", "DB backup") {
		t.Errorf("default = %q", got)
	}
	if got := ResolveDir(db, "  "); got != filepath.Join("data", "DB backup") {
		t.Errorf("blank custom = %q", got)
	}
	if got := ResolveDir(db, "/mnt/backups"); got != "/mnt/backups" {
		t.Errorf("custom = %q", got)
	}

	dir := t.TempDir()
	if info, err := Summary(filepath.Join(dir, "missing")); err != nil || info != (Info{}) {
		t.Errorf("missing folder = %+v, %v", info, err)
	}
	for _, d := range []int{3, 9, 5} {
		os.WriteFile(filepath.Join(dir, fmt.Sprintf("inventory-backup-2026-10-%02d.db", d)), []byte("x"), 0o644)
	}
	info, err := Summary(dir)
	if err != nil || info.Count != 3 || info.LatestFile != "inventory-backup-2026-10-09.db" || info.LatestDate != "2026-10-09" {
		t.Errorf("summary = %+v, %v", info, err)
	}
}
