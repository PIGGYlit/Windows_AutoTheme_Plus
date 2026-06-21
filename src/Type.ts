export interface AppDataType {
  open: boolean;
  mode: 'system' | 'manual';
  times: string[];
  Autostart: boolean;
  language?: string;
  StartShow: boolean;
  Skipversion: string;
  winBgEffect: string;
  //自定义壁纸
  CustomWallpaperLight?: string;
  CustomWallpaperDark?: string;
  CustomWallpaperEnable?: boolean;
}

export interface TimesProps {
  disabled?: boolean;
}
declare const App: React.FC;
export default App;

