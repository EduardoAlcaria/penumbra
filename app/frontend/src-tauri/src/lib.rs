use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, RunEvent, WindowEvent};

/// Handle to the Java engine process so it can be killed when the window closes.
struct Engine(Mutex<Option<Child>>);

/// Launch the Spring Boot engine (HID + REST API on 127.0.0.1:8787).
/// Looks for the jar bundled as a resource, next to the exe (portable), then
/// the built jar in dev — first one that exists wins.
fn start_engine(app: &tauri::App) -> Option<Child> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("penumbra-backend.jar"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("penumbra-backend.jar"));
        }
    }
    candidates.push(std::path::PathBuf::from(
        "../../backend/target/penumbra-backend-0.1.0.jar",
    ));

    let jar = candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .unwrap_or_else(|| candidates[0].clone());

    let mut cmd = Command::new("java");
    cmd.arg("-jar").arg(&jar);
    // Run the engine from the jar's dir so its H2 db (./data) lands there —
    // never in a dev-watched folder, where the lock file would trigger an
    // endless rebuild/restart loop in `tauri dev`.
    if let Some(dir) = jar.parent() {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no stray console
    }
    match cmd.spawn() {
        Ok(child) => Some(child),
        Err(e) => {
            eprintln!("Penumbra: failed to start Java engine at {jar:?}: {e}");
            None
        }
    }
}

/// Reveal the app's config dir (themes, settings) in the OS file manager,
/// creating it on first use.
#[tauri::command]
fn open_config_dir(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Starter themes written on first run so the YAML format documents itself.
const BUILTIN_THEMES: &[(&str, &str)] = &[
    (
        "ember.yaml",
        "# Penumbra theme. Flat map: any CSS variable from the app's :root, without the \"--\".\n\
         # Values are raw CSS (oklch(), hex, anything). \"name\" is the display name.\n\
         name: Ember\n\
         background: oklch(0.15 0.016 45)\n\
         card: oklch(0.185 0.02 45)\n\
         popover: oklch(0.185 0.02 45)\n\
         secondary: oklch(0.225 0.022 45)\n\
         muted: oklch(0.235 0.022 45)\n\
         accent: oklch(0.235 0.022 45)\n\
         border: oklch(0.28 0.025 45)\n\
         input: oklch(0.28 0.025 45)\n\
         primary: oklch(0.68 0.19 45)\n\
         ring: oklch(0.68 0.19 45)\n\
         glow: oklch(0.68 0.19 45)\n",
    ),
    (
        "aurora.yaml",
        "name: Aurora\n\
         background: oklch(0.145 0.016 200)\n\
         card: oklch(0.185 0.02 200)\n\
         popover: oklch(0.185 0.02 200)\n\
         secondary: oklch(0.225 0.022 200)\n\
         muted: oklch(0.235 0.022 200)\n\
         accent: oklch(0.235 0.022 200)\n\
         border: oklch(0.28 0.025 200)\n\
         input: oklch(0.28 0.025 200)\n\
         primary: oklch(0.72 0.15 170)\n\
         ring: oklch(0.72 0.15 170)\n\
         glow: oklch(0.72 0.15 170)\n",
    ),
];

/// The themes dir (inside the app config dir), seeded with the built-ins on first use.
fn themes_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("themes");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        for (name, body) in BUILTIN_THEMES {
            let _ = std::fs::write(dir.join(name), body);
        }
    }
    Ok(dir)
}

#[derive(serde::Serialize)]
struct ThemeFile {
    file: String,
    content: String,
}

/// Every *.yaml/*.yml in the themes dir, raw — the frontend parses and applies.
#[tauri::command]
fn list_themes(app: tauri::AppHandle) -> Result<Vec<ThemeFile>, String> {
    let dir = themes_dir(&app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "yaml" && ext != "yml" {
            continue;
        }
        if let (Some(stem), Ok(content)) = (
            path.file_stem().and_then(|s| s.to_str()),
            std::fs::read_to_string(&path),
        ) {
            out.push(ThemeFile { file: stem.to_string(), content });
        }
    }
    Ok(out)
}

#[tauri::command]
fn open_themes_dir(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = themes_dir(&app)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Show and focus the main window (used by the tray click and Show menu item).
fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// System tray: left-click opens the window, menu has Show and Quit.
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Penumbra", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Penumbra")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // On boot the app autostarts with --minimized so it lands in the tray
        // instead of flashing a window (in dev that window is just WebView2's
        // "can't reach the Vite server" error page).
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            open_config_dir,
            list_themes,
            open_themes_dir
        ])
        .setup(|app| {
            let child = start_engine(app);
            app.manage(Engine(Mutex::new(child)));
            build_tray(app.handle())?;

            // Show the window unless we were autostarted minimized to the tray.
            let minimized = std::env::args().any(|a| a == "--minimized");
            if let Some(win) = app.get_webview_window("main") {
                if !minimized {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides to the tray; the engine keeps running.
            // Real exit only via the tray's Quit item.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Penumbra")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(engine) = app.try_state::<Engine>() {
                    if let Some(mut child) = engine.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
