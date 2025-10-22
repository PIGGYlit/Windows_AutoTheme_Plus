// src/components/RatingPrompt.tsx
import { FC, useEffect, useState } from "react";
import { Button, Modal } from "antd";
import useAppData from "./DataSave";
import { openStoreRating } from "./openStoreRating";

interface RatingPromptProps {
  locale: any;
}

const RatingPrompt: FC<RatingPromptProps> = ({ locale }) => {
  const { AppData, updateRatingPrompt } = useAppData();
  const [visible, setVisible] = useState(false);

  // 确保 ratingPrompt 对象存在且完整
  const ratingPrompt = AppData?.ratingPrompt || {
    lastPromptTime: 0,
    promptCount: 0,
    neverShowAgain: false,
  };

  // 解构为原始值，避免对象引用导致的重复 effect 调用
  const {
    lastPromptTime = 0,
    promptCount = 0,
    neverShowAgain = false,
  } = ratingPrompt;

  useEffect(() => {
    if (neverShowAgain) return;

    const now = Date.now();

    // 首次运行：当 promptCount === 0 且 lastPromptTime === 0 时
    // 把 lastPromptTime 初始化为现在，首次提示将在 24 小时后出现
    if (promptCount === 0 && lastPromptTime === 0) {
      // 只初始化，不弹窗
      updateRatingPrompt({ lastPromptTime: now, promptCount: 0 });
      return;
    }

    const timeSinceLastPrompt = now - (lastPromptTime || 0);

    // 首次提示逻辑：24 小时后提示（如果 promptCount === 0 并且 lastPromptTime 已初始化）
    // 后续提示：至少间隔 7 天
    const shouldShow =
      promptCount === 0
        ? timeSinceLastPrompt > 24 * 3600 * 1000
        : timeSinceLastPrompt > 7 * 24 * 3600 * 1000;

    // 最多提示 3 次
    if (shouldShow && promptCount < 3) {
      const timer = setTimeout(() => {
        setVisible(true);
        // 在显示时增加提示计数并记录显示时间（用于下一轮间隔计算）
        updateRatingPrompt({
          lastPromptTime: Date.now(),
          promptCount: promptCount + 1,
        });
      }, 5000); // 应用启动后 5 秒显示

      return () => clearTimeout(timer);
    }
  }, [lastPromptTime, promptCount, neverShowAgain, updateRatingPrompt]);

  const handleChoice = (choice: "now" | "later" | "never") => {
    // 当用户选择“现在”或“稍后”时，更新 lastPromptTime（推迟下一次提示）
    const now = Date.now();

    if (choice === "now") {
      // 打开 Microsoft Store 评分
      openStoreRating("review");
      // 已经在显示时把 promptCount +1 了，这里只需更新 lastPromptTime（确保下一次间隔生效）
      updateRatingPrompt({ lastPromptTime: now });
    }

    if (choice === "later") {
      // 标记稍后（把 lastPromptTime 更新为现在，这样下一次提示会按照后续间隔计算）
      updateRatingPrompt({ lastPromptTime: now });
    }

    if (choice === "never") {
      // 标记不再提示
      updateRatingPrompt({ neverShowAgain: true });
    }

    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal
      title={locale?.reviewModal?.title}
      open={visible}
      onCancel={() => handleChoice("later")}
      footer={null}
      centered
      closable={false}
      maskClosable={false}
      className="rating-prompt-modal"
    >
      <div className="p-4">
        <p className="mb-4 text-gray-700 text-center">
          {locale?.reviewModal?.text}
        </p>
        <div className="flex justify-between">
          <Button onClick={() => handleChoice("later")}>
            {locale?.reviewModal?.laterText}
          </Button>
          <Button onClick={() => handleChoice("never")}>
            {locale?.reviewModal?.cancelText}
          </Button>
          <Button type="primary" onClick={() => handleChoice("now")}>
            {locale?.reviewModal?.okText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RatingPrompt;
