import { enable, disable } from "@tauri-apps/plugin-autostart"
import { TimePicker, Segmented, Space, Button } from "antd"
import dayjs from "dayjs"
import { TimesProps } from "../Type"
import type { MessageInstance } from "antd/es/message/interface"

import { useEffect, useState } from "react"
import { PictureOutlined } from "@ant-design/icons"
import { invoke } from "@tauri-apps/api/core"
import { getIsWin11 } from "./ThemeConfig"
import { logger } from "./utils/logger"
import ThemeSelector from "../com/ThemeSelector"
import DataSave from "./DataSave"
export interface mainsType {
    key: string;
    label: any;
    defaultvalue?: boolean | undefined;
    change: any;
    default?: string;
    setVal?: any;
    hide?: boolean;
    value?: string | boolean | undefined;
    loading?: boolean;

}
export type MainopType = (e: {
    messageApi: MessageInstance;
    locale: any;
    themeDack: boolean
    tauriReady: boolean
}) => {
    mains: mainsType[]
}

const format = 'HH:mm';
const { RangePicker } = TimePicker;
const Mainoption: MainopType = ({
    messageApi,
    locale,
    themeDack,
    tauriReady
}) => {
    const { setData, AppData } = DataSave()
    const [startOpenLoad, setStartOpenLoad] = useState(false)
    const [openThemeSelector, setOpenThemeSelector] = useState(false)
    const [win11, setWin11] = useState(false);
    useEffect(() => {
        getIsWin11().then((v) => {
            logger.debug("Mainoption", `Win11 检测结果: ${v}`);
            setWin11(v);
        });
    }, []);
    const upTary = (e: string) => { //更新托盘数据
        logger.info("Mainoption", `更新托盘菜单: tooltip=${e}`);
        invoke('update_tray_menu_item_title', {
            quit: locale?.quit,
            show: locale?.show,
            tooltip: e,
            switch: `${locale?.switch}${themeDack ? locale.light : locale.dark}`
        })
    }
    useEffect(() => {
        if (!tauriReady) return
        if (locale?.quit) {
            const tooltip = `${locale?.Title} - App \n${locale.Time}: ${AppData?.times?.[0]} - ${AppData?.times?.[1]}`
            logger.debug("Mainoption", `触发托盘更新: times=[${AppData?.times}]`);
            upTary(tooltip)
        }
    }, [locale, AppData?.times, themeDack, tauriReady])
    const AutostartOpen = async (e: boolean) => {
        setStartOpenLoad(true)
        logger.info("Autostart", `设置开机自启: ${e}`);
        try {
            if (e) {
                await enable();
                logger.info("Autostart", "开机自启已启用");
            } else {
                disable();
                logger.info("Autostart", "开机自启已禁用");
            }
            setData({ Autostart: e })
        } catch (error) {
            logger.error("Autostart", "设置失败:", error);
            messageApi.error(error as string)
        }
        setStartOpenLoad(false)
    }
    const handleTimeChange = (_e: any, dateStrings: [string, string]) => {  //更改时间
        logger.info("Mainoption", `时间段变更: [${dateStrings[0]} - ${dateStrings[1]}]`);
        setData({ times: dateStrings })
    }
    const startTime = dayjs(AppData?.times?.[0] || '08:08', 'HH:mm')
    const endTime = dayjs(AppData?.times?.[1] || '18:08', 'HH:mm')
    const Times: React.FC<TimesProps> = () => ( //渲染时间选择器
        <RangePicker
            variant="filled"
            style={{ width: 200 }}
            value={[startTime, endTime]}
            format={format}
            onChange={handleTimeChange} />
    );

    const mains: mainsType[] = [ //  全部选项数据
        {
            key: 'open',
            label: locale?.main?.open,
            defaultvalue: AppData?.open,
            value: AppData?.open,
            change: (e: boolean) => {
                logger.info("Mainoption", `总开关: ${e}`);
                setData({ open: e })
            }
        },
        {
            key: 'mode',
            label: locale?.main?.mode,
            change: <Segmented
                shape="round"
                value={AppData?.mode || 'system'}
                onChange={e => {
                    logger.info("Mainoption", `切换模式: ${e}`);
                    setData({ mode: e as 'system' | 'manual' });
                }}
                options={[
                    { value: 'system', label: locale?.main?.modeSystem },
                    { value: 'manual', label: locale?.main?.modeManual },
                ]}
            />
        },
        {
            key: 'dark',
            label: locale?.main?.TabsOptionB,
            hide: AppData?.mode === 'system',
            change: <Times />
        },
        {
            key: "wallpaper",
            label: locale?.main?.customWallpaper || '自定义壁纸',
            change: <Space>
                <ThemeSelector
                    locale={locale}
                    isModalOpen={openThemeSelector}
                    setIsModalOpen={setOpenThemeSelector}
                />
                <Button icon={<PictureOutlined />} onClick={() => {
                    logger.info("Wallpaper", "打开壁纸设置");
                    setOpenThemeSelector(true);
                }}>
                    {AppData?.CustomWallpaperEnable ? '已开启' : '已关闭'}
                </Button>
            </Space>
        },
        {
            key: "winBgEffect",
            label: locale?.main?.winBgEffect,
            change: <Segmented
                shape="round"
                value={AppData?.winBgEffect}
                onChange={e => {
                    logger.info("Mainoption", `切换窗口背景: ${e}`);
                    setData({ winBgEffect: e });
                }}
                options={[
                    { value: 'Default', label: locale?.main?.Default },
                    { value: 'Mica', label: locale?.main?.Mica, disabled: !win11 },
                    { value: 'Acrylic', label: locale?.main?.Acrylic, disabled: !win11 },
                ]}
            />
        },
        {
            key: 'Autostart',
            label: locale?.main?.Autostart,
            value: AppData?.Autostart,
            loading: startOpenLoad,
            change: AutostartOpen,
        },
        {
            key: "StartShow",
            label: locale?.main?.StartShow,
            defaultvalue: AppData?.StartShow,
            change: ((e: boolean) => {
                logger.info("Mainoption", `启动时显示窗口: ${e}`);
                setData({ StartShow: e });
            })
        }
    ];
    return { mains }
}

export default Mainoption
