mod theme_apply;
mod windows_themes;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::ptr;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::Instant;
use tauri::command;


use crate::windows_themes::ThemeInfo;
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIcon, TrayIconBuilder, TrayIconEvent},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::MacosLauncher;
use log::{debug, info, warn, error};
use tauri_plugin_log::{Target, TargetKind};
use theme_apply::ThemeApplier;
use tokio::time::{sleep, Duration};
use winapi::shared::minwindef::{DWORD, HKEY};
use winapi::shared::winerror::ERROR_SUCCESS;
use winapi::um::winreg::{RegCloseKey, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY_CURRENT_USER};
use winapi::{
    ctypes::c_void,
    um::winuser::{SendMessageTimeoutW, HWND_BROADCAST, WM_SETTINGCHANGE},
};


static SESSION_ID: OnceLock<String> = OnceLock::new();

fn session_id() -> &'static str {
    SESSION_ID.get_or_init(|| {
        let ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        format!("{:x}", ms)
    })
}

fn format_timestamp() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_ms = d.as_millis();
    let ms = total_ms % 1000;
    let s = (total_ms / 1000) % 60;
    let m = (total_ms / 60000) % 60;
    let h = (total_ms / 3600000) % 24;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, ms)
}

const CLOUDSTORE_SUBKEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate";

struct AppState {
    tray: Mutex<Option<TrayIcon>>,
}

fn start_night_light_monitor(app_handle: AppHandle) {
    std::thread::spawn(move || {
        let mut last_value: Option<bool> = None;
        loop {
            unsafe {
                let key_wide: Vec<u16> = OsStr::new(CLOUDSTORE_SUBKEY).encode_wide().chain(Some(0)).collect();
                let mut key_handle: HKEY = ptr::null_mut();
                let status = RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    key_wide.as_ptr(),
                    0,
                    winapi::um::winnt::KEY_NOTIFY,
                    &mut key_handle,
                );
                if status == 0 {
                    winapi::um::winreg::RegNotifyChangeKeyValue(
                        key_handle,
                        0,
                        winapi::um::winnt::REG_NOTIFY_CHANGE_LAST_SET,
                        ptr::null_mut(),
                        0,
                    );
                    RegCloseKey(key_handle);
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(5000));
                }
            }

            let data = read_cloudstore_data(CLOUDSTORE_SUBKEY);
            let parsed = parse_night_light_state(&data);
            if let Some(is_on) = parsed {
                let changed = last_value.map(|v| v != is_on).unwrap_or(true);
                last_value = Some(is_on);
                if changed {
                    debug!("op=night_light_monitor | is_on={}", is_on);
                    let _ = app_handle.emit("night-light-changed", is_on);
                }
            }
        }
    });
}

fn show_window(app: &AppHandle) {
    info!("op=show_window | status=start");
    let windows = app.webview_windows();
    if let Some(window) = windows.values().next() {
        if let Err(e) = window.show() {
            error!("op=show_window | action=show | result=fail | err={}", e);
        } else {
            debug!("op=show_window | action=show | result=ok");
        }
        if let Err(e) = window.unminimize() {
            error!("op=show_window | action=unminimize | result=fail | err={}", e);
        }
        if let Err(e) = window.set_focus() {
            error!("op=show_window | action=set_focus | result=fail | err={}", e);
        } else {
            debug!("op=show_window | action=set_focus | result=ok");
        }
    }
    app.emit("show-app", ()).unwrap();
    info!("op=show_window | status=end");
}

async fn notify_system_theme_changed() {
    unsafe {
        let flags = 0x0002;
        let wide_str: Vec<u16> = "ImmersiveColorSet\0".encode_utf16().collect();
        let lparam_wide = wide_str.as_ptr() as *const c_void;

        let result = SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0usize,
            lparam_wide as isize,
            flags,
            1000,
            ptr::null_mut(),
        );
        if result == 0 {
            error!("op=broadcast | action=WM_SETTINGCHANGE | target=ImmersiveColorSet | result=fail");
        } else {
            debug!("op=broadcast | action=WM_SETTINGCHANGE | target=ImmersiveColorSet | result=ok");
        }
    }
}

fn set_registry_value(reg_path: &str, value_name: &str, value: u32) -> Result<(), String> {
    unsafe {
        let reg_path_wide: Vec<u16> = OsStr::new(reg_path).encode_wide().chain(Some(0)).collect();
        let value_name_wide: Vec<u16> = OsStr::new(value_name)
            .encode_wide()
            .chain(Some(0))
            .collect();

        let mut hkey: HKEY = ptr::null_mut();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            reg_path_wide.as_ptr(),
            0,
            winapi::um::winnt::KEY_SET_VALUE,
            &mut hkey,
        );

        if status != ERROR_SUCCESS as i32 {
            error!("op=set_registry | path={} | action=open_key | result=fail | status={}", reg_path, status);
            return Err(format!(
                "Failed to open registry key. Error code: {}",
                status
            ));
        }

        let result = RegSetValueExW(
            hkey,
            value_name_wide.as_ptr(),
            0,
            winapi::um::winnt::REG_DWORD,
            &value as *const u32 as *const u8,
            std::mem::size_of::<u32>() as DWORD,
        );

        if result != ERROR_SUCCESS as i32 {
            error!("op=set_registry | path={} | key={} | val={} | action=set_value | result=fail | err={}", reg_path, value_name, value, result);
            RegCloseKey(hkey);
            return Err(format!(
                "Failed to set registry value. Error code: {}",
                result
            ));
        }

        RegCloseKey(hkey);
        debug!("op=set_registry | path={} | key={} | val={} | result=ok", reg_path, value_name, value);
        Ok(())
    }
}

#[command]
async fn set_system_theme(is_light: bool) {
    let start = Instant::now();
    info!("status=start | op=set_system_theme | is_light={}", is_light);
    let theme_value = if is_light { 1 } else { 0 };
    let reg_path = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";

    for reg_key in ["SystemUsesLightTheme", "AppsUseLightTheme"] {
        info!("op=set_system_theme | target=registry | path={} | key={} | val={}", reg_path, reg_key, theme_value);
        match set_registry_value(reg_path, reg_key, theme_value) {
            Ok(()) => debug!("op=set_system_theme | target=registry | key={} | result=ok", reg_key),
            Err(e) => error!("op=set_system_theme | target=registry | key={} | result=fail | err={}", reg_key, e),
        }
    }
    info!("op=set_system_theme | target=broadcast | action=WM_SETTINGCHANGE");
    notify_system_theme_changed().await;
    tokio::spawn(async move {
        sleep(Duration::from_millis(155)).await;
        debug!("op=set_system_theme | target=broadcast | action=retry_delayed");
        notify_system_theme_changed().await;
    });
    info!("status=end | op=set_system_theme | is_light={} | cost={}ms", is_light, start.elapsed().as_millis());
} //
fn send_event(app_handle: &AppHandle) {
    info!("op=send_event | status=start");
    app_handle.emit("close-app", "quit").unwrap();
    info!("op=send_event | event=close-app | result=ok");
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(3000)).await;
        info!("op=send_event | action=exit | delay=3000ms");
        app_handle_clone.exit(0);
    });
}
fn create_system_tray(app: &AppHandle) -> tauri::Result<()> {
    info!("op=create_tray | status=start");
    let quit_i = MenuItem::with_id(app, "quit", "quit", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "show", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
    let trays = TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .show_menu_on_left_click(false)
        .tooltip("Auto Theme Switching App")
        .on_menu_event(|tray, event| match event.id.as_ref() {
            "quit" => {
                info!("op=tray_menu | action=quit");
                send_event(tray.app_handle());
            }
            "show" => {
                info!("op=tray_menu | action=show");
                show_window(&tray.app_handle());
            }
            "switch" => {
                info!("op=tray_menu | action=switch");
                tray.app_handle().emit("switch", "switch").unwrap();
            }
            _ => {
                warn!("op=tray_menu | action=unknown | id={:?}", event.id);
            }
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                info!("op=tray_icon | event=double_click");
                show_window(&tray.app_handle());
            }
            _ => {}
        })
        .build(app)?;
    let state: State<AppState> = app.state();
    let mut tray_lock = state.tray.lock().unwrap();
    *tray_lock = Some(trays);
    info!("op=create_tray | status=end");
    Ok(())
}
#[tauri::command]
fn update_tray_menu_item_title(
    app: tauri::AppHandle,
    quit: String,
    show: String,
    tooltip: String,
    switch: String,
) {
    info!("op=update_tray_menu | labels={},{},{},{}", quit, show, switch, tooltip);
    let app_handle = app.app_handle();
    let state: State<AppState> = app.state();
    let mut tray_lock = state.tray.lock().unwrap();
    let tray = match tray_lock.as_mut() {
        Some(tray) => tray,
        None => {
            error!("op=update_tray_menu | action=get_tray | result=fail | reason=not_found");
            return;
        }
    };

    let quit_i = match MenuItem::with_id(app_handle, "quit", quit, true, None::<&str>) {
        Ok(item) => item,
        Err(e) => {
            error!("op=update_tray_menu | action=create_menu | id=quit | result=fail | err={}", e);
            return;
        }
    };
    let show_i = match MenuItem::with_id(app_handle, "show", show, true, None::<&str>) {
        Ok(item) => item,
        Err(e) => {
            error!("op=update_tray_menu | action=create_menu | id=show | result=fail | err={}", e);
            return;
        }
    };
    let switch = match MenuItem::with_id(app_handle, "switch", switch, true, None::<&str>) {
        Ok(item) => item,
        Err(e) => {
            error!("op=update_tray_menu | action=create_menu | id=switch | result=fail | err={}", e);
            return;
        }
    };
    let separator = match PredefinedMenuItem::separator(app_handle) {
        Ok(item) => item,
        Err(e) => {
            error!("op=update_tray_menu | action=create_separator | result=fail | err={}", e);
            return;
        }
    };
    let menu = match Menu::with_items(app_handle, &[&show_i, &switch, &separator, &quit_i]) {
        Ok(menu) => menu,
        Err(e) => {
            error!("op=update_tray_menu | action=build_menu | result=fail | err={}", e);
            return;
        }
    };
    if let Err(e) = tray.set_menu(Some(menu)) {
        error!("op=update_tray_menu | action=set_menu | result=fail | err={}", e);
    } else {
        debug!("op=update_tray_menu | action=set_menu | result=ok");
    }
    if let Err(e) = tray.set_tooltip(Some(tooltip)) {
        error!("op=update_tray_menu | action=set_tooltip | result=fail | err={}", e);
    } else {
        debug!("op=update_tray_menu | action=set_tooltip | result=ok");
    }
}
/// 读取 CloudStore 注册表二进制数据
fn read_cloudstore_data(sub_key: &str) -> Vec<u8> {
    unsafe {
        let key_wide: Vec<u16> = OsStr::new(sub_key).encode_wide().chain(Some(0)).collect();
        let mut key_handle: HKEY = ptr::null_mut();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            key_wide.as_ptr(),
            0,
            winapi::um::winnt::KEY_READ,
            &mut key_handle,
        );
        if status != ERROR_SUCCESS as i32 {
            debug!("op=read_cloudstore | action=open_key | result=fail | status={}", status);
            return Vec::new();
        }
        let name_wide: Vec<u16> = OsStr::new("Data").encode_wide().chain(Some(0)).collect();
        let mut value_size: DWORD = 0;
        RegQueryValueExW(
            key_handle,
            name_wide.as_ptr(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            &mut value_size,
        );
        if value_size == 0 {
            debug!("op=read_cloudstore | action=query_size | result=empty");
            RegCloseKey(key_handle);
            return Vec::new();
        }
        let mut buffer = vec![0u8; value_size as usize];
        let mut result_size = value_size;
        let result = RegQueryValueExW(
            key_handle,
            name_wide.as_ptr(),
            ptr::null_mut(),
            ptr::null_mut(),
            buffer.as_mut_ptr(),
            &mut result_size,
        );
        RegCloseKey(key_handle);
        if result == ERROR_SUCCESS as i32 {
            buffer.truncate(result_size as usize);
            debug!("op=read_cloudstore | action=read | bytes={}", buffer.len());
            buffer
        } else {
            warn!("op=read_cloudstore | action=read | result=fail | status={}", result);
            Vec::new()
        }
    }
}

const NIGHT_LIGHT_OFFSET: usize = 35;

fn parse_night_light_state(data: &[u8]) -> Option<bool> {
    if data.len() > NIGHT_LIGHT_OFFSET && data[NIGHT_LIGHT_OFFSET] <= 1 {
        return Some(data[NIGHT_LIGHT_OFFSET] == 1);
    }
    for i in (20..data.len().min(64)).rev() {
        if data[i] <= 1 {
            warn!("op=night_light | action=fallback_offset | offset={} | val={}", i, data[i]);
            return Some(data[i] == 1);
        }
    }
    if !data.is_empty() {
        warn!("op=night_light | action=unknown_format | len={} | first32={:02x?}", data.len(), &data[..data.len().min(32)]);
        debug!("op=night_light | full_data={:02x?}", data);
    }
    None
}

#[tauri::command]
fn get_night_light_state() -> Result<bool, String> {
    let data = read_cloudstore_data(CLOUDSTORE_SUBKEY);
    if data.is_empty() {
        return Err("无法读取夜灯状态: 注册表键打开失败或值为空".into());
    }
    debug!("op=night_light | len={} | first32={:02x?}", data.len(), &data[..data.len().min(32)]);
    parse_night_light_state(&data).ok_or_else(|| "无法解析夜灯数据: 格式不兼容".into())
}
/// Read a single preview file and return as data URL (base64).

#[tauri::command]
async fn get_windows_themes() -> Vec<ThemeInfo> {
    let start = Instant::now();
    info!("op=get_windows_themes | status=start");
    let themes = tokio::task::spawn_blocking(|| windows_themes::get_all_themes())
        .await
        .unwrap_or_default();
    info!("op=get_windows_themes | status=end | count={} | cost={}ms", themes.len(), start.elapsed().as_millis());
    if themes.is_empty() {
        warn!("op=get_windows_themes | count=0 | result=empty");
    }
    themes
}
#[tauri::command]
async fn apply_theme(theme_path: String) -> Result<(), String> {
    let start = Instant::now();
    info!("op=apply_theme | status=start | path={}", &theme_path);
    let result = crate::ThemeApplier::apply_theme_by_path(&theme_path);
    match &result {
        Ok(()) => info!("op=apply_theme | status=end | cost={}ms", start.elapsed().as_millis()),
        Err(e) => error!("op=apply_theme | status=end | result=fail | err={} | cost={}ms", e, start.elapsed().as_millis()),
    }
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(5 * 1024 * 1024)
                .targets([
                    Target::new(TargetKind::Stdout)
                        .format(|out, _, record| {
                            let color = match record.level() {
                                log::Level::Error => "\x1b[31;1m",
                                log::Level::Warn => "\x1b[33;1m",
                                log::Level::Info => "\x1b[36m",
                                log::Level::Debug => "\x1b[90m",
                                _ => "\x1b[0m",
                            };
                            let level_name = match record.level() {
                                log::Level::Error => "ERROR",
                                log::Level::Warn => "WARN",
                                log::Level::Info => "INFO",
                                log::Level::Debug => "DEBUG",
                                log::Level::Trace => "TRACE",
                            };
                            let file = record.file().and_then(|f| f.rsplit_once(['/', '\\']).map(|(_, n)| n)).unwrap_or("?");
                            let line = record.line().unwrap_or(0);
                            out.finish(format_args!(
                                "{color}[{level:5}]\x1b[0m [{ts}] [{sid}] [{file}:{line:<4}] | {args}",
                                color = color,
                                level = level_name,
                                ts = format_timestamp(),
                                sid = session_id(),
                                file = file,
                                line = line,
                                args = record.args(),
                            ))
                        }),
                    Target::new(TargetKind::Folder {
                        path: std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("logs"),
                        file_name: Some("app.log".to_string()),
                    })
                        .format(|out, _, record| {
                            let level_name = match record.level() {
                                log::Level::Error => "ERROR",
                                log::Level::Warn => "WARN",
                                log::Level::Info => "INFO",
                                log::Level::Debug => "DEBUG",
                                log::Level::Trace => "TRACE",
                            };
                            let file = record.file().and_then(|f| f.rsplit_once(['/', '\\']).map(|(_, n)| n)).unwrap_or("?");
                            let line = record.line().unwrap_or(0);
                            out.finish(format_args!(
                                "[{level:5}] [{ts}] [{sid}] [{file}:{line:<4}] | {args}",
                                level = level_name,
                                ts = format_timestamp(),
                                sid = session_id(),
                                file = file,
                                line = line,
                                args = record.args(),
                            ))
                        }),
                    Target::new(TargetKind::LogDir { file_name: None })
                        .format(|out, _, record| {
                            let level_name = match record.level() {
                                log::Level::Error => "ERROR",
                                log::Level::Warn => "WARN",
                                log::Level::Info => "INFO",
                                log::Level::Debug => "DEBUG",
                                log::Level::Trace => "TRACE",
                            };
                            let file = record.file().and_then(|f| f.rsplit_once(['/', '\\']).map(|(_, n)| n)).unwrap_or("?");
                            let line = record.line().unwrap_or(0);
                            out.finish(format_args!(
                                "[{level:5}] [{ts}] [{sid}] [{file}:{line:<4}] | {args}",
                                level = level_name,
                                ts = format_timestamp(),
                                sid = session_id(),
                                file = file,
                                line = line,
                                args = record.args(),
                            ))
                        }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .setup(|app| -> Result<(), Box<dyn std::error::Error>> {
            info!("op=setup | status=start");
            let app_handle = app.handle();
            let main_window = app_handle
                .get_webview_window("main")
                .expect("Failed to get the main window");
            main_window.hide().expect("Failed to hide the window");
            debug!("op=setup | action=hide_window | result=ok");
            main_window
                .set_always_on_top(false)
                .expect("Failed to set always on top");
            debug!("op=setup | action=always_on_top | val=false | result=ok");
            main_window
                .set_effects(
                    EffectsBuilder::new()
                        .effect(Effect::Mica)
                        .state(EffectState::FollowsWindowActiveState)
                        .build(),
                )
                .expect("Failed to set window effect");
            debug!("op=setup | action=set_effects | val=Mica | result=ok");
            main_window.set_shadow(true).expect("Failed to set shadow");
            debug!("op=setup | action=set_shadow | val=true | result=ok");
            create_system_tray(&app_handle)?;
            start_night_light_monitor(app_handle.clone());
            info!("op=setup | status=end | night_light_monitor=started");
            Ok(())
        })
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            info!("op=single_instance | action=activate_existing");
            show_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            tray: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            set_system_theme,
            update_tray_menu_item_title,
            get_night_light_state,
            get_windows_themes,
            apply_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
