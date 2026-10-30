package db

import "testing"

// isolateConfig points the per-user config dir at a temp folder so tests never touch the
// real config.json.
func isolateConfig(t *testing.T) {
	t.Helper()
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("AppData", tmp)
}

func TestUpdateConfigPreservesOtherSettings(t *testing.T) {
	isolateConfig(t)

	if err := UpdateConfig(func(c *Config) { c.DBPath = "/data/inventory.db" }); err != nil {
		t.Fatal(err)
	}
	if err := UpdateConfig(func(c *Config) { c.BackupDir = "/data/backups" }); err != nil {
		t.Fatal(err)
	}
	got, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if got.DBPath != "/data/inventory.db" || got.BackupDir != "/data/backups" {
		t.Fatalf("config = %+v; changing one setting must keep the other", got)
	}

	// Resetting the DB path (what the startup fallback does) leaves the backup folder alone.
	if err := UpdateConfig(func(c *Config) { c.DBPath = "" }); err != nil {
		t.Fatal(err)
	}
	if got, _ := LoadConfig(); got.DBPath != "" || got.BackupDir != "/data/backups" {
		t.Fatalf("after DBPath reset: %+v", got)
	}
}
