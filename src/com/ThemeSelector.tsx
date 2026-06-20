import React, { useEffect, useState } from 'react';
import { Modal, Segmented, Row, Col, Card, message, Spin, Space, Typography, Switch, Tooltip, Tag, Flex } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { normalizeWindowsPath } from '../mod/utils/path';
import { useLocalImageUrl } from '../mod/utils/tauri-file';
import { logger } from '../mod/utils/logger';
import { motion, AnimatePresence, Variants, Transition, LayoutGroup } from 'framer-motion';
import { MoonOutlined, SunOutlined, WarningOutlined } from '@ant-design/icons';
import useAppData from '../mod/DataSave'
export interface Theme {
  name: string;
  path: string;
  is_active: boolean;
  wallpaper?: string;
  system_mode?: string;
  app_mode?: string;
  displayPath?: string;
  displayWallpaper?: string;
}

export interface ThemeSelectorProps {
  isModalOpen: boolean;
  setIsModalOpen: (e: boolean) => void;
  locale: any
}

const { Text } = Typography;

// 类型安全的 transition
const springTransition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 28,
};

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.06,
      when: 'beforeChildren',
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: springTransition },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } },
};
const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  isModalOpen,
  setIsModalOpen,
  locale
}) => {
  const { AppData, setData } = useAppData()
  const [currentMode, setCurrentMode] = useState<'light' | 'dark'>('light');
  const [selectedLightTheme, setSelectedLightTheme] = useState<string>(AppData?.StyemTheme?.[0] || '');
  const [selectedDarkTheme, setSelectedDarkTheme] = useState<string>(AppData?.StyemTheme?.[1] || '');
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setData({
      StyemTheme: [selectedLightTheme, selectedDarkTheme]
    })
  }, [selectedLightTheme, selectedDarkTheme])
  useEffect(() => {
    const fetchThemes = async () => {
      if (!isModalOpen) return;
      setLoading(true);
      try {
        const themesData = (await invoke('get_windows_themes')) as Theme[];

        const processed = themesData.map((t) => ({
          ...t,
          displayPath: normalizeWindowsPath(t.path),
          displayWallpaper: normalizeWindowsPath(t.wallpaper),
        }));
        setThemes(processed);
        if (!selectedLightTheme) {
          const firstLight = processed.find((t) => t.system_mode?.toLowerCase() === 'light');
          if (firstLight) setSelectedLightTheme(firstLight.path);
        }
        if (!selectedDarkTheme) {
          const firstDark = processed.find((t) => t.system_mode?.toLowerCase() === 'dark');
          if (firstDark) setSelectedDarkTheme(firstDark.path);
        }
        logger.info("ThemeSelector", `获取到 ${themesData.length} 个主题`);
      } catch (err) {
        logger.error('ThemeSelector', '获取主题列表失败:', err);
        message.error('获取主题列表失败');
      } finally {
        setTimeout(() => {
          setLoading(false);
        }, 688);
      }
    };

    fetchThemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const lightThemes = themes.filter((t) => t.app_mode?.toLowerCase() === 'light');
  const darkThemes = themes.filter((t) => t.app_mode?.toLowerCase() === 'dark');
  const handleOk = (e: boolean) => {
    logger.info("ThemeSelector", `主题切换开关: ${e}`);
    setData({
      StyemThemeEnable: e
    })
  };

  const handleCancel = () => {
    logger.debug("ThemeSelector", "关闭主题选择弹窗");
    setIsModalOpen(false);
  };

  const getCurrentThemes = () => (currentMode === 'light' ? lightThemes : darkThemes);
  const getCurrentSelected = () => (currentMode === 'light' ? selectedLightTheme : selectedDarkTheme);

  const handleCardClick = (themePath: string) => {
    logger.info("ThemeSelector", `选择${currentMode}主题: ${themePath}`);
    if (currentMode === 'light') setSelectedLightTheme(themePath);
    else setSelectedDarkTheme(themePath);
  };

  // 子组件：缩略图（确保 hook 在组件顶层稳定调用）
  const ThemeThumb: React.FC<{ wallpaperPath?: string; mode: 'light' | 'dark' }> = ({ wallpaperPath, mode }) => {
    const { src } = useLocalImageUrl(wallpaperPath);
    const fallback = mode === 'light'
      ? 'https://gw.alipayobjects.com/zos/bmw-prod/f601048d-61c2-44d0-bf57-ca1afe7fd92e.svg'
      : 'https://gw.alipayobjects.com/zos/bmw-prod/2c73c6a5-89e5-4d46-b243-317a848fc93f.svg';

    return (
      <img
        alt={wallpaperPath || 'thumb'}
        src={src || fallback}
        style={{
          width: "100%",
          height: "100%",
          objectFit: 'cover',    // 保持比例填充
          objectPosition: 'center', // 居中裁剪
          display: 'block',
          borderRadius: 0,
        }}
        draggable={false}
      />
    );
  };

  const renderCard = (theme: Theme) => {
    const isSelected = getCurrentSelected() === theme.path;
    const label = locale?.themeName?.[theme.name] || theme.name;
    // 覆盖层样式：根据当前模式调整背景渐变与文字颜色
    const overlayStyle: React.CSSProperties = {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: '6px 8px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
      fontSize: 12,
      lineHeight: '16px',
      pointerEvents: 'none', // 防止覆盖层阻挡点击
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      // 深色模式用深色渐变 + 白字；浅色模式用浅色半透明渐变 + 深色字
      background: currentMode === 'dark'
        ? 'linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))'
        : 'linear-gradient(to top, rgba(255,255,255,0.8), rgba(255,255,255,0))',
      color: currentMode === 'dark' ? '#fff' : 'rgba(0,0,0,0.85)',
    };

    const cover = (
      <div style={{
        position: 'relative',
        height: 92,
        overflow: 'hidden',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8
      }}>

        <Tooltip title={label} placement="bottom">
          <ThemeThumb wallpaperPath={theme.displayWallpaper} mode={currentMode} />
          <div style={overlayStyle}>
            <div style={{ width: '100%', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={label}>
              {label}
            </div>
          </div>
        </Tooltip>
      </div>
    );

    return (
      <motion.div
        key={theme.path}
        layout
        layoutId={`card-${theme.path}`} // 关键：为每张卡片提供 layoutId，支持在不同父容器间做平滑过渡
        variants={itemVariants}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        style={{ width: '100%', }}
      >
        <Card
          hoverable
          onClick={() => handleCardClick(theme.path)}
          style={{
            width: '100%',
            marginBottom: 12,
            borderRadius: 8,
            cursor: 'pointer',
            border: isSelected ? '2px solid #1890ff' : undefined,
            boxShadow: isSelected ? '0 8px 20px rgba(65, 65, 65, 0.14)' : undefined,
            overflow: 'hidden',
            padding: 0,
          }}
          cover={cover}
          styles={{
            body: { padding: 0 },
          }} // body 保留小内边距，如果你想完全去掉正文内容可以设为 { padding: 0 }
        />
      </motion.div>
    );
  };

  const currentLightTheme = lightThemes.find(t => t.path === selectedLightTheme);
  const currentDarkTheme = darkThemes.find(t => t.path === selectedDarkTheme);
  const footer = (
    <>
      <Tag
        icon={<WarningOutlined />}
        color="warning"
        style={{ marginBottom: 8 }}
      >
        {locale?.main?.switchStyemModeOpenTip}
      </Tag>
      <Flex
        align="start"
        justify="space-between"
        style={{ width: "100%" }}
      >
        <Space direction="vertical" size={2} align='start'>
          <motion.div
            animate={{
              width: "auto" // 让motion自己计算宽度
            }}
            transition={{ duration: 0.3 }}
            style={{
              display: 'inline-block',
            }}
          >
            <Tag
              icon={<SunOutlined />}
              color="orange"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={currentLightTheme?.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentLightTheme ? locale?.themeName?.[currentLightTheme.name] || currentLightTheme.name : '未选择'}
                </motion.span>
              </AnimatePresence>
            </Tag>
          </motion.div>

          <motion.div
            animate={{
              width: "auto"
            }}
            transition={{ duration: 0.3 }}
            style={{
              display: 'inline-block',
            }}
          >
            <Tag icon={<MoonOutlined />} color="cyan">
              <AnimatePresence mode="wait">
                <motion.span
                  key={currentDarkTheme?.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentDarkTheme ? locale?.themeName?.[currentDarkTheme.name] || currentDarkTheme.name : '未选择'}
                </motion.span>
              </AnimatePresence>
            </Tag>
          </motion.div>
        </Space>
        <Space>
          <Text>{locale?.main?.open}</Text>
          <Switch
            checked={AppData?.StyemThemeEnable}
            onChange={handleOk} />
        </Space>
      </Flex></>
  )
  return (
    <Modal
      title={
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <Segmented
            value={currentMode}
            shape="round"
            onChange={(value) => {
              logger.info("ThemeSelector", `切换显示模式: ${value}`);
              setCurrentMode(value as 'light' | 'dark');
            }}
            options={[
              { value: 'light', label: `${locale?.ThemeLight} (${lightThemes.length})` },
              { value: 'dark', label: `${locale?.ThemeDark} (${darkThemes.length})` },
            ]}
          />
        </div>
      }
      open={isModalOpen}
      onCancel={handleCancel}
      width={880}
      style={{
        top: 28,
        padding: 0,
      }}
      footer={footer}
      confirmLoading={loading}
      className="theme-selector-modal"
    >
      {loading ? (
        <Row justify="center" align="middle" style={{ padding: 0 }}>
          <Col>
            <Space direction="vertical" align="center">
              <Spin />
              <Text>Loading...</Text>
            </Space>
          </Col>
        </Row>
      ) : (
        <>
          <LayoutGroup>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={`theme-grid-${currentMode}-${getCurrentThemes().length}`}
                variants={containerVariants}
                initial="hidden"
                animate="show"
                exit="hidden"
                layout
                style={{
                  height: 342, overflowY: 'auto', overflowX: 'hidden'

                }}
              >
                <Row gutter={[16, 16]} wrap align="middle" justify="space-around">
                  {getCurrentThemes().map((theme) => (
                    <Col key={theme.path} span={12}>
                      {renderCard(theme)}
                    </Col>
                  ))}
                </Row>
              </motion.div>
            </AnimatePresence>
          </LayoutGroup>

        </>
      )}
    </Modal>
  );
};

export default ThemeSelector;
