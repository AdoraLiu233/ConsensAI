import { useEffect, useState } from 'react';
import { Modal, Card, Text, List, Group, Button, Badge, Stack, Box } from '@mantine/core';
import { IconBulb, IconX, IconSparkles } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { InspirationData } from '@/lib/models';

interface InspirationCardProps {
  inspiration: InspirationData | null;
  onClose: () => void;
}

export function InspirationCard({ inspiration, onClose }: InspirationCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (inspiration) {
      setIsOpen(true);
    }
  }, [inspiration]);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(onClose, 300); // 等待动画完成
  };

  if (!inspiration || !isOpen) {
    return null;
  }

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <IconSparkles size={24} color="#ffd43b" />
          <Text fw={700} size="lg">{t('inspirationTitle')}</Text>
          <Badge color="yellow" variant="light" size="lg">
            {t('aiGenerated')}
          </Badge>
        </Group>
      }
      size="lg"
      centered
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3,
      }}
      styles={{
        content: {
          animation: 'pulse 0.5s ease-in-out',
        },
        header: {
          background: 'linear-gradient(135deg, #ffd43b 0%, #ffa94d 100%)',
          color: 'white',
          padding: '1rem',
        },
        title: {
          color: 'white',
        },
      }}
    >
      <Stack gap="md" mt="md">
        <Box>
          <Text size="sm" c="dimmed" mb="xs">
            {t('inspirationDescription')}
          </Text>
          <Card
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{
              background: 'linear-gradient(135deg, #fff9e6 0%, #fff4d6 100%)',
              borderColor: '#ffd43b',
            }}
          >
            <List
              spacing="sm"
              size="md"
              icon={<IconBulb size={18} color="#ffa94d" />}
              styles={{
                item: {
                  paddingLeft: '0.5rem',
                },
              }}
            >
              {inspiration.ideas && inspiration.ideas.length > 0 ? (
                inspiration.ideas.map((idea, index) => (
                  <List.Item key={index}>
                    <Text size="md" style={{ lineHeight: 1.6 }}>
                      {idea}
                    </Text>
                  </List.Item>
                ))
              ) : (
                <Text size="md" c="dimmed" style={{ fontStyle: 'italic' }}>
                  {t('noInspiration')}
                </Text>
              )}
            </List>
          </Card>
        </Box>

        <Group justify="flex-end" mt="md">
          <Button
            variant="light"
            color="gray"
            onClick={handleClose}
            leftSection={<IconX size={16} />}
          >
            {t('close')}
          </Button>
        </Group>
      </Stack>

      <style>{`
        @keyframes pulse {
          0% {
            transform: scale(0.95);
            opacity: 0;
          }
          50% {
            transform: scale(1.02);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </Modal>
  );
}

