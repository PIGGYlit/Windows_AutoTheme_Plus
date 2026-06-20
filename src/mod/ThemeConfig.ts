import { ThemeConfig, theme } from "antd";
import { useEffect, useMemo, useState } from "react";
import { AppDataType } from "../Type";
import { platform, version } from '@tauri-apps/plugin-os';
import { logger } from "./utils/logger";

let _isWin11 = false;
const isWin11Promise = _isWindows11().then(v => { _isWin11 = v; }).catch(() => {});

export async function getIsWin11(): Promise<boolean> {
  await isWin11Promise;
  return _isWin11;
}

async function _isWindows11() {
    if ((await platform()).toLowerCase() !== 'windows') {
        return false;
    }

    const osVersion = await version();
    const parts = osVersion.split('.');
    logger.debug("ThemeConfig", parts, osVersion);
    if (parts.length >= 3 && parts[0] === '10' && parts[1] === '0') {
        const build = parseInt(parts[2], 10);
        return build >= 22000;
    }

    return false;
}

const ThemeFun = (themeDack: boolean, winBgEffect: AppDataType['winBgEffect'] | undefined) => {
    const [isWin11, setIsWin11] = useState(false);

    useEffect(() => {
        isWin11Promise.then(() => setIsWin11(_isWin11));
    }, []);

    let BgLayout = 'transparent'
    let headerBg = themeDack ? '#22222280' : '#ffffff4d'
    const effectiveBgEffect = isWin11 ? winBgEffect : 'Default'
    switch (effectiveBgEffect) {
        case 'Acrylic':
            BgLayout = themeDack ? 'linear-gradient(33deg, #121317c4, #323b4296)' : 'linear-gradient(33deg, #F0EFF0c4, #FAF8F996)'
            headerBg = themeDack ? '#222222bf' : '#ffffffbf'
            break;
        case 'Default':
            headerBg = isWin11 ? 'transparent' : (themeDack ? '#180d00' : '#fdf0e6')
            BgLayout = themeDack ? 'linear-gradient(33deg, #121317, #323b42)' : 'linear-gradient(33deg, #fff7e9, #e8e8e8)'
            break
    }
    const Themeconfig: ThemeConfig = useMemo(() => ({
        algorithm: themeDack ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
            Divider: {
                colorSplit: themeDack ? '#83838329' : '#85858529'
            },
            Segmented: {
                trackBg: themeDack ? '#87878745' : '#bfbfbf45',
                itemSelectedBg: themeDack ? '#23232391' : '#ffffff91',
            },
            Layout: {
                headerBg: headerBg,
            }
        },
        token: {
            borderRadius:14,
            borderRadiusOuter:16,
            colorPrimary: '#ff8c00',
            colorBgLayout: BgLayout,
            colorBgBase: themeDack ? '#00000096' : '#ffffff96',
            colorBorder: themeDack ? '#87878796' : '#bfbfbf96',
            colorBgElevated: themeDack ? '#313131' : '#ffffff',
            colorBgSpotlight: '#313131',
        },
    }), [themeDack, BgLayout]);
    const antdToken = useMemo(() => theme.getDesignToken(Themeconfig), [Themeconfig]);
    return { Themeconfig, antdToken }
}

export { ThemeFun }
