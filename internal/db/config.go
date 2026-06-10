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

// Config holds user-configurable storage settings. For now just the active
// database path; more settings can be added here later.
type Config struct {
	DBPath string `json:"dbPath"`
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
