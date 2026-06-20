import { Button, Flex, Modal, Typography } from "antd";
import { useEffect, useState } from "react";
import Markdown from 'react-markdown'
import { AppDataType } from "./Type";
import { UpdateType, checkForUpdates } from "./mod/update";
import { logger, backendLog } from "./mod/utils/logger";


interface Props {
  version: string
  locale: any
  setData: any
  AppData: AppDataType
}

const { Text } = Typography;
const Updates: React.FC<Props> = ({ version, locale, setData, AppData }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [btnLoad, setBtnLoad] = useState(false);
  const [update, setUpdate] = useState<UpdateType | undefined>();
  const nomitCancel = () => {
    setData({ Skipversion: update?.latestVersion })
    setIsModalOpen(false);
  }
  const updates = () => {
    logger.info("Updates", `检查更新开始, 当前版本: ${version}`);
    backendLog.info(`检查更新: 当前版本 ${version}`);
    setBtnLoad(true)
    checkForUpdates(version).then((update) => {
      if (update) {
        logger.info("Updates", `发现新版本: ${update.latestVersion}`);
        backendLog.info(`发现新版本: ${update.latestVersion}`);
        setUpdate(update)
        if (update.latestVersion != AppData.Skipversion) {
          showModal()
        } else {
          logger.info("Updates", `已跳过版本 ${update.latestVersion}`);
        }
      } else {
        logger.info("Updates", "当前已是最新版本");
        setUpdate(undefined)
      }
      setBtnLoad(false)
    }).catch(e => {
      logger.error("Updates", "检查更新失败:", e);
      setBtnLoad(false)
    });
  }
  useEffect(updates, [])
  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };
  const onClickbtn = () => {
    if (update) {
      backendLog.info(`打开 GitHub release: ${update.latestVersion}`);
      showModal()
    } else {
      backendLog.info("手动触发检查更新");
      updates()
    }
  }
  const { upModal } = locale || { upModal: null }
  return (
    <>
      <Flex justify="center" align="center" gap={8}>

        {
          btnLoad ? <Text >{upModal?.textA[0]}</Text> :
            update ? (
              <Text >{upModal?.textA[1]}</Text>
            ) : (
              <Text type="secondary">{upModal?.textA[2]}</Text>
            )
        }
        <Button
          onClick={onClickbtn}
          color={update ? "yellow" : "primary"}
          variant="link"
          loading={btnLoad}>
          {btnLoad ? upModal?.textB[0] : update ? upModal?.textB[1] : upModal?.textB[2]}
        </Button>
      </Flex>

      <Modal
        title={`${upModal?.title}${update?.latestVersion}`}
        open={isModalOpen}
        style={{ userSelect: 'text' }}
        styles={{body:{
          maxHeight: '62vh',
          overflowY: 'auto'
        }}}
        centered
        footer={[
          <Button
            key="nomit"
            type="default"
            onClick={nomitCancel}>
            {upModal?.noText}
          </Button>,
          <Button
            key="link"
            href={update?.releaseUrl}
            target="_blank"
            type="primary"
            onClick={handleCancel}
          >
            {upModal?.okText}
          </Button>,
        ]}
        maskClosable={false}
        onCancel={handleCancel}
      >
        <Markdown>{`#### ${upModal?.upData} :\n ${update?.releaseNotes}`}</Markdown>
      </Modal></>
  )
}
export { Updates }

