import { getCurrentWebview, Webview as WebviewType } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { Window, Effect } from '@tauri-apps/api/window';
import { AppDataType } from "../Type";
import { listen } from "@tauri-apps/api/event";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";

export function waitForTauri(): Promise<void> {
  return new Promise(resolve => {
    const check = () => (window as any).__TAURI_INTERNALS__?.invoke
    if (check()) return resolve()
    const interval = setInterval(() => {
      if (check()) {
        clearInterval(interval)
        resolve()
      }
    }, 5)
  })
}

let appWindow: Window;
let Webview: WebviewType;

export async function initWindow() {
  if (appWindow && Webview) return
  await waitForTauri()
  try {
    appWindow = new Window('main');
    Webview = getCurrentWebview()
    window.appWindow = appWindow
    window.Webview = Webview

    appWindow.onCloseRequested(e => {
      e.preventDefault()
      setTimeout(() => {
        appWindow.hide()
        Webview.hide()
        saveWindowState(StateFlags.ALL)
      }, 22);
    })

    listen("show-app", async () => {
      console.log("显示程序");
      Webview.show()
    });
    listen("close-app", async () => {
      console.log("收到后端关闭指令，正在退出应用...");
      appWindow.hide()
      Webview.hide()
      saveWindowState(StateFlags.ALL)
      await appWindow.destroy();
    });
  } catch (e) {
    console.error('initWindow failed:', e)
  }
}

export const WindowBg = (AppData: AppDataType, themeDack: boolean) => {
  if (!appWindow) return
  if (AppData?.winBgEffect) {
    const types = AppData.winBgEffect === 'Acrylic' ? Effect.Acrylic : (themeDack ? Effect.Mica : Effect.Tabbed)
    appWindow.setEffects({ effects: [types] })
  }
}
export const MainWindow = (setMainShow: (e: boolean) => void, AppData: AppDataType) => {
  useEffect(() => {
    (async  () => {
      if (!appWindow) return
      if (AppData?.StartShow) {
        appWindow.show()
        setMainShow(true)
      } else {
        if (await appWindow.isVisible()) {
          Webview.show()
        }else{
          Webview.hide()
        }
      }
    })()

    const visibilitychange = () => {
      if (document.visibilityState === 'visible') {
        console.log('页面变得可见');
        setMainShow(true)
      } else {
        console.log('页面变得不可见');
        setMainShow(false)
      }
    }
    if (appWindow) {
      appWindow.onFocusChanged(async () => {
        if (await appWindow.isVisible()) {
          Webview.show()
        }
      });
    }
    document.addEventListener('visibilitychange', visibilitychange);

    return () => {
      document.removeEventListener('visibilitychange', visibilitychange);
    }
  }, [])
}
