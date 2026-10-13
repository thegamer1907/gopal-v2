package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

// version is the app's release version, embedded at build time via
// `wails build -ldflags "-X main.version=vX.Y.Z"` (see .github/workflows/build-windows.yml).
// Unset in `wails dev` — the "dev" value doubles as a signal that self-update should
// never report an update as available (see internal/updater).
var version = "dev"

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "gopal-v2",
		Width:  1024,
		Height: 768,
		// Start filling the screen (keeps the OS title bar); the in-app sidebar
		// Logout button quits the app.
		WindowStartState: options.Maximised,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		// If the client double-launches the .exe while it's already running, bring the
		// existing window to the front instead of opening a second instance — Wails
		// detects this itself (a named mutex on Windows) and forwards the launch here.
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "gopal-v2-single-instance", // stable forever — do not change across releases
			OnSecondInstanceLaunch: func(_ options.SecondInstanceData) {
				wruntime.WindowShow(app.ctx)
			},
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
