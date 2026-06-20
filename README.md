# Windows AutoTheme

<div align="center">
  <img src="https://github.com/user-attachments/assets/c3cdbcf6-6bdc-4e91-a84a-55ef109c60f5" alt="Screenshot 1" width="100%">

  #### Language: [中文](/README.md)
</div>

## 概述

**Windows AutoTheme** 是一个轻量级的 Windows 主题自动切换工具。支持根据 Windows **夜灯（护眼模式）** 状态自动切换系统亮/暗主题，也支持按固定时间定时切换。

后端使用 Rust 执行系统操作，前端采用 TypeScript + Ant Design 5 构建界面。

<div align="center">
  <img src="https://github.com/user-attachments/assets/8ed6411d-cc19-4884-a2b6-8d0d65f64078" alt="Screenshot 2" width="55%">
</div>

---

## 功能特点

- **跟随系统**：检测 Windows 夜灯（护眼模式）状态，夜灯开启时自动切深色主题，关闭时切回浅色
- **定时切换**：支持手动设置时间段，到点自动切换亮/暗主题
- **自定义主题**：支持绑定 `.theme` 主题文件，切换时自动应用指定主题
- **高效轻量**：Rust 后端 + WebView2 前端，内存占用低
- **托盘驻留**：最小化到系统托盘，后台运行不干扰

---

## 工作模式

### 模式一：跟随系统（推荐）

检测 Windows 夜灯（蓝光减少/护眼模式）的开关状态：

- 夜灯 **开启** → 自动切换为 **深色主题**
- 夜灯 **关闭** → 自动切换为 **浅色主题**

轮询间隔 3 秒，状态无变化时不会重复操作。

> 该方式利用 Windows 原生的夜灯计划功能，无需额外配置日出日落 API。

### 模式二：手动定时

设置两个时间点：

- `HH:mm` 到 `HH:mm` 之间 → **浅色主题**
- 其余时间 → **深色主题**

---

## 截图

<div align="center">
  <img src="https://github.com/user-attachments/assets/5f0c5730-a398-482c-8e6c-e49067d2fe24" alt="pshotA.png" width="45%" style="margin-right: 5%;">
</div>

---

## 安装方式

### 传统安装

打开 [发行页面](https://github.com/PIGGYlit/Windows_AutoTheme/releases)，下载最新版本的安装包。

---

## 开发调试

```bash
# 安装依赖
npm install

# 启动开发模式
npm run tauri dev

# 生产构建
npm run tauri build
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Tauri 2.x](https://v2.tauri.app/) |
| 后端 | Rust |
| 前端 | TypeScript + React |
| UI | Ant Design 5 |
| 状态管理 | Zustand |
| 窗口背景 | Mica / Acrylic |

---

## 联系作者

- Email: [2018394026@qq.com](mailto:2018394026@qq.com)
