import { Card, Text, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface GoalInterventionProps {
    reason: string;
    intervention: string;
    onLocate: () => void;
    onClose: () => void;
}

export function GoalIntervention({ reason, intervention, onLocate, onClose }: GoalInterventionProps) {
    const { t } = useTranslation();
    return (
        <Card shadow="xl" radius="md" withBorder style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: 350,
            zIndex: 1000,
            backgroundColor: '#fff5f5',
            borderColor: '#ffc9c9',
            borderWidth: 2
        }}>
            <Text fw={700} c="red" size="lg">⚠️ {t('Goal Drift Warning' as any)}</Text>
            <Text size="sm" mt="xs" c="dark">{reason}</Text>
            <Text size="sm" mt="xs" fw={600} c="dimmed">{t('Suggestion' as any)}: {intervention}</Text>
            <Group mt="md" justify="flex-end">
                <Button size="xs" variant="subtle" color="gray" onClick={onClose}>{t('Dismiss' as any)}</Button>
                <Button size="xs" color="red" variant="light" onClick={onLocate}>{t('Focus Goal' as any)}</Button>
            </Group>
        </Card>
    );
}

