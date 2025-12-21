import { useState } from "react";
import { Button, Modal, TextInput, Textarea, NumberInput, Stack, Text, List, Divider, Select, FileButton, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { showLoading, updateSuccess, updateError } from "@/lib/notifications";
import { IconUpload } from "@tabler/icons-react";

interface OutlineSection {
  name: string;
  duration_minutes: number;
  description: string;
  key_points: string[];
}

interface OutlineResponse {
  overview: string;
  sections: OutlineSection[];
  total_duration_minutes: number;
}

export function OutlineGenerator({ 
  opened, 
  onClose, 
  onOutlineGenerated 
}: { 
  opened: boolean; 
  onClose: () => void;
  onOutlineGenerated: (outline: { topic: string; objectives: string; directions: string; totalDuration: number }) => void;
}) {
  const { t } = useTranslation();
  const [topic, setTopic] = useState("");
  const [objectives, setObjectives] = useState("");
  const [directions, setDirections] = useState("");
  const [totalDuration, setTotalDuration] = useState<number | string>(60);
  const [meetingLanguage, setMeetingLanguage] = useState<"English" | "Chinese">("English");
  const [loading, setLoading] = useState(false);
  const [outline, setOutline] = useState<OutlineResponse | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim() || !objectives.trim() || !directions.trim() || !totalDuration) {
      updateError("", t('outlineGenerateError') || "Error", t('outlineFieldsRequired') || "Please fill in all fields");
      return;
    }

    const loadingId = showLoading(t('outlineGenerating') || "Generating outline...", "");
    setLoading(true);
    setOutline(null);

    try {
      const response = await fetch("/api/generateOutline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          topic,
          objectives,
          directions,
          total_duration_minutes: Number(totalDuration),
          meeting_language: meetingLanguage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate outline");
      }

      const data: OutlineResponse = await response.json();
      setOutline(data);
      updateSuccess(loadingId, t('outlineGenerateSuccess') || "Success", t('outlineGenerateSuccessMessage') || "Outline generated successfully");
    } catch (error: any) {
      updateError(loadingId, t('outlineGenerateError') || "Error", error.message || "Failed to generate outline");
    } finally {
      setLoading(false);
    }
  };

  const handleUseOutline = () => {
    if (outline) {
      onOutlineGenerated({
        topic,
        objectives,
        directions,
        totalDuration: Number(totalDuration),
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setTopic("");
    setObjectives("");
    setDirections("");
    setTotalDuration(60);
    setOutline(null);
    onClose();
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;

    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    try {
      const text = await file.text();

      // Try to parse as JSON first
      if (fileType === 'application/json' || fileName.endsWith('.json')) {
        try {
          const data = JSON.parse(text);
          if (data.topic) setTopic(data.topic);
          if (data.objectives) setObjectives(data.objectives);
          if (data.directions) setDirections(data.directions);
          if (data.totalDuration || data.total_duration_minutes) {
            setTotalDuration(data.totalDuration || data.total_duration_minutes);
          }
          if (data.meetingLanguage || data.meeting_language) {
            setMeetingLanguage((data.meetingLanguage || data.meeting_language) as "English" | "Chinese");
          }
          updateSuccess("", t('fileUploadSuccess' as any) || "Success", t('fileUploadSuccessMessage' as any) || "File loaded successfully");
        } catch (e) {
          throw new Error(t('invalidJsonFile' as any) || "Invalid JSON file format");
        }
      } else if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
        // Parse as plain text with simple format:
        // Topic: ...
        // Objectives: ...
        // Directions: ...
        // Duration: ...
        const lines = text.split('\n');
        let currentSection = '';
        let currentContent = '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('Topic:') || trimmedLine.startsWith('主题:')) {
            if (currentSection && currentContent) {
              setFieldContent(currentSection, currentContent.trim());
            }
            currentSection = 'topic';
            currentContent = trimmedLine.replace(/^(Topic|主题):\s*/i, '');
          } else if (trimmedLine.startsWith('Objectives:') || trimmedLine.startsWith('目标:')) {
            if (currentSection && currentContent) {
              setFieldContent(currentSection, currentContent.trim());
            }
            currentSection = 'objectives';
            currentContent = trimmedLine.replace(/^(Objectives|目标):\s*/i, '');
          } else if (trimmedLine.startsWith('Directions:') || trimmedLine.startsWith('方向:')) {
            if (currentSection && currentContent) {
              setFieldContent(currentSection, currentContent.trim());
            }
            currentSection = 'directions';
            currentContent = trimmedLine.replace(/^(Directions|方向):\s*/i, '');
          } else if (trimmedLine.startsWith('Duration:') || trimmedLine.startsWith('时长:')) {
            if (currentSection && currentContent) {
              setFieldContent(currentSection, currentContent.trim());
            }
            currentSection = 'duration';
            const durationMatch = trimmedLine.match(/(\d+)/);
            if (durationMatch) {
              setTotalDuration(parseInt(durationMatch[1]));
            }
            currentSection = '';
            currentContent = '';
          } else if (trimmedLine && currentSection) {
            currentContent += (currentContent ? '\n' : '') + trimmedLine;
          }
        }

        // Set the last section
        if (currentSection && currentContent) {
          setFieldContent(currentSection, currentContent.trim());
        }

        updateSuccess("", t('fileUploadSuccess' as any) || "Success", t('fileUploadSuccessMessage' as any) || "File loaded successfully");
      } else {
        throw new Error(t('unsupportedFileType' as any) || "Unsupported file type. Please upload a JSON or TXT file.");
      }
    } catch (error: any) {
      updateError("", t('fileUploadError' as any) || "Error", error.message || t('fileUploadErrorMessage' as any) || "Failed to load file");
    }
  };

  const setFieldContent = (section: string, content: string) => {
    switch (section) {
      case 'topic':
        setTopic(content);
        break;
      case 'objectives':
        setObjectives(content);
        break;
      case 'directions':
        setDirections(content);
        break;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t('generateOutline') || "Generate Discussion Outline"}
      size="xl"
    >
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <TextInput
            label={t('topic')}
            placeholder={t('topicPlaceholder')}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
            style={{ flex: 1 }}
          />
          <FileButton onChange={handleFileUpload} accept="application/json,text/plain,.json,.txt">
            {(props) => (
              <Button {...props} leftSection={<IconUpload size={16} />} variant="light">
                {t('uploadFile' as any) || "Upload"}
              </Button>
            )}
          </FileButton>
        </Group>
        
        <Textarea
          label={t('objectives') || "Objectives"}
          placeholder={t('objectivesPlaceholder') || "What do you want to achieve in this discussion?"}
          value={objectives}
          onChange={(e) => setObjectives(e.target.value)}
          minRows={3}
          required
        />
        
        <Textarea
          label={t('directions') || "Discussion Directions"}
          placeholder={t('directionsPlaceholder') || "What aspects or directions should the discussion focus on?"}
          value={directions}
          onChange={(e) => setDirections(e.target.value)}
          minRows={3}
          required
        />
        
        <NumberInput
          label={t('totalDuration') || "Total Duration (minutes)"}
          value={totalDuration}
          onChange={setTotalDuration}
          min={10}
          max={480}
          required
        />

        <Select
          label={t('discussionLanguage')}
          data={[
            { value: 'English', label: 'English' },
            { value: 'Chinese', label: '中文' },
          ]}
          value={meetingLanguage}
          onChange={(value) => setMeetingLanguage(value as "English" | "Chinese")}
          allowDeselect={false}
          required
        />

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={handleClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleGenerate} loading={loading}>
            {t('generate') || "Generate"}
          </Button>
        </div>

        {outline && (
          <>
            <Divider />
            <div>
              <Text fw={500} mb="sm">{t('overview') || "Overview"}</Text>
              <Text size="sm" c="dimmed" mb="md">{outline.overview}</Text>

              <Text fw={500} mb="sm">{t('discussionFlow') || "Discussion Flow"}</Text>
              {outline.sections.map((section, index) => (
                <div key={index} style={{ marginBottom: '20px', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                  <Text fw={500}>{section.name}</Text>
                  <Text size="xs" c="dimmed">{t('duration') || "Duration"}: {section.duration_minutes} {t('minutes') || "minutes"}</Text>
                  <Text size="sm" mt="xs">{section.description}</Text>
                  {section.key_points.length > 0 && (
                    <List size="sm" mt="xs">
                      {section.key_points.map((point, idx) => (
                        <List.Item key={idx}>{point}</List.Item>
                      ))}
                    </List>
                  )}
                </div>
              ))}
              
              <Text size="sm" c="dimmed" mt="md">
                {t('totalDuration') || "Total Duration"}: {outline.total_duration_minutes} {t('minutes') || "minutes"}
              </Text>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <Button variant="outline" onClick={handleClose}>
                {t('cancel')}
              </Button>
              <Button onClick={handleUseOutline}>
                {t('useOutline') || "Use This Outline"}
              </Button>
            </div>
          </>
        )}
      </Stack>
    </Modal>
  );
}

