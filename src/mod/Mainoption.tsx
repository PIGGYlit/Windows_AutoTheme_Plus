import { enable, disable } from "@tauri-apps/plugin-autostart"
import { TimePicker, Button, Segmented, Tooltip, Space } from "antd"
import dayjs from "dayjs"
import { TimesProps } from "../Type"
import type { MessageInstance } from "antd/es/message/interface"

import { useEffect, useState } from "react"
import { QuestionOutlined } from "@ant-design/icons"
import { invoke } from "@tauri-apps/api/core"
import { getIsWin11 } from "./ThemeConfig"
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
    useEffect(() => { getIsWin11().then(setWin11); }, []);
    const upTary = (e: string) => { //更新托盘数据
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
            upTary(tooltip)
        }
    }, [locale, AppData?.times, themeDack, tauriReady])
    const AutostartOpen = async (e: boolean) => {
        setStartOpenLoad(true)
        try {
            if (e) {
                await enable();
            } else {
                disable();
            }
            setData({ Autostart: e })
        } catch (error) {
            messageApi.error(error as string)
        }
        setStartOpenLoad(false)
    }
    const handleTimeChange = (_e: any, dateStrings: [string, string]) => {  //更改时间
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
            change: (e: boolean) => {
                setData({ open: e })
            }
        },
        {
            key: 'mode',
            label: locale?.main?.mode,
            change: <Segmented
                shape="round"
                value={AppData?.mode || 'system'}
                onChange={e => setData({ mode: e as 'system' | 'manual' })}
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
            key: "switchStyemMode",
            label: locale?.main?.switchStyemMode,
            change: <Space>
                <Tooltip
                    title={locale?.main?.switchStyemModeTip}
                >
                    <Button
                        icon={<QuestionOutlined />}
                        type="text"
                    />
                </Tooltip>
                <ThemeSelector
                    locale={locale}
                    isModalOpen={openThemeSelector}
                    setIsModalOpen={setOpenThemeSelector}
                />
                <Button onClick={() => setOpenThemeSelector(true)}>设置</Button>
            </Space>
        },
        {
            key: "winBgEffect",
            label: locale?.main?.winBgEffect,
            change: <Segmented
                shape="round"
                value={AppData?.winBgEffect}
                onChange={e => setData({ winBgEffect: e })
                }
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
            change: ((e: boolean) => setData({ StartShow: e }))
        }
    ];
    return { mains }
}

export default Mainoption
