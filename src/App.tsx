import { useEffect, useState } from "react";
import TitleBar from "./TitleBar";
import dayjs from 'dayjs';
import "./App.css";
import { ConfigProvider, Flex, Layout, message, Spin } from "antd";
import { useUpdateEffect } from "ahooks";
import LanguageApp from './language/index'
import Docs from './doc'
import { LoadingOutlined } from "@ant-design/icons";
import { ThemeFun } from './mod/ThemeConfig'
import Mainoption from "./mod/Mainoption";
import DataSave from './mod/DataSave'
import OpContent from './Content'
import { CrontabTask, CrontabManager } from './mod/Crontab'
import { invoke } from "@tauri-apps/api/core";
import { AppDataType } from "./Type";
import { isEnabled } from "@tauri-apps/plugin-autostart";
import { WindowBg, initWindow, waitForTauri } from "./mod/WindowCode";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { Updates } from "./updates";
import { applyTheme } from "./mod/applyTheme";
import { logger } from "./mod/utils/logger";

declare const __APP_VERSION__: string;
const version = __APP_VERSION__;
try { window.Webview?.show() } catch {};

const { Content } = Layout;
function App() {
  const { setData, AppData } = DataSave()
  const matchMedia = window.matchMedia('(prefers-color-scheme: light)');
  const [themeDack, setThemeDack] = useState(!matchMedia.matches);
  const [spinning, setSpinning] = useState(true)
  const [tauriReady, setTauriReady] = useState(false)
  const [messageApi, contextHolder] = message.useMessage();
  const { locale } = LanguageApp({ AppData, setData })

  useEffect(() => {
    waitForTauri().then(() => {
      setTauriReady(true)
      setSpinning(false)
      initWindow()
      setTimeout(async () => {
        if (!window.appWindow) return
        const isVisible = await window.appWindow.isVisible()
        if (isVisible) {
          window.Webview?.show()
        } else {
          window.Webview?.hide()
        }
      }, 3000);
    })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setSpinning(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  //导入设置选项
  const { mains } = Mainoption({
    messageApi,
    locale,
    themeDack,
    tauriReady
  })
  useEffect(() => {
    if (!tauriReady) return
    let isMounted = true;
    const setupListener = async () => {
      try {
        const unlisten = await listen("switch", async () => {
        if (!isMounted) return;
        logger.debug("App", "switch dark", !themeDack);
        if (spinning) return;
        const isVisible = await window.appWindow.isVisible()
        setSpinning(true);
        setData({ open: false });
        setTimeout(async () => {
          await invoke('set_system_theme', { isLight: themeDack });
        }, 10);
        if (!isVisible) {
          window.Webview?.show()
          setTimeout(() => {
            window.appWindow.isVisible().then(async (_isVisible) => {
              logger.debug("App", "isVisible", _isVisible);
              if (!_isVisible) {
                window.Webview?.hide()
              }
            })
          }, 600);
        }
      });

      return () => {
        isMounted = false;
        if (unlisten) {
          try {
            unlisten();
          } catch (cleanupError) {
            logger.warn("App", 'Error while cleaning up listener:', cleanupError);
          }
        }
      };
    } catch (e) {
      logger.warn("App", 'Failed to setup listener:', e);
      return () => {};
    }
  };
    const cleanupPromise = setupListener();

    return () => {
      cleanupPromise.then(cleanup => cleanup(), () => {});
    };
  }, [themeDack, spinning, tauriReady]);

  useUpdateEffect(() => {
    if (!tauriReady) return
    if (AppData?.open && AppData?.mode === 'manual') {
      StartRady()
    }
  }, [AppData?.times, AppData?.open, AppData?.mode, AppData?.StyemThemeEnable, tauriReady])
  //设置窗口材料
  useEffect(() => {
    if (!tauriReady) return
    WindowBg(AppData as AppDataType, themeDack)
  }, [AppData?.winBgEffect, themeDack, tauriReady])
  useEffect(() => { //初始化 -主题自适应
    if (!tauriReady) return
    const handleChange = function (this: any) {
      logger.info("App", `系统颜色方案变更: prefers-color-scheme=${this.matches ? 'light' : 'dark'}`);
      setThemeDack(!this.matches);
      setSpinning(false)
    };
    matchMedia.addEventListener('change', handleChange);
    if (AppData?.open && AppData?.mode === 'manual') {
      logger.info("App", "初始化时触发 StartRady");
      StartRady()
    }
    const isAutostart = async () => {
      const enabled = await isEnabled();
      logger.info("App", `开机自启状态: ${enabled}`);
      setData({ Autostart: enabled })
    }
    isAutostart()
    setTimeout(() => {
      setSpinning(false)
    }, 100);
    return () => {
      matchMedia.removeEventListener('change', handleChange);
    };
  }, [tauriReady]);

  useEffect(() => {
    logger.info("跟随系统", `mode=${AppData?.mode}, open=${AppData?.open}, tauriReady=${tauriReady}`);
    if (!tauriReady || AppData?.mode !== 'system' || !AppData?.open) {
      logger.info("跟随系统", '条件不满足，跳过事件监听');
      return;
    }
    logger.info("跟随系统", '启动事件监听');
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const init = async () => {
      try {
        const nightLightOn = await invoke<boolean>('get_night_light_state');
        if (!cancelled) {
          logger.info("跟随系统", `初始夜灯状态: ${nightLightOn}`);
          setThemeDack(nightLightOn);
          await invoke('set_system_theme', { isLight: !nightLightOn });
        }
      } catch (e) {
        logger.warn("跟随系统", `获取初始夜灯状态失败: ${e}`);
      }

      if (!cancelled) {
        const unlisten = await listen<boolean>('night-light-changed', async (event) => {
          const shouldBeDark = event.payload;
          logger.info("跟随系统", `夜灯状态变更: nightLightOn=${shouldBeDark}`);
          setThemeDack(shouldBeDark);
          try {
            await invoke('set_system_theme', { isLight: !shouldBeDark });
          } catch (e) {
            logger.error("跟随系统", `切换主题失败: ${e}`);
          }
        });
        cleanup = unlisten;
      }
    };
    init();

    return () => {
      logger.info("跟随系统", '清理事件监听');
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [tauriReady, AppData?.mode, AppData?.open]);
  const StartRady = async () => {
    const presentTime = dayjs();
    const startTime = dayjs(AppData?.times?.[0], 'HH:mm');
    const endTime = dayjs(AppData?.times?.[1], 'HH:mm');
    let isLight = false;
    if (presentTime.isAfter(startTime) && presentTime.isBefore(endTime)) {
      isLight = true;
    }
    logger.info("StartRady", `当前=${presentTime.format('HH:mm')}, 时段=[${AppData?.times?.[0]}-${AppData?.times?.[1]}], isLight=${isLight}, themeDack=${themeDack}`);
    if (themeDack === isLight) {
      setSpinning(true);
      try {
        if (AppData.StyemThemeEnable) {
          logger.info("StartRady", "StyemThemeEnable=true, 内部切换主题");
          setThemeDack(!isLight)
          return
        }
        logger.info("StartRady", `调用 set_system_theme, isLight=${isLight}`);
        await invoke('set_system_theme', { isLight });
      } finally {
        setSpinning(false);
      }
    } else {
      logger.debug("StartRady", `主题无需变更 (themeDack=${themeDack} !== isLight=${isLight})`);
    }
  };


  useEffect(() => { //定时任务处理
    if (AppData?.open === false || AppData?.mode !== 'manual') {
      CrontabManager.clearAllTasks()
      return
    }
    if (AppData?.times?.[0] && AppData?.times?.[1]) {
      const onTaskExecute = async (time: string, data: { msg: string }) => {
        logger.info("Crontab", `执行任务: ${time}, 数据:`, data);
        switch (data.msg) {
          case 'TypeA':
            logger.info("Crontab", `执行任务: ${time}, 数据:`, data.msg);
            if (AppData.StyemThemeEnable) {
              setThemeDack(false)
              return
            }
            await invoke('set_system_theme', { isLight: true });
            break;
          case 'TypeB':
            logger.info("Crontab", `执行任务: ${time}, 数据:`, data.msg);
            if (AppData.StyemThemeEnable) {
              setThemeDack(true)
              return
            }
            await invoke('set_system_theme', { isLight: false });
            break;
        }
        logger.debug("Crontab", CrontabManager.listTasks());
      };
      try {
        // 添加定时任务
        const task1: CrontabTask = { time: AppData?.times[0], data: { msg: 'TypeA' }, onExecute: onTaskExecute };
        const task2: CrontabTask = { time: AppData?.times[1], data: { msg: 'TypeB' }, onExecute: onTaskExecute };
        CrontabManager.addTask(task1);
        CrontabManager.addTask(task2);
        logger.info("Crontab", 'Tasks added successfully', CrontabManager.listTasks());
      } catch (error) {
        logger.error("Crontab", 'Failed to add tasks:', error);
      }
    }
    return () => {
      CrontabManager.clearAllTasks()
    };
  }, [AppData?.times, AppData?.open, AppData?.mode, AppData.StyemThemeEnable])

  useUpdateEffect(() => {
    logger.debug("App", AppData?.open, AppData.StyemThemeEnable);

    if (!AppData?.open || !AppData.StyemThemeEnable) return

    if (AppData.StyemTheme) {
      applyTheme(AppData.StyemTheme[themeDack ? 1 : 0])
    }
  }, [themeDack, AppData?.open, AppData.StyemTheme, AppData.StyemThemeEnable])
  const { Themeconfig, antdToken } = ThemeFun(themeDack, AppData?.winBgEffect)
  const animationVariants = (index: number) => ({
    initial: {
      opacity: 0,
      x: 0,
      scale: 3,
      filter: "blur(5px)"
    },
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      filter: "blur(0px)",
    },
    exit: {
      opacity: 0,
      x: 100,
      filter: "blur(5px)",
      transition: {
        duration: 0.36,
        delay: index * 0.36 // 第一个组件index为0，第二个为1，第三个为2，这样第二个组件会延迟0.36秒，第三个延迟0.72秒
      }
    },
    transition: {
      duration: 0.26,
      delay: mains.length * 0.08
    },
  });

  // 统一的过渡配置
  const transitionConfig = {
    duration: 0.26,
    delay: mains.length * 0.08
  };
  return (
    <ConfigProvider
      theme={Themeconfig}
    >

      < Spin spinning={spinning} indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />} >
        {contextHolder}
        <TitleBar
          spinning={spinning}
          locale={locale}
          setSpinning={setSpinning}
          config={antdToken}
          Themeconfig={Themeconfig}
          themeDack={themeDack}
        />
        <Layout>
          <Content className="container">
            <Flex gap={0} vertical >
              <AnimatePresence >
                <OpContent mains={mains} language={AppData?.language || 'en'} />
                <motion.div
                  key={`docs-${AppData?.language}`}
                  variants={animationVariants(1)}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={animationVariants(1).transition}
                  layout
                >
                  <Docs locale={locale} version={version} />
                </motion.div>
                <motion.div
                  key={`update-${AppData?.language}`}
                  variants={animationVariants(1)}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={transitionConfig}
                  layout
                >
                  <Updates version={version} locale={locale} setData={setData} AppData={AppData} />

                </motion.div>
              </AnimatePresence>
            </Flex>
            
          </Content>
        </Layout>
      </Spin>


    </ConfigProvider >
  );
}

export default App;
