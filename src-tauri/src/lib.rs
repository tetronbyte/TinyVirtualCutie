use std::fs;
use std::path::PathBuf;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Persisted pet state lives in `<app config dir>/state.json`.
/// The frontend owns the schema (position, theme, ...); Rust only stores the JSON blob.
fn state_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("state.json"))
}

#[tauri::command]
fn load_state(app: AppHandle) -> Option<String> {
    state_path(&app).and_then(|p| fs::read_to_string(p).ok())
}

#[tauri::command]
fn save_state(app: AppHandle, json: String) -> Result<(), String> {
    let path = state_path(&app).ok_or("no config dir")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(path, json).map_err(|e| e.to_string())
}

/// Frontend → terminal logging (errors and diagnostics show up in `tauri dev` output).
#[tauri::command]
fn log(msg: String) {
    println!("[pet] {msg}");
}

fn toggle_pet<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("pet") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_state, save_state, log])
        .setup(|app| {
            let show_hide = MenuItem::with_id(app, "toggle", "Show / Hide Dumbo", true, None::<&str>)?;
            let t_auto = CheckMenuItem::with_id(app, "theme:auto", "Auto (follow Windows)", true, true, None::<&str>)?;
            let t_light = CheckMenuItem::with_id(app, "theme:light", "Light", true, false, None::<&str>)?;
            let t_dark = CheckMenuItem::with_id(app, "theme:dark", "Dark", true, false, None::<&str>)?;
            let theme = Submenu::with_items(app, "Theme", true, &[&t_auto, &t_light, &t_dark])?;
            let sleep = MenuItem::with_id(app, "action:sleep", "Sleep", true, None::<&str>)?;
            let wake = MenuItem::with_id(app, "action:wake", "Wake up", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show_hide, &sleep, &wake, &theme, &sep, &quit])?;

            let checks = [t_auto.clone(), t_light.clone(), t_dark.clone()];
            TrayIconBuilder::with_id("dumbo-tray")
                .icon(app.default_window_icon().cloned().expect("app icon missing"))
                .tooltip("Dumbo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    let id = event.id().as_ref();
                    match id {
                        "toggle" => toggle_pet(app),
                        "quit" => app.exit(0),
                        _ if id.starts_with("theme:") => {
                            for c in &checks {
                                let _ = c.set_checked(c.id().as_ref() == id);
                            }
                            let _ = app.emit("theme", id.trim_start_matches("theme:"));
                        }
                        _ if id.starts_with("action:") => {
                            let _ = app.emit("action", id.trim_start_matches("action:"));
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        toggle_pet(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Dumbo");
}
