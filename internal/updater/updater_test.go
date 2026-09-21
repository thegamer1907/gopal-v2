package updater

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsNewer(t *testing.T) {
	cases := []struct {
		latest, current string
		want            bool
	}{
		{"v0.4.0", "v0.3.0", true},
		{"v0.3.0", "v0.4.0", false},
		{"v0.4.0", "v0.4.0", false},
		{"v0.10.0", "v0.9.0", true},  // double-digit minor: numeric, not lexicographic
		{"v0.9.0", "v0.10.0", false}, // same, reversed
		{"v1.0.0", "v0.9.9", true},
		{"v0.4.0", "dev", false}, // "dev" (wails dev build) never looks updatable
		{"dev", "dev", false},
		{"v0.4.0", "", false},              // unparseable/empty current: never claims an update
		{"not-a-version", "v0.4.0", false}, // unparseable latest: ambiguous, stay conservative
	}
	for _, c := range cases {
		if got := isNewer(c.latest, c.current); got != c.want {
			t.Errorf("isNewer(%q, %q) = %v, want %v", c.latest, c.current, got, c.want)
		}
	}
}

func TestParseVersion(t *testing.T) {
	if v, ok := parseVersion("v1.2.3"); !ok || v != [3]int{1, 2, 3} {
		t.Errorf("parseVersion(v1.2.3) = %v, %v", v, ok)
	}
	if v, ok := parseVersion("2.0"); !ok || v != [3]int{2, 0, 0} {
		t.Errorf("parseVersion(2.0) = %v, %v", v, ok)
	}
	if _, ok := parseVersion("dev"); ok {
		t.Errorf("parseVersion(dev) should fail to parse")
	}
	if _, ok := parseVersion(""); ok {
		t.Errorf("parseVersion(\"\") should fail to parse")
	}
}

func TestCheck(t *testing.T) {
	var checksumURL string
	mux := http.NewServeMux()
	mux.HandleFunc("/checksum", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "abc123def456  gopal-v2-v0.5.0-windows-amd64.exe\n")
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	checksumURL = srv.URL + "/checksum"

	mux.HandleFunc("/repos/thegamer1907/gopal-v2/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{
			"tag_name": "v0.5.0",
			"body": "release notes",
			"html_url": "https://example.com/release",
			"assets": [
				{"name": "gopal-v2-v0.5.0-windows-amd64.exe", "browser_download_url": "https://example.com/gopal.exe"},
				{"name": "gopal-v2-v0.5.0-windows-amd64.exe.sha256", "browser_download_url": %q}
			]
		}`, checksumURL)
	})

	orig := apiBaseURL
	apiBaseURL = srv.URL + "/repos/%s/releases/latest"
	defer func() { apiBaseURL = orig }()

	info, err := Check(context.Background(), "thegamer1907/gopal-v2", "v0.4.0")
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if !info.Available {
		t.Errorf("expected an update to be available")
	}
	if info.LatestVersion != "v0.5.0" {
		t.Errorf("LatestVersion = %q, want v0.5.0", info.LatestVersion)
	}
	if info.DownloadURL != "https://example.com/gopal.exe" {
		t.Errorf("DownloadURL = %q", info.DownloadURL)
	}
	if info.ChecksumHex != "abc123def456" {
		t.Errorf("ChecksumHex = %q, want abc123def456", info.ChecksumHex)
	}
	if info.ReleaseNotes != "release notes" {
		t.Errorf("ReleaseNotes = %q", info.ReleaseNotes)
	}
}

func TestCheckUpToDate(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/thegamer1907/gopal-v2/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"tag_name": "v0.4.0", "assets": [
			{"name": "gopal-v2-v0.4.0-windows-amd64.exe", "browser_download_url": "https://example.com/gopal.exe"}
		]}`)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	orig := apiBaseURL
	apiBaseURL = srv.URL + "/repos/%s/releases/latest"
	defer func() { apiBaseURL = orig }()

	info, err := Check(context.Background(), "thegamer1907/gopal-v2", "v0.4.0")
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if info.Available {
		t.Errorf("expected no update available when already on the latest version")
	}
	if info.ChecksumHex != "" {
		t.Errorf("ChecksumHex = %q, want empty (no checksum asset published)", info.ChecksumHex)
	}
}
