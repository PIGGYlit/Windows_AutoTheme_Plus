use log::{debug, warn};
use configparser::ini::Ini;
use dirs;
use encoding_rs;
use serde::Serialize;
use shellexpand;
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::*;
use winreg::RegKey;

/// 主题信息结构体
#[derive(Debug, Serialize, Clone)]
pub struct ThemeInfo {
    pub name: String,
    pub path: String,
    pub is_active: bool,
    pub wallpaper: Option<String>,
    pub system_mode: Option<String>, // 新增：系统模式
    pub app_mode: Option<String>,    // 新增：应用模式
}

/// 获取所有主题（系统 + 用户），壁纸路径转换为绝对路径
pub fn get_all_themes() -> Vec<ThemeInfo> {
    debug!("op=get_all_themes | status=start");
    let mut themes = vec![];

    themes.extend(get_system_themes());
    debug!("op=get_all_themes | source=system | count={}", themes.len());
    themes.extend(get_user_themes());
    debug!("op=get_all_themes | source=user+system | total={}", themes.len());

    let current = get_current_theme().unwrap_or(None);
    debug!("op=get_all_themes | active={:?}", current);

    // 标记激活主题
    for theme in &mut themes {
        if let Some(ref curr_path) = current {
            if theme.path.eq_ignore_ascii_case(curr_path) {
                theme.is_active = true;
            }
        }
        
        // 转换壁纸路径为绝对路径
        if let Some(ref wallpaper) = theme.wallpaper {
            let absolute_path = convert_to_absolute_path(wallpaper);
            theme.wallpaper = Some(absolute_path);
        }
        
        // 解析主题文件的模式信息（新增）
        let theme_path = Path::new(&theme.path);
        let (system_mode, app_mode) = read_theme_modes(theme_path);
        theme.system_mode = system_mode;
        theme.app_mode = app_mode;
    }

    debug!("op=get_all_themes | status=end | total={}", themes.len());
    themes
}

/// 新增：读取主题文件的模式信息
fn read_theme_modes(theme_path: &Path) -> (Option<String>, Option<String>) {
    let path_display = theme_path.display();
    let content = if theme_path.to_string_lossy().contains("Users") {
        read_user_theme_with_correct_encoding(theme_path)
    } else {
        read_file_with_fallback_encoding(theme_path)
    };
    
    if content.is_empty() {
        debug!("op=read_theme_modes | path={} | result=empty", path_display);
        return (None, None);
    }
    
    if let Ok((sys_mode, app_mode_val)) = parse_modes_with_configparser(&content) {
        if sys_mode.is_some() || app_mode_val.is_some() {
            debug!("op=read_theme_modes | method=configparser | sys={:?} | app={:?}", sys_mode, app_mode_val);
            return (sys_mode, app_mode_val);
        }
    }
    
    let (sys_mode, app_mode_val) = parse_modes_manually(&content);
    if sys_mode.is_none() && app_mode_val.is_none() {
        debug!("op=read_theme_modes | method=manual | result=none | path={}", path_display);
    }
    (sys_mode, app_mode_val)
}

/// 新增：使用 configparser 解析模式信息 - 修复版本
fn parse_modes_with_configparser(content: &str) -> Result<(Option<String>, Option<String>), Box<dyn std::error::Error>> {
    let mut config = Ini::new();
    config.set_default_section("");
    if let Err(e) = config.read(content.to_string()) {
        debug!("op=parse_modes | method=configparser | result=fail | err={}", e);
        return Err(e.into());
    }
    
    let mut system_mode = None;
    let mut app_mode = None;
    
    // 正确使用 configparser 的 get 方法，需要 section 和 key 两个参数
    if let Some(mode) = config.get("VisualStyles", "SystemMode") {
        system_mode = Some(mode);
    }
    
    if let Some(mode) = config.get("VisualStyles", "AppMode") {
        app_mode = Some(mode);
    }
    
    Ok((system_mode, app_mode))
}

/// 新增：手动解析模式信息
fn parse_modes_manually(content: &str) -> (Option<String>, Option<String>) {
    let mut system_mode = None;
    let mut app_mode = None;
    let mut in_visual_styles = false;
    
    for line in content.lines() {
        let line = line.trim();
        
        // 检查节头
        if line.starts_with('[') && line.ends_with(']') {
            let section = &line[1..line.len()-1].trim();
            in_visual_styles = section.eq_ignore_ascii_case("VisualStyles");
            continue;
        }
        
        // 如果在 VisualStyles 节中，查找 SystemMode 和 AppMode
        if in_visual_styles {
            if line.to_lowercase().starts_with("systemmode") {
                if let Some(equal_pos) = line.find('=') {
                    let mode = line[equal_pos+1..].trim().to_string();
                    if !mode.is_empty() {
                        system_mode = Some(mode);
                    }
                }
            } else if line.to_lowercase().starts_with("appmode") {
                if let Some(equal_pos) = line.find('=') {
                    let mode = line[equal_pos+1..].trim().to_string();
                    if !mode.is_empty() {
                        app_mode = Some(mode);
                    }
                }
            }
        }
        
        // 如果两个都找到了，提前退出
        if system_mode.is_some() && app_mode.is_some() {
            break;
        }
    }
    
    (system_mode, app_mode)
}

// 以下是你原有的所有函数，保持不变

/// 将包含环境变量的路径转换为绝对路径
fn convert_to_absolute_path(path: &str) -> String {
    // 先展开环境变量
    let expanded = expand_env_vars_complete(path);
    
    // 尝试将路径转换为绝对路径
    let path_buf = PathBuf::from(&expanded);
    
    if path_buf.is_absolute() {
        // 如果已经是绝对路径，尝试规范化
        if let Ok(canonical) = std::fs::canonicalize(&path_buf) {
            canonical.to_string_lossy().to_string()
        } else {
            // 如果规范化失败，返回原始绝对路径
            expanded
        }
    } else {
        // 如果是相对路径，尝试基于当前工作目录转换为绝对路径
        if let Ok(cwd) = std::env::current_dir() {
            let absolute = cwd.join(&path_buf);
            if let Ok(canonical) = std::fs::canonicalize(&absolute) {
                canonical.to_string_lossy().to_string()
            } else {
                absolute.to_string_lossy().to_string()
            }
        } else {
            // 如果无法获取当前目录，返回展开后的路径
            expanded
        }
    }
}

/// 完全展开环境变量
fn expand_env_vars_complete(s: &str) -> String {
    let mut result = s.to_string();
    
    // 首先尝试使用 shellexpand
    if let Ok(expanded) = shellexpand::full(&result) {
        result = expanded.to_string();
    }
    
    // 手动替换所有可能的环境变量，确保完全展开
    let env_vars = [
        ("%SystemRoot%", std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string())),
        ("%windir%", std::env::var("windir").unwrap_or_else(|_| r"C:\Windows".to_string())),
        ("%USERPROFILE%", std::env::var("USERPROFILE").unwrap_or_default()),
        ("%HOMEPATH%", std::env::var("HOMEPATH").unwrap_or_default()),
        ("%HOMEDRIVE%", std::env::var("HOMEDRIVE").unwrap_or_else(|_| "C:".to_string())),
        ("%ProgramFiles%", std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string())),
        ("%ProgramFiles(x86)%", std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".to_string())),
        ("%ProgramData%", std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string())),
        ("%APPDATA%", std::env::var("APPDATA").unwrap_or_default()),
        ("%LOCALAPPDATA%", std::env::var("LOCALAPPDATA").unwrap_or_default()),
        ("%PUBLIC%", std::env::var("PUBLIC").unwrap_or_else(|_| r"C:\Users\Public".to_string())),
        ("%TEMP%", std::env::var("TEMP").unwrap_or_default()),
        ("%TMP%", std::env::var("TMP").unwrap_or_default()),
    ];
    
    // 多次替换以确保嵌套的环境变量也被展开
    let mut changed;
    loop {
        changed = false;
        let mut new_result = result.clone();
        
        for (var, value) in &env_vars {
            if new_result.contains(var) {
                new_result = new_result.replace(var, value);
                changed = true;
            }
        }
        
        if !changed || new_result == result {
            break;
        }
        result = new_result;
    }
    
    result
}

/// 获取系统主题
pub fn get_system_themes() -> Vec<ThemeInfo> {
    let system_path = Path::new(r"C:\Windows\Resources\Themes");
    read_themes_from_dir(system_path)
}

/// 获取用户自定义主题
pub fn get_user_themes() -> Vec<ThemeInfo> {
    if let Some(user_path) = dirs::data_local_dir() {
        let theme_path = user_path.join("Microsoft").join("Windows").join("Themes");
        debug!("op=get_user_themes | dir={:?}", theme_path);
        read_themes_from_dir(&theme_path)
    } else {
        warn!("op=get_user_themes | result=fail | reason=no_localappdata");
        vec![]
    }
}

/// 从目录读取主题
fn read_themes_from_dir(dir: &Path) -> Vec<ThemeInfo> {
    debug!("op=read_themes_from_dir | dir={:?}", dir);
    let mut result = vec![];

    if let Ok(entries) = fs::read_dir(dir) {
        debug!("op=read_themes_from_dir | action=open_dir | result=ok");
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .map(|s| s.eq_ignore_ascii_case("theme"))
                    .unwrap_or(false)
            {
                let name = path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let wallpaper = read_wallpaper_from_theme(&path);
                result.push(ThemeInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_active: false,
                    wallpaper,
                    system_mode: None, // 初始化为 None，后面会填充
                    app_mode: None,    // 初始化为 None，后面会填充
                });
            }
        }
    } else {
        warn!("op=read_themes_from_dir | action=open_dir | result=fail | dir={:?}", dir);
    }

    debug!("op=read_themes_from_dir | count={} | dir={:?}", result.len(), dir);
    result
}

fn get_current_theme() -> Result<Option<String>, Box<dyn std::error::Error>> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let theme_key = match hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes") {
        Ok(key) => key,
        Err(e) => {
            warn!("op=get_current_theme | action=open_key | result=fail | err={}", e);
            return Err(e.into());
        }
    };
    let theme_mru: String = match theme_key.get_value("CurrentTheme") {
        Ok(val) => val,
        Err(e) => {
            warn!("op=get_current_theme | action=read_value | result=fail | key=CurrentTheme | err={}", e);
            return Err(e.into());
        }
    };
    let current_theme = theme_mru.split(';').next().map(|s| expand_env_vars(s));
    debug!("op=get_current_theme | theme={:?}", current_theme);
    Ok(current_theme)
}

/// 使用多种方法读取主题文件中的 Wallpaper
fn read_wallpaper_from_theme(theme_path: &Path) -> Option<String> {
    let path_display = theme_path.display();
    debug!("op=read_wallpaper | path={}", path_display);
    let is_user_theme = theme_path.to_string_lossy().contains("Users");
    
    let content = if is_user_theme {
        read_user_theme_with_correct_encoding(theme_path)
    } else {
        read_file_with_fallback_encoding(theme_path)
    };
    
    if content.is_empty() {
        debug!("op=read_wallpaper | result=empty | path={}", path_display);
        return None;
    }
    
    if theme_path.file_name().unwrap_or_default() == "aero.theme" {
        return parse_aero_theme_specially(&content);
    }
    
    if let Some(wallpaper) = parse_with_configparser(&content) {
        return Some(wallpaper);
    }
    
    if let Some(wallpaper) = parse_wallpaper_simple(&content) {
        return Some(wallpaper);
    }
    
    if let Some(wallpaper) = parse_wallpaper_enhanced(&content) {
        return Some(wallpaper);
    }
    
    warn!("op=read_wallpaper | result=fail | all_methods_exhausted | path={}", path_display);
    None
}

/// 尝试多种编码读取文件
fn read_file_with_fallback_encoding(theme_path: &Path) -> String {
    let path_display = theme_path.display();
    debug!("op=read_file | path={} | type=system", path_display);
    if let Ok(content) = fs::read_to_string(theme_path) {
        return content;
    }
    
    if let Some(content) = read_utf16_le_file(theme_path) {
        return content;
    }
    
    if let Ok(bytes) = fs::read(theme_path) {
        let (content, _, had_errors) = encoding_rs::UTF_16LE.decode(&bytes);
        if !had_errors {
            return content.into_owned();
        }
        
        let (content, _, had_errors) = encoding_rs::GBK.decode(&bytes);
        if !had_errors {
            return content.into_owned();
        }
        
        debug!("op=read_file | encoding=latin1_fallback | path={}", path_display);
        return bytes.iter().map(|&b| b as char).collect::<String>();
    }
    
    warn!("op=read_file | result=fail | cannot_read | path={}", path_display);
    String::new()
}

/// 专门处理用户主题文件的编码问题
fn read_user_theme_with_correct_encoding(theme_path: &Path) -> String {
    let path_display = theme_path.display();
    debug!("op=read_file | path={} | type=user", path_display);
    if let Ok(bytes) = fs::read(theme_path) {
        if let Some(content) = read_utf16_le_file(theme_path) {
            return content;
        }
        
        let (content, _, had_errors) = encoding_rs::GB18030.decode(&bytes);
        if !had_errors {
            return content.into_owned();
        }
        
        let (content, _, had_errors) = encoding_rs::GBK.decode(&bytes);
        if !had_errors {
            return content.into_owned();
        }
        
        if let Ok(content) = String::from_utf8(bytes.clone()) {
            return content;
        }
        
        debug!("op=read_file | encoding=windows1252_fallback | path={}", path_display);
        let (content, _, _) = encoding_rs::WINDOWS_1252.decode(&bytes);
        return content.into_owned();
    }
    
    warn!("op=read_file | result=fail | cannot_read | path={}", path_display);
    String::new()
}

/// 读取 UTF-16 LE 编码的文件
fn read_utf16_le_file(path: &Path) -> Option<String> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(_) => return None,
    };
    
    if bytes.len() < 2 {
        debug!("op=read_utf16le | result=too_short | len={}", bytes.len());
        return None;
    }
    
    let (start_index, is_utf16) = if bytes[0] == 0xFF && bytes[1] == 0xFE {
        (2, true)
    } else {
        (0, false)
    };
    
    if is_utf16 || bytes.len() % 2 == 0 {
        let u16_chars: Vec<u16> = bytes[start_index..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        
        String::from_utf16(&u16_chars).ok()
    } else {
        debug!("op=read_utf16le | result=not_utf16 | len={}", bytes.len());
        None
    }
}

/// 使用 configparser 解析壁纸 - 修复版本
fn parse_with_configparser(content: &str) -> Option<String> {
    let mut config = Ini::new();
    config.set_default_section("");
    
    if let Ok(_) = config.read(content.to_string()) {
        let section_names = [
            "Control Panel\\Desktop",
            "Control Panel\\\\Desktop",
            "Control Panel\\Desktop.A", 
            "Control Panel\\\\Desktop.A",
            "Desktop",
        ];
        
        for section_name in &section_names {
            if let Some(wallpaper) = config.get(section_name, "Wallpaper") {
                return Some(expand_env_vars(&wallpaper));
            }
        }
        
        // 尝试无节名称
        if let Some(wallpaper) = config.get("", "Wallpaper") {
            return Some(expand_env_vars(&wallpaper));
        }
    }
    
    None
}

/// 简化手动解析 - 直接查找 Wallpaper= 行
fn parse_wallpaper_simple(content: &str) -> Option<String> {
    for line in content.lines() {
        let line = line.trim();
        if line.to_lowercase().starts_with("wallpaper") {
            if let Some(equal_pos) = line.find('=') {
                let wallpaper_path = line[equal_pos+1..].trim();
                if !wallpaper_path.is_empty() {
                    return Some(expand_env_vars(wallpaper_path));
                }
            }
        }
    }
    None
}

/// 增强手动解析 - 处理更多情况
fn parse_wallpaper_enhanced(content: &str) -> Option<String> {
    let mut in_desktop_section = false;
    
    for line in content.lines() {
        let line = line.trim();
        
        // 检查节头
        if line.starts_with('[') && line.ends_with(']') {
            let section = &line[1..line.len()-1].trim();
            
            in_desktop_section = *section == "Control Panel\\Desktop" || 
                                *section == "Control Panel\\\\Desktop" ||
                                *section == "Control Panel\\Desktop.A" ||
                                *section == "Control Panel\\\\Desktop.A" ||
                                *section == "Desktop";
            continue;
        }
        
        // 如果在正确的节中，查找 Wallpaper 键
        if in_desktop_section && line.to_lowercase().starts_with("wallpaper") {
            if let Some(equal_pos) = line.find('=') {
                let wallpaper_path = line[equal_pos+1..].trim();
                if !wallpaper_path.is_empty() {
                    return Some(expand_env_vars(wallpaper_path));
                }
            }
        }
    }
    
    None
}

/// 特别处理 aero.theme 文件
fn parse_aero_theme_specially(content: &str) -> Option<String> {
    let mut section = String::new();
    
    for line in content.lines() {
        let line = line.trim();
        
        if line.starts_with('[') && line.ends_with(']') {
            section = line[1..line.len()-1].to_string();
        }
        
        // 在 Control Panel\Desktop 节中查找 Wallpaper
        if (section == "Control Panel\\Desktop" || section == "Control Panel\\\\Desktop") &&
           line.to_lowercase().starts_with("wallpaper") {
            if let Some(equal_pos) = line.find('=') {
                let wallpaper = line[equal_pos+1..].trim();
                if !wallpaper.is_empty() {
                    return Some(expand_env_vars(wallpaper));
                }
            }
        }
    }
    
    None
}

/// 展开环境变量（保持向后兼容）
fn expand_env_vars(s: &str) -> String {
    expand_env_vars_complete(s)
}