# Windows AutoTheme API 文档

## 项目简介

Windows AutoTheme 是一个基于 Tauri 2.x 的 Windows 主题自动切换工具。支持根据 Windows 夜灯（蓝光减少）状态自动切换系统亮/暗主题，也支持定时切换和自定义主题文件切换。

---

## 一、Tauri 命令（Rust → JS）

所有命令通过 `invoke()` 调用，在 Rust 端使用 `#[tauri::command]` 宏声明，通过 `invoke_handler` 注册。

### 1.1 `set_system_theme`

设置 Windows 系统亮色/暗色主题。

- **参数**: `{ isLight: boolean }`
  - `isLight` — `true` 切亮色，`false` 切暗色
- **返回值**: `void`
- **原理**: 修改注册表 `HKCU\...\Themes\Personalize` 下的 `SystemUsesLightTheme` 和 `AppsUseLightTheme`（0=暗色, 1=亮色），然后发送 `WM_SETTINGCHANGE` 广播通知系统刷新

**前端调用示例**:

```ts
await invoke('set_system_theme', { isLight: true });  // 切亮色
await invoke('set_system_theme', { isLight: false }); // 切暗色
```

---

### 1.2 `get_night_light_state`

检测 Windows 夜灯（护眼模式/蓝光减少）是否开启。

- **参数**: 无
- **返回值**: `boolean`
  - `true` — 夜灯开启
  - `false` — 夜灯关闭
- **原理**: 读取 CloudStore 注册表 `HKCU\...\bluelightreductionstate\...` 的二进制数据，检查第 35 字节是否为 `1`

**前端调用示例**:

```ts
const isOn = await invoke<boolean>('get_night_light_state');
```

---

### 1.3 `update_tray_menu_item_title`

更新系统托盘右键菜单的文本和工具提示（用于语言切换时本地化）。

- **参数**: `{ quit: string, show: string, tooltip: string, switch: string }`
  - `quit` — 退出菜单项文本
  - `show` — 显示菜单项文本
  - `tooltip` — 托盘图标工具提示
  - `switch` — 切换主题菜单项文本
- **返回值**: `void`

**前端调用示例**:

```ts
await invoke('update_tray_menu_item_title', {
  quit: '退出',
  show: '显示',
  tooltip: 'AutoTheme',
  switch: '切换为亮色',
});
```

---

### 1.4 `get_windows_themes`

获取系统中所有可用的 Windows 主题。

- **参数**: 无
- **返回值**: `ThemeInfo[]`

`ThemeInfo` 结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 主题名称 |
| `path` | `string` | 主题文件路径（`.theme`） |
| `is_active` | `boolean` | 是否为当前激活主题 |
| `wallpaper` | `string?` | 壁纸路径 |
| `system_mode` | `string?` | 亮/暗模式（`Light` / `Dark`） |
| `app_mode` | `string?` | 应用模式（`Light` / `Dark`） |

**扫描路径**:
- 系统主题: `C:\Windows\Resources\Themes`
- 用户主题: `%LOCALAPPDATA%\Microsoft\Windows\Themes`

**前端调用示例**:

```ts
const themes = await invoke('get_windows_themes');
```

---

### 1.5 `apply_theme`

应用指定的 Windows 主题文件。

- **参数**: `{ themePath: string }`
  - `themePath` — `.theme` 文件的完整路径
- **返回值**: `Result<(), String>`
- **原理**: 依次尝试三种策略：
  1. `cmd /C start /b "" <path>` 后台运行
  2. PowerShell `Start-Process -WindowStyle Hidden` 静默运行
  3. `cmd /C <path>` 直接运行（回退）

**前端调用示例**:

```ts
await invoke('apply_theme', { themePath: 'C:\\...\\my.theme' });
```

---

## 二、Tauri 事件（Rust → JS Events）

Rust 后端通过 `app_handle.emit()` 发送事件，前端通过 `listen()` 接收。

### 2.1 `"switch"`

用户点击托盘菜单"切换主题"时触发。

- **发射时机**: 托盘右键菜单 "switch" 项被点击
- **数据**: 无（前端忽略 payload）
- **前端处理**: 翻转当前主题状态并调用 `set_system_theme`

```ts
import { listen } from '@tauri-apps/api/event';

await listen('switch', async () => {
  // 切换主题
});
```

### 2.2 `"show-app"`

需要显示主窗口时触发。

- **发射时机**:
  - 托盘图标左键双击
  - 托盘右键菜单 "show" 项被点击
  - 新实例启动（单实例插件）
- **数据**: 无（前端忽略 payload）
- **前端处理**: 调用 `Webview.show()` 显示窗口

```ts
await listen('show-app', async () => {
  Webview.show();
});
```

### 2.3 `"close-app"`

用户点击"退出"时触发。

- **发射时机**: 托盘右键菜单 "quit" 项被点击
- **数据**: 无（前端忽略 payload）
- **前端处理**: 隐藏窗口 → 保存窗口状态 → 销毁窗口

```ts
await listen('close-app', async () => {
  appWindow.hide();
  Webview.hide();
  saveWindowState(StateFlags.ALL);
  await appWindow.destroy();
});
```

### 事件流全景

```
Rust 后端 (emit)                   前端 (listen)
─────────────────────────────────────────────────
托盘 "switch" 菜单  ────"switch"────▶  App.tsx
托盘 "show" 菜单     ──"show-app"───▶  WindowCode.ts
托盘双击             ──"show-app"───▶  WindowCode.ts
单实例激活           ──"show-app"───▶  WindowCode.ts
托盘 "quit" 菜单    ──"close-app"───▶  WindowCode.ts
```

---

## 三、前端类型定义

### 3.1 `AppDataType`（`src/Type.ts`）

应用配置数据结构，通过 Zustand 持久化到 localStorage。

```ts
interface AppDataType {
  open: boolean;                    // 功能总开关
  mode: 'system' | 'manual';       // 模式: 跟随系统 / 手动定时
  times: string[];                  // 定时切换时间 ["HH:mm", "HH:mm"]
  Autostart: boolean;               // 开机自启
  language?: string;                // 语言 (默认 'zh_CN')
  StartShow: boolean;               // 启动时显示窗口
  Skipversion: string;              // 跳过的更新版本号
  winBgEffect: string;              // 窗口背景效果 (Default/Acrylic/Mica)
  StyemTheme?: string[];            // 主题文件路径 [lightTheme, darkTheme]
  StyemThemeEnable?: boolean;       // 是否启用自定义主题切换
}
```

### 3.2 `Theme`（`src/mod/utils/path.ts`）

```ts
interface Theme {
  name: string;                     // 主题名称
  path: string;                     // .theme 文件路径
  is_active: boolean;               // 是否当前激活主题
  wallpaper?: string;               // 壁纸路径
  system_mode?: string;             // 系统模式 (Light/Dark)
  app_mode?: string;                // 应用模式 (Light/Dark)
  displayPath?: string;             // 规范化的显示路径
  displayWallpaper?: string;        // 规范化的壁纸路径
}
```

### 3.3 `CrontabTask`（`src/mod/Crontab.ts`）

```ts
interface CrontabTask {
  time: string;                                    // "HH:mm"
  data: any;                                       // 任务数据
  onExecute: (time: string, data: any) => void;    // 执行回调
}
```

### 3.4 `UpdateType`（`src/mod/update.ts`）

```ts
interface UpdateType {
  releaseNotes: string;
  latestVersion: string;
  releaseUrl: string;
}
```

---

## 四、数据存储（Zustand）

### `useAppData`（`src/mod/DataSave.ts`）

使用 Zustand + `persist` 中间件，数据持久化到 localStorage `key="AppData"`。

```ts
const { AppData, setData } = useAppData();

// 更新部分字段
setData({ open: true, mode: 'system' });
```

**默认值**:

| 字段 | 默认值 |
|------|--------|
| `open` | `false` |
| `mode` | `'system'` |
| `times` | `["6:00", "18:00"]` |
| `Autostart` | `false` |
| `StartShow` | `true` |
| `winBgEffect` | `'Default'` |
| `StyemTheme` | `[]` |
| `StyemThemeEnable` | `false` |

---

## 五、定时任务系统

### `CrontabManager`（`src/mod/Crontab.ts`）

基于 `setTimeout` / `setInterval` 的定时任务管理器。

| 方法 | 说明 |
|------|------|
| `addTask(task)` | 添加定时任务，到时间执行回调 |
| `removeTask(taskId)` | 移除定时任务 |

```ts
const manager = new CrontabManager();
manager.addTask({
  time: '18:00',
  data: { isLight: false },
  onExecute: (time, data) => {
    invoke('set_system_theme', { isLight: false });
  },
});
```

---

## 六、工具函数

### 6.1 路径工具（`src/mod/utils/path.ts`）

| 函数 | 说明 |
|------|------|
| `normalizeThemePaths(theme)` | 规范化 Windows 路径格式 |
| `getWindowsPath()` | 获取 Windows 目录路径 |

### 6.2 文件工具（`src/mod/utils/tauri-file.ts`）

| 函数 | 说明 |
|------|------|
| `readTextFile(path)` | 读取文本文件内容 |
| `writeTextFile(path, content)` | 写入文本文件内容 |

### 6.3 主题应用（`src/mod/applyTheme.ts`）

| 函数 | 说明 |
|------|------|
| `applyTheme()` | 应用用户配置的自定义主题（含 1 秒去抖） |

### 6.4 更新检测（`src/mod/update.ts`）

| 函数 | 说明 |
|------|------|
| `checkForUpdates()` | 检查是否有新版本可用 |
| `UpdateType` | 更新信息类型定义 |

---

## 七、语言 / 国际化

### `src/language/index.tsx`

基于 React Context 的语言切换系统。

- 支持语言: `zh_CN`（简体中文）
- 语言文件: `src/language/zh-CN.json`

```tsx
import { useLanguage, LanguageProvider } from '../language';

const { locale, setLanguage } = useLanguage();
// locale 包含所有本地化文本
```
