// Package backup keeps dated copies of the SQLite database. The rule (from the client): when
// the app boots on day N and there is no backup named for day N-1, this is the first boot of
// day N, so the database — which holds everything up to the end of N-1 — is copied and the
// copy is named for N-1. Only the newest KeepDays backups are kept. See docs/DECISIONS.md.
package backup

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	// DirName is the default backup folder, created next to the database file.
	DirName = "DB backup"
	// KeepDays is how many dated backups are retained; older ones are deleted.
	KeepDays = 30

	namePrefix = "inventory-backup-"
	nameSuffix = ".db"
	dateLayout = "2006-01-02" // ISO, so names sort chronologically
)

// Result reports what a Run did.
type Result struct {
	Created string   // path of the backup written, "" if one already existed
	Pruned  []string // backups deleted to stay within KeepDays
}

// Info summarizes a backup folder for the Settings page.
type Info struct {
	Count      int
	LatestFile string // file name of the newest backup, "" if none
	LatestDate string // its day as YYYY-MM-DD
}

// ResolveDir returns the folder backups go to: custom when set, otherwise a "DB backup"
// folder beside the database file.
func ResolveDir(dbPath, custom string) string {
	if strings.TrimSpace(custom) != "" {
		return custom
	}
	return filepath.Join(filepath.Dir(dbPath), DirName)
}

// FileNameFor is the backup file name for a given day.
func FileNameFor(day time.Time) string {
	return namePrefix + day.Format(dateLayout) + nameSuffix
}

// parseName extracts the day from a backup file name; ok is false for anything that is not
// exactly one of our backup names (so foreign files are never touched).
func parseName(name string) (time.Time, bool) {
	if !strings.HasPrefix(name, namePrefix) || !strings.HasSuffix(name, nameSuffix) {
		return time.Time{}, false
	}
	datePart := strings.TrimSuffix(strings.TrimPrefix(name, namePrefix), nameSuffix)
	day, err := time.Parse(dateLayout, datePart)
	if err != nil || FileNameFor(day) != name {
		return time.Time{}, false
	}
	return day, true
}

// Run applies the boot-time rule against dir using now as the system time: if no backup for
// the previous calendar day exists, write one from conn, then prune to KeepDays.
func Run(conn *sql.DB, dir string, now time.Time) (Result, error) {
	var res Result
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return res, fmt.Errorf("create backup folder %q: %w", dir, err)
	}

	yesterday := time.Date(now.Year(), now.Month(), now.Day()-1, 0, 0, 0, 0, time.UTC)
	target := filepath.Join(dir, FileNameFor(yesterday))

	if _, err := os.Stat(target); os.IsNotExist(err) {
		// VACUUM INTO writes a consistent snapshot even while the app holds the database
		// open (a raw file copy could catch it mid-write). It goes to a temp name first so a
		// crash can never leave a half-written file that looks like a valid backup.
		tmp := target + ".tmp"
		_ = os.Remove(tmp)
		if _, err := conn.Exec(`VACUUM INTO '` + strings.ReplaceAll(tmp, `'`, `''`) + `'`); err != nil {
			_ = os.Remove(tmp)
			return res, fmt.Errorf("back up database: %w", err)
		}
		if err := os.Rename(tmp, target); err != nil {
			_ = os.Remove(tmp)
			return res, fmt.Errorf("finish backup %q: %w", target, err)
		}
		res.Created = target
	} else if err != nil {
		return res, fmt.Errorf("check backup %q: %w", target, err)
	}

	pruned, err := prune(dir)
	res.Pruned = pruned
	return res, err
}

// list returns the folder's backup files, newest day first.
func list(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	type dated struct {
		name string
		day  time.Time
	}
	var found []dated
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if day, ok := parseName(e.Name()); ok {
			found = append(found, dated{e.Name(), day})
		}
	}
	sort.Slice(found, func(i, j int) bool { return found[i].day.After(found[j].day) })
	names := make([]string, len(found))
	for i, f := range found {
		names[i] = f.name
	}
	return names, nil
}

// prune deletes every backup beyond the newest KeepDays and returns their paths.
func prune(dir string) ([]string, error) {
	names, err := list(dir)
	if err != nil {
		return nil, fmt.Errorf("list backups: %w", err)
	}
	var pruned []string
	for _, name := range names[min(KeepDays, len(names)):] {
		path := filepath.Join(dir, name)
		if err := os.Remove(path); err != nil {
			return pruned, fmt.Errorf("delete old backup %q: %w", path, err)
		}
		pruned = append(pruned, path)
	}
	return pruned, nil
}

// Summary describes dir for the UI. A missing folder is just "no backups yet".
func Summary(dir string) (Info, error) {
	names, err := list(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return Info{}, nil
		}
		return Info{}, err
	}
	info := Info{Count: len(names)}
	if len(names) > 0 {
		info.LatestFile = names[0]
		info.LatestDate = strings.TrimSuffix(strings.TrimPrefix(names[0], namePrefix), nameSuffix)
	}
	return info, nil
}
