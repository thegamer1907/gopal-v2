// Package updater implements the in-app "Check for Updates" feature: checking GitHub
// Releases for a newer build (Check, portable/safe on any OS) and replacing the running
// executable with it (Apply, in apply.go — real file surgery, gated to Windows by callers
// since that's the only platform this app ships on).
package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Info describes the result of a Check.
type Info struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	Available      bool   `json:"available"`
	DownloadURL    string `json:"downloadUrl"`
	ChecksumHex    string `json:"checksumHex"`
	ReleaseNotes   string `json:"releaseNotes"`
	ReleaseURL     string `json:"releaseUrl"`
}

type ghRelease struct {
	TagName string    `json:"tag_name"`
	Body    string    `json:"body"`
	HTMLURL string    `json:"html_url"`
	Assets  []ghAsset `json:"assets"`
}

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// apiBaseURL is a format string for the "latest release" endpoint — a package var
// (rather than a literal) so tests can point it at an httptest.Server.
var apiBaseURL = "https://api.github.com/repos/%s/releases/latest"

// Check queries GitHub's "latest release" API for repo (format "owner/name") and
// compares its tag against currentVersion. Missing/malformed assets or checksum are
// tolerated (Info just comes back without them) — only network/decode failures error.
func Check(ctx context.Context, repo, currentVersion string) (Info, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	rel, err := fetchLatestRelease(ctx, repo)
	if err != nil {
		return Info{}, err
	}

	info := Info{
		CurrentVersion: currentVersion,
		LatestVersion:  rel.TagName,
		ReleaseNotes:   rel.Body,
		ReleaseURL:     rel.HTMLURL,
	}
	for _, a := range rel.Assets {
		switch {
		case strings.HasSuffix(a.Name, "windows-amd64.exe"):
			info.DownloadURL = a.BrowserDownloadURL
		case strings.HasSuffix(a.Name, "windows-amd64.exe.sha256"):
			if sum, err := fetchChecksum(ctx, a.BrowserDownloadURL); err == nil {
				info.ChecksumHex = sum
			}
		}
	}
	info.Available = info.DownloadURL != "" && isNewer(rel.TagName, currentVersion)
	return info, nil
}

func fetchLatestRelease(ctx context.Context, repo string) (ghRelease, error) {
	url := fmt.Sprintf(apiBaseURL, repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return ghRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "gopal-v2-updater")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ghRelease{}, fmt.Errorf("check for updates: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ghRelease{}, fmt.Errorf("check for updates: github returned %s", resp.Status)
	}

	var rel ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return ghRelease{}, fmt.Errorf("check for updates: decode response: %w", err)
	}
	return rel, nil
}

// fetchChecksum downloads a small ".sha256" release asset and returns its hex digest
// (the file is expected to contain just the hash, optionally followed by whitespace/a
// filename — the common `sha256sum` output shape).
func fetchChecksum(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "gopal-v2-updater")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github returned %s", resp.Status)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if err != nil {
		return "", err
	}
	fields := strings.Fields(string(body))
	if len(fields) == 0 {
		return "", fmt.Errorf("empty checksum file")
	}
	return fields[0], nil
}

// isNewer reports whether latest is a newer release than current. Versions are expected
// as "vMAJOR.MINOR.PATCH"; if either fails to parse (covers the "dev" build used by
// `wails dev`, and any unexpected/malformed tag), it conservatively returns false rather
// than guessing from a raw string difference — so a plain dev session (and any ambiguous
// data) never lights up the destructive apply path.
func isNewer(latest, current string) bool {
	lv, lok := parseVersion(latest)
	cv, cok := parseVersion(current)
	if !lok || !cok {
		return false
	}
	for i := 0; i < 3; i++ {
		if lv[i] != cv[i] {
			return lv[i] > cv[i]
		}
	}
	return false
}

// parseVersion parses "vMAJOR.MINOR.PATCH" (the "v" is optional) into a [3]int. Missing
// trailing components default to 0; any non-numeric component fails parsing.
func parseVersion(s string) ([3]int, bool) {
	var v [3]int
	s = strings.TrimPrefix(strings.TrimSpace(s), "v")
	if s == "" {
		return v, false
	}
	parts := strings.SplitN(s, ".", 3)
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return v, false
		}
		v[i] = n
	}
	return v, true
}
