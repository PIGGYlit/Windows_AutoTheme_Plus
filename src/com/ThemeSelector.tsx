import React from 'react';
import { Modal, Space, Typography, Switch, Flex, Divider, Button, Image } from 'antd';
import { useLocalImageUrl } from '../mod/utils/tauri-file';
import { open } from '@tauri-apps/plugin-dialog';
import { logger } from '../mod/utils/logger';
import { MoonOutlined, SunOutlined, PictureOutlined } from '@ant-design/icons';
import useAppData from '../mod/DataSave'

export interface ThemeSelectorProps {
  isModalOpen: boolean;
  setIsModalOpen: (e: boolean) => void;
  locale: any
}

const { Text } = Typography;

const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  isModalOpen,
  setIsModalOpen,
  locale
}) => {
  const { AppData, setData } = useAppData()

  const pickImage = async (mode: 'light' | 'dark') => {
    logger.info("Wallpaper", `开始选择${mode}壁纸`);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'] }]
      });
      if (selected) {
        const key = mode === 'light' ? 'CustomWallpaperLight' : 'CustomWallpaperDark';
        setData({ [key]: selected });
        logger.info("Wallpaper", `自定义${mode}壁纸已选择: ${selected}`);
      } else {
        logger.debug("Wallpaper", `取消选择${mode}壁纸`);
      }
    } catch (e) {
      logger.error("Wallpaper", "选择壁纸文件失败:", e);
    }
  };

  const { src: wallpaperLightPreview } = useLocalImageUrl(AppData?.CustomWallpaperLight);
  const { src: wallpaperDarkPreview } = useLocalImageUrl(AppData?.CustomWallpaperDark);

  const handleCancel = () => {
    logger.debug("ThemeSelector", "关闭壁纸设置弹窗");
    setIsModalOpen(false);
  };

  return (
    <Modal
      title={locale?.main?.customWallpaper || '自定义壁纸'}
      open={isModalOpen}
      onCancel={handleCancel}
      width={460}
      footer={null}
      style={{ top: 80 }}
    >
      <Flex vertical gap={16}>
        <Flex align="center" justify="space-between">
          <Space>
            <PictureOutlined />
            <Text>{locale?.main?.customWallpaper || '自定义壁纸'}</Text>
          </Space>
          <Switch
            checked={AppData?.CustomWallpaperEnable}
            onChange={(e) => {
              logger.info("Wallpaper", `自定义壁纸开关: ${e}`);
              setData({ CustomWallpaperEnable: e });
            }}
          />
        </Flex>

        <Divider style={{ margin: 0 }} />

        <Flex align="center" justify="space-between">
          <Space>
            <SunOutlined style={{ color: '#fa8c16', fontSize: 16 }} />
            <Text>亮色壁纸</Text>
          </Space>
          <Space>
            {wallpaperLightPreview ? (
              <Image src={wallpaperLightPreview} width={60} height={40} style={{ borderRadius: 4, objectFit: 'cover' }} preview={{ mask: null }} />
            ) : (
              <Text type="secondary" style={{ width: 60, textAlign: 'center' }}>无</Text>
            )}
            <Button onClick={() => pickImage('light')}>
              {AppData?.CustomWallpaperLight ? '更换' : '选择'}
            </Button>
          </Space>
        </Flex>

        <Flex align="center" justify="space-between">
          <Space>
            <MoonOutlined style={{ color: '#13c2c2', fontSize: 16 }} />
            <Text>暗色壁纸</Text>
          </Space>
          <Space>
            {wallpaperDarkPreview ? (
              <Image src={wallpaperDarkPreview} width={60} height={40} style={{ borderRadius: 4, objectFit: 'cover' }} preview={{ mask: null }} />
            ) : (
              <Text type="secondary" style={{ width: 60, textAlign: 'center' }}>无</Text>
            )}
            <Button onClick={() => pickImage('dark')}>
              {AppData?.CustomWallpaperDark ? '更换' : '选择'}
            </Button>
          </Space>
        </Flex>
      </Flex>
    </Modal>
  );
};

export default ThemeSelector;
