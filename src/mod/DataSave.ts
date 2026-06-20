// src/hooks/useAppData.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppDataType } from "../Type";
import { logger } from "./utils/logger";


// 深度合并函数
const deepMerge = (defaults: any, stored: any): any => {
  if (typeof stored !== 'object' || stored === null) {
    return stored !== undefined ? stored : defaults;
  }

  if (Array.isArray(stored)) {
    return stored;
  }

  const merged = { ...defaults };
  for (const key of Object.keys(stored)) {
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      if (
        typeof stored[key] === 'object' &&
        stored[key] !== null &&
        !Array.isArray(stored[key])
      ) {
        merged[key] = deepMerge(defaults[key], stored[key]);
      } else {
        merged[key] = stored[key];
      }
    }
  }
  return merged;
};
// 默认应用数据配置
const defaultAppData: AppDataType = {
  open: false,
  mode: 'system',
  times: ["6:00", "18:00"],
  Autostart: false,
  language: undefined,
  StartShow: true,
  Skipversion: '',
  winBgEffect: 'Default',
  StyemTheme: [],
  StyemThemeEnable: false
};

interface AppDataStore {
  AppData: AppDataType;
  setData: (update: Partial<AppDataType>) => void;
}

const useAppDataStore = create<AppDataStore>()(
  persist(
    (set) => ({
      AppData: defaultAppData,

      setData: (update: Partial<AppDataType>) => {
        const keys = Object.keys(update).join(', ');
        logger.info("DataSave", `状态更新: {${keys}}`, update);
        set((state) => {
          const prevData = state.AppData || defaultAppData;

          const updatedData = {
            ...prevData,
            ...update,
          };

          if (!updatedData.language || updatedData.language === '') {
            updatedData.language = 'zh_CN';
          }

          return { AppData: updatedData as AppDataType };
        });
      },

    }),
    {
      name: 'AppData',
          // 使用自定义的合并逻辑来替换默认的浅合并
          merge: (persistedState, currentState) => {
            if (typeof persistedState === 'object' && persistedState !== null) {
              const merged = deepMerge(currentState, persistedState);

              // 确保language字段有效，防止空字符串key导致的问题
          if (!merged.AppData.language || merged.AppData.language === '') {
            merged.AppData.language = 'zh_CN';
          }

          return merged;
        }
        return currentState;
      },
      // 可选的版本控制，用于未来的数据迁移
      version: 1,
    }
  )
);

// 保持原有API结构的hook
const useAppData = () => {
  const { AppData, setData } = useAppDataStore();

  return {
    AppData,
    setData,
  };
};

export default useAppData;