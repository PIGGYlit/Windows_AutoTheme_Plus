import { fetch as fetchHttp } from '@tauri-apps/plugin-http';
import * as pako from 'pako';
type Props = (key: string, lang?: string) => any;

//寻找html中的指定变量
const extractSunMoonData = (text: string) => {
    //console.log(text);

    const getMatch = (regex: RegExp) => text.match(regex)?.[1]?.trim() || "";

    const hid = getMatch(/var\s+hid\s*=\s*"([^"]+)"/);
    const abstract = getMatch(/<div\s+class="current-abstract"\s*>(.*?)<\/div>/s);
    const sunMoonJson = getMatch(/window\.sunMoon\s*=\s*(\{.*?\});/s);

    try {
        const { sun: { rise, set } = { rise: "", set: "" } } = JSON.parse(sunMoonJson || "{}");
        return { rise, set, hid, abstract };
    } catch (error) {
        console.error("JSON 解析错误:", error);
    }

    return { hid, abstract }; // 解析失败时仍返回基本数据
};

export const GetHttp = async (url: string) => {
    const response = await fetchHttp(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
        const contentType = response.headers.get('Content-Type') || '';
        const contentEncoding = response.headers.get('Content-Encoding');

        let data;
        if (contentType.includes('text/html')) {
            // 如果是 HTML，则直接返回文本内容

            data = await response.text();


        } else if (contentEncoding && contentEncoding.includes('gzip')) {
            // 响应体是 Gzip 压缩的，需要解压
            const arrayBuffer = await response.arrayBuffer();
            const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' });
            data = JSON.parse(decompressed); // 解压后解析 JSON
        } else {
            // 默认情况下解析 JSON
            data = await response.json();
        }
        return data;
    }

    return false;
};
const Apikey = 'bdd98ec1d87747f3a2e8b1741a5af796'
const Languages: Record<string, string> = {
    'zh_HK': 'zh-hant'
}

const AppCiti: Props = async (name, lang) => {
    lang = lang || 'en_US' as string
    const langs = Languages[lang] || lang.split('_')[0]
    let getUrl = ''
    if (name) {
        getUrl = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURI(name)}&lang=${langs}`
    } else {
        const range = (lang === 'zh_HK' ? 'CN' : lang.split('_')[1]).toUpperCase().toLowerCase();
        getUrl = `https://geoapi.qweather.com/v2/city/top?number=10&lang=${langs}&range=${range}`
    }
    const url = `${getUrl}&key=${Apikey}`;
    const data = await GetHttp(url)
    return data
}


// 假设 GetHttp(url: string) => Promise<string | null | undefined>
// 假设 extractSunMoonData(html: string) => Promise<YourResultType>

type SunriseOptions = {
    maxAttempts?: number;      // 最多尝试次数（包含首次请求），默认 10
    baseDelayMs?: number;      // 基础退避时间（ms），默认 500
    throwOnFailure?: boolean;  // 全部失败时是否抛出异常，默认 false（返回 null）
};

async function Sunrise(
    id?: string,
    locale?: string,
    options?: SunriseOptions
): Promise<any | null> {
    const { maxAttempts = 10, baseDelayMs = 500, throwOnFailure = false } = options ?? {};

    // 规范化 locale -> 用于构造路径
    // 支持 "zh", "zh_CN", "en", "en_US", 也接受 "/en" 之类（会去掉前导 '/')
    const raw = (locale ?? '').replace(/^\//, '');
    const langPrefix = raw.split('_')[0];
    const langPath = (langPrefix === 'zh' || langPrefix === '') ? '' : '/en';

    // 构造 URL
    const idPath = id ? `${encodeURIComponent(id)}.html` : '';
    const url = `https://www.qweather.com${langPath}/weather/${idPath}`;

    // 简单的帮助函数：等待 ms 毫秒
    const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
   
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Sunrise: Attempt ${attempt} to fetch ${url}`);
        
        try {
            const data = await GetHttp(url);
            if (data) {
                // 如果解析也可能失败，捕获并在必要时重试
                try {
                    const json = await extractSunMoonData(data);
                    return json;
                } catch (parseErr) {
                    // 解析失败：如果达到最大尝试次数则抛/返回，否则继续重试
                    if (attempt === maxAttempts) {
                        if (throwOnFailure) throw parseErr;
                        return null;
                    }
                    // 否则继续到下一次尝试（走到下面的等待逻辑）
                }
            } else {
                // data falsy (网络/请求失败)，继续重试
                if (attempt === maxAttempts) {
                    break;
                }
            }
        } catch (err) {
            // GetHttp 本身抛错也会来到这里。最后一次若仍然失败则抛/返回。
            if (attempt === maxAttempts) {
                if (throwOnFailure) throw err;
                return null;
            }
            // 否则继续重试
        }
       
        // 等待：指数退避 + 小随机抖动
        const expo = Math.pow(2, attempt - 1); // 1,2,4,8...
        const jitter = Math.floor(Math.random() * 200); // 0-199 ms 随机抖动
        const waitMs = baseDelayMs * expo + jitter;
        await sleep(waitMs);
    }

    // 全部尝试完仍未成功
    if (throwOnFailure) {
        throw new Error(`Sunrise: failed to fetch/parse ${url} after ${maxAttempts} attempts`);
    }
    return null;
}

export { AppCiti, Sunrise };