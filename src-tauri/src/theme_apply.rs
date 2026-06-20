use log::{error, info, warn};

use std::path::Path;
use std::process::Command;

/// 主题应用模块
pub struct ThemeApplier;

impl ThemeApplier {
    pub fn apply_theme_by_path(theme_path: &str) -> Result<(), String> {
        info!("op=apply_theme_by_path | status=start | path={}", theme_path);

        if !Path::new(theme_path).exists() {
            warn!("op=apply_theme_by_path | action=validate | result=fail | reason=not_found | path={}", theme_path);
            return Err("主题文件不存在".to_string());
        }

        if !theme_path.to_lowercase().ends_with(".theme") {
            warn!("op=apply_theme_by_path | action=validate | result=fail | reason=invalid_ext | path={}", theme_path);
            return Err("文件不是有效的主题文件".to_string());
        }

        let result = Command::new("cmd")
            .args(&["/C", "start", "/b", "", theme_path])
            .status();

        match result {
            Ok(status) if status.success() => {
                info!("op=apply_theme_by_path | method=start_b | result=ok");
                Ok(())
            }
            Ok(status) => {
                warn!("op=apply_theme_by_path | method=start_b | result=fail | exit={:?}", status.code());
                Err(format!("退出码: {:?}", status.code()))
            }
            Err(e) => {
                warn!("op=apply_theme_by_path | method=start_b | result=error | err={}", e);
                Self::apply_theme_alternative(theme_path)
            }
        }
    }

    pub fn apply_theme_alternative(theme_path: &str) -> Result<(), String> {
        info!("op=apply_theme_alternative | method=powershell | path={}", theme_path);
        let _ = Self::apply_theme_via_registry(theme_path);
        let status = Command::new("powershell")
            .args(&[
                "-Command",
                "Start-Process",
                "-FilePath",
                theme_path,
                "-WindowStyle",
                "Hidden",
            ])
            .status()
            .map_err(|e| format!("执行 PowerShell 命令失败: {}", e))?;

        if status.success() {
            info!("op=apply_theme | method=powershell | result=ok");
            Ok(())
        } else {
            warn!("op=apply_theme | method=powershell | result=fail | action=fallback_to_cmd");
            Self::apply_theme_fallback(theme_path)
        }
    }

    fn apply_theme_fallback(theme_path: &str) -> Result<(), String> {
        warn!("op=apply_theme | method=cmd_fallback | path={}", theme_path);

        let status = Command::new("cmd")
            .args(&["/C", theme_path])
            .status()
            .map_err(|e| format!("执行基础命令失败: {}", e))?;

        if status.success() {
            warn!("op=apply_theme | method=cmd_fallback | result=ok | note=可能显示了窗口");
            Ok(())
        } else {
            error!("op=apply_theme | method=cmd_fallback | result=fail | reason=all_methods_failed");
            Err("所有应用主题的方法都失败了".to_string())
        }
    }

    pub fn apply_theme_via_registry(theme_path: &str) -> Result<(), String> {
        use winreg::enums::*;
        use winreg::RegKey;

        info!("op=apply_theme_via_registry | path={}", theme_path);

        if !Path::new(theme_path).exists() {
            warn!("op=apply_theme_via_registry | action=validate | result=fail | reason=not_found");
            return Err("主题文件不存在".to_string());
        }

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let themes_key = hkcu
            .open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Themes",
                KEY_WRITE,
            )
            .map_err(|e| format!("无法打开注册表键: {}", e))?;

        themes_key
            .set_value("CurrentTheme", &theme_path.to_string())
            .map_err(|e| format!("无法设置 CurrentTheme: {}", e))?;

        let theme_mru = format!("{};", theme_path);
        themes_key
            .set_value("ThemeMRU", &theme_mru)
            .map_err(|e| format!("无法设置 ThemeMRU: {}", e))?;

        info!("op=apply_theme_via_registry | keys=CurrentTheme,ThemeMRU | result=ok");
        Ok(())
    }
}
