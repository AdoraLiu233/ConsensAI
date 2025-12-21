import { useState, useEffect } from 'react';
import { TextInput, Switch, Group, Paper, Text, Collapse } from '@mantine/core';
import { useMeetingStore } from '@/store/meetingStore';
import { useTranslation } from 'react-i18next';
// import { client } from '@/client/client'; // Assuming there is a configured client or I use fetch

export function GoalPanel() {
  const { t } = useTranslation();
  const { meetingGoal, setMeetingGoal, meetingHashId, isHost } = useMeetingStore();
  const [localGoal, setLocalGoal] = useState(meetingGoal);
  const [active, setActive] = useState(!!meetingGoal);

  useEffect(() => {
    setLocalGoal(meetingGoal);
    setActive(!!meetingGoal);
  }, [meetingGoal]);

  const updateGoal = async (goal: string) => {
      try {
          // Placeholder for API call
          // await client.POST('/api/setGoal', { body: { meeting_hash_id: meetingHashId, goal } });
          console.log('Setting goal:', goal);
          await fetch('/api/setGoal', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('token')}` // Assuming token is in localStorage
              },
              body: JSON.stringify({
                  meeting_hash_id: meetingHashId,
                  goal: goal
              })
          });
      } catch (e) {
          console.error(e);
      }
  };

  const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalGoal(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.currentTarget.blur();
    }
  };

  const handleBlur = () => {
     if (localGoal !== meetingGoal) {
         setMeetingGoal(localGoal);
         updateGoal(localGoal);
     }
  };

  const handleToggle = (checked: boolean) => {
      setActive(checked);
      if (!checked) {
          // logic when disabled
      } else {
          // logic when enabled
      }
  };
  
  // Only show if host or if there is a goal set
  if (!isHost && !meetingGoal) return null;

  return (
    <Paper shadow="sm" p="sm" radius="md" withBorder className="goal-panel" style={{ 
        position: 'absolute', 
        top: 10, 
        left: 10, 
        zIndex: 90, 
        width: 300,
        backgroundColor: 'rgba(255, 255, 255, 0.95)'
    }}>
      <Group justify="space-between" mb={active ? 5 : 0}>
        <Text size="sm" fw={700}>🎯 {t('Goal Compass')}</Text>
        {isHost && <Switch checked={active} onChange={(event) => handleToggle(event.currentTarget.checked)} size="xs" />}
      </Group>
      
      <Collapse in={active}>
         <TextInput
            placeholder={t("What's the goal of this meeting?")}
            value={localGoal}
            onChange={handleGoalChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={!isHost}
            size="xs"
            styles={{ input: { transition: 'all 0.2s' } }}
        />
      </Collapse>
    </Paper>
  );
}

