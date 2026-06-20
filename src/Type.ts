export interface AppDataType {
  open: boolean;
  mode: 'system' | 'manual';
  times: string[];
  Autostart: boolean;
  language?: string;
  StartShow: boolean;
  Skipversion: string;
  winBgEffect: string;
  //主题选项
  StyemTheme?: string[];
  StyemThemeEnable?: boolean
}

export interface TimesProps {
  disabled?: boolean;
}
declare const App: React.FC;
export default App;

