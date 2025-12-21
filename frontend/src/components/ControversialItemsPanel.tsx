import { useEffect, useState } from 'react';
import { Box, Card, Text, Badge, ScrollArea, Button, Group, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useMeetingStore } from '@/store/meetingStore';
import { error } from '@/lib/notifications';
import type { PositionStatusType } from '@/lib/definitions';

interface ControversialItem {
  type: 'issue' | 'position';
  full_id: string;
  content: string;
  status?: PositionStatusType;
  [key: string]: any;
}

interface ControversialItemsPanelProps {
  opened: boolean;
  onClose?: () => void;
}

export function ControversialItemsPanel({ opened, onClose }: ControversialItemsPanelProps) {
  const { t } = useTranslation();
  const meetingHashId = useMeetingStore(s => s.meetingHashId);
  const [items, setItems] = useState<ControversialItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchControversialItems = async () => {
    if (!meetingHashId) {
      error(t('error'), t('meetingHashIdMissing') || 'Meeting hash ID is missing');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/getControversialItems', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          meeting_hash_id: meetingHashId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch controversial items');
      }

      const data = await response.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Error fetching controversial items:', err);
      error(t('error'), err instanceof Error ? err.message : 'Failed to fetch controversial items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened && meetingHashId) {
      fetchControversialItems();
    }
  }, [opened, meetingHashId]);

  if (!opened) return null;

  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        height: '100vh',
        backgroundColor: 'white',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        style={{
          padding: '16px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Title order={4}>{t('controversialItemsLibrary' as any) || '问题库'}</Title>
        {onClose && (
          <Button size="xs" variant="subtle" onClick={onClose}>
            {t('close')}
          </Button>
        )}
        <Button size="xs" variant="light" onClick={fetchControversialItems} loading={loading}>
          {t('refresh' as any) || '刷新'}
        </Button>
      </Box>

      <ScrollArea style={{ flex: 1, padding: '16px' }}>
        {loading ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {t('loading' as any) || '加载中...'}
          </Text>
        ) : items.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {t('noControversialItems' as any) || '暂无存在分歧的议题或观点'}
          </Text>
        ) : (
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item) => (
              <Card key={item.full_id} shadow="sm" padding="sm" radius="md" withBorder>
                <Group justify="space-between" mb="xs">
                  <Badge
                    color={item.type === 'issue' ? 'blue' : 'orange'}
                    variant="light"
                    size="sm"
                  >
                    {item.type === 'issue' ? t('issue') : t('position')}
                  </Badge>
                  <Badge color="red" variant="light" size="sm">
                    {t('statusControversial' as any) || '存在分歧'}
                  </Badge>
                </Group>
                <Text size="sm" fw={500} mb="xs">
                  ID: {item.full_id}
                </Text>
                <Text size="sm" c="dimmed">
                  {item.content}
                </Text>
              </Card>
            ))}
          </Box>
        )}
      </ScrollArea>
    </Box>
  );
}

