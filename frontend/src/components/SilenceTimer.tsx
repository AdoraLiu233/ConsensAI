import { useEffect, useState } from 'react';
import { Badge, Group, Text } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface SilenceTimerProps {
  lastSpeechTime: number | null; // 最后发言时间戳（毫秒）
  threshold: number; // 阈值（秒），默认60秒
}

export function SilenceTimer({ lastSpeechTime, threshold = 60 }: SilenceTimerProps) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!lastSpeechTime) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastSpeechTime) / 1000);
      setElapsed(elapsedSeconds);
    };

    // 立即更新一次
    updateElapsed();

    // 每秒更新一次
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [lastSpeechTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  const isNearThreshold = elapsed >= threshold * 0.8; // 接近阈值时（80%）开始警告

  return (
    <Group gap="xs" style={{ alignItems: 'center' }}>
      <IconClock size={16} color={isNearThreshold ? '#fa5252' : '#868e96'} />
      <Text size="sm" c={isNearThreshold ? 'red' : 'dimmed'}>
        {t('silenceTimer')}: {formatTime(elapsed)}
      </Text>
      {elapsed >= threshold && (
        <Badge color="red" variant="light" size="sm">
          {t('silenceThresholdReached')}
        </Badge>
      )}
    </Group>
  );
}

