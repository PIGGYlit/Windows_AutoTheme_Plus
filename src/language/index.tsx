import type { AppDataType } from '../Type';
import { useEffect, useState } from "react";
import { logger } from "../mod/utils/logger";

interface Props {
  AppData?: AppDataType;
  setData: (update: Partial<AppDataType>) => void;
}

const Language = ({ AppData, setData }: Props) => {
  const [locale, setLocale] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!AppData?.language) {
      logger.debug("Language", "语言未设置，默认 zh_CN");
      setData({ language: 'zh_CN' });
    }
  }, []);

  useEffect(() => {
    const loadLocale = async () => {
      setLoading(true);
      try {
        const mod = await import('./zh-CN.json');
        setLocale(mod.default);
      } catch (error) {
        logger.error('Language', 'Failed to load locale:', error);
        setLocale({});
      } finally {
        setLoading(false);
      }
    };
    loadLocale();
  }, []);

  return {
    Language: null,
    locale,
    currentLang: 'zh_CN',
    loading
  };
};

export default Language;
