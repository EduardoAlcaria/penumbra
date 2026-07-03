use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let child = start_engine(app);
            app.manage(Engine(Mutex::new(child)));
            Ok(())
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
