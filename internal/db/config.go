package db

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// configFileName is the small JSON file (next to the default DB) that remembers
// the user's chosen database location across restarts.
const configFileName = "config.json"

// Config holds user-configurable storage settings: the active database path and the
// backup folder. Always change it through UpdateConfig so a setting you didn't touch is
// preserved (SaveConfig overwrites the whole file).
type Config struct {
	DBPath string `json:"dbPath"`
	// BackupDir is where daily database backups go. "" means the default: a "DB backup"
	// folder beside the database file (see internal/backup).
	BackupDir string `json:"backupDir"`
}

// configPath returns the absolute path to config.json (creating the app dir).
func configPath() (string, error) {
	dir, err := AppDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, configFileName), nil
}

// LoadConfig reads config.json. A missing file is not an error — it yields the
// zero Config (meaning "use the default database").
func LoadConfig() (Config, error) {
	path, err := configPath()
	if err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Config{}, nil
		}
		return Config{}, fmt.Errorf("read config %q: %w", path, err)
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return Config{}, fmt.Errorf("parse config %q: %w", path, err)
	}
	return c, nil
}

// SaveConfig writes config.json.
func SaveConfig(c Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write config %q: %w", path, err)
	}
	return nil
}

// UpdateConfig loads config.json, applies mutate to it and saves it, so changing one
// setting never clobbers the others.
func UpdateConfig(mutate func(*Config)) error {
	c, err := LoadConfig()
	if err != nil {
		return err
	}
	mutate(&c)
	return SaveConfig(c)
}

// ActivePath returns the database path the app should open: the configured
// DBPath if one is set, otherwise the default location.
func ActivePath() (string, error) {
	c, err := LoadConfig()
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(c.DBPath) != "" {
		return c.DBPath, nil
	}
	return DefaultPath()
}
