import { useState } from 'react';
import { Button, Textarea, Stack, Group } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { socket } from '@/lib/socket';
import { useMeetingStore } from '@/store/meetingStore';
import { useTranslation } from "react-i18next";


export const Recorder = () => {
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const meetingId = useMeetingStore(s => s.meetingId);

  const { t } = useTranslation();

  const handleSend = () => {
    if (!text.trim() || !meetingId) {
      return;
    }

    setIsSending(true);
    const timestamp = Date.now();
    
    // 发送文本消息到后端
    socket.emit('textMessage', {
      meeting_id: meetingId,
      content: text.trim(),
      timestamp: timestamp,
    });

    setText('');
    setIsSending(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter 或 Cmd+Enter 发送消息
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Stack>
      <Textarea
        placeholder={t('enterMessage') || '输入消息...'}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={handleKeyPress}
        minRows={3}
        maxRows={6}
        autosize
      />
      <Group justify="flex-end">
        <Button 
          onClick={handleSend}
          disabled={!text.trim() || isSending}
          leftSection={<IconSend size={16} />}
        >
          {t('send') || '发送'}
        </Button>
      </Group>
    </Stack>
  );
};
