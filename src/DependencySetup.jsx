import React, { useState, useEffect } from 'react';
import {
  Modal,
  Paper,
  Text,
  Title,
  Stack,
  Group,
  Button,
  Checkbox,
  Progress,
  Badge,
  Loader,
  Center,
  Box,
  Alert
} from '@mantine/core';
import {
  IconDownload,
  IconCheck,
  IconAlertCircle,
  IconBrain,
  IconMicrophone,
  IconEye,
  IconVolume
} from '@tabler/icons-react';

const depIcons = {
  kokoro: <IconVolume size={20} />,
  whisper: <IconMicrophone size={20} />,
  yolo: <IconEye size={20} />,
  piper: <IconVolume size={20} />
};

const depColors = {
  kokoro: 'blue',
  whisper: 'green',
  yolo: 'violet',
  piper: 'orange'
};

export default function DependencySetup({ opened, onClose, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState({});
  const [preferences, setPreferences] = useState({});
  const [dependencies, setDependencies] = useState({});
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (opened) {
      loadStatus();
    }
  }, [opened]);

  useEffect(() => {
    // Listen for progress updates
    const handleProgress = (data) => {
      setProgress(data);
    };

    window.electronAPI.onDepsProgress(handleProgress);

    return () => {
      window.electronAPI.removeDepsProgressListener();
    };
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.depsCheckStatus();
      setStatus(result.status);
      setPreferences(result.preferences);
      setDependencies(result.dependencies);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePreference = (key) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const startInstallation = async () => {
    setInstalling(true);
    setError(null);
    setProgress({ status: 'starting', progress: 0 });

    try {
      // Save preferences first
      await window.electronAPI.depsSetPreferences(preferences);

      // Start installation
      const result = await window.electronAPI.depsInstall();

      if (result.success) {
        setProgress({ status: 'complete', progress: 100 });
        setTimeout(() => {
          onComplete?.();
          onClose();
        }, 1500);
      } else {
        setError(result.error || 'Installation failed');
        setInstalling(false);
      }
    } catch (err) {
      setError(err.message);
      setInstalling(false);
    }
  };

  const skipSetup = async () => {
    await window.electronAPI.depsSkipSetup();
    onComplete?.();
    onClose();
  };

  const getProgressPercent = () => {
    if (!progress) return 0;
    if (progress.status === 'complete') return 100;
    if (progress.progress) return progress.progress;
    if (progress.current && progress.total) {
      return Math.round((progress.current / progress.total) * 100);
    }
    return 0;
  };

  const anySelected = Object.values(preferences).some(v => v);
  const allInstalled = Object.entries(preferences).every(
    ([key, selected]) => !selected || status[key]
  );

  return (
    <Modal
      opened={opened}
      onClose={installing ? undefined : onClose}
      title={<Title order={3}>Setup AI Dependencies</Title>}
      size="lg"
      centered
      closeOnClickOutside={!installing}
      closeOnEscape={!installing}
      withCloseButton={!installing}
    >
      {loading ? (
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      ) : installing ? (
        <Stack>
          <Text size="sm" c="dimmed" ta="center">
            Installing dependencies... This may take a few minutes.
          </Text>

          <Progress
            value={getProgressPercent()}
            size="xl"
            radius="xl"
            striped
            animated
          />

          {progress && (
            <Text size="sm" ta="center" c="dimmed">
              {progress.dependency && `Installing ${progress.dependency}...`}
              {progress.detail && ` ${progress.detail}`}
            </Text>
          )}

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}
        </Stack>
      ) : (
        <Stack>
          <Text size="sm" c="dimmed">
            Select which AI features to install. These will be downloaded automatically.
          </Text>

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {error}
            </Alert>
          )}

          <Stack gap="sm">
            {Object.entries(dependencies).map(([key, dep]) => (
              <Paper
                key={key}
                p="md"
                withBorder
                style={{
                  opacity: status[key] ? 0.7 : 1,
                  borderColor: preferences[key] ? 'var(--mantine-color-blue-5)' : undefined
                }}
              >
                <Group justify="space-between">
                  <Group>
                    <Checkbox
                      checked={preferences[key] || false}
                      onChange={() => togglePreference(key)}
                      disabled={status[key]}
                    />
                    <Box>
                      <Group gap="xs">
                        {depIcons[key]}
                        <Text fw={500}>{dep.name}</Text>
                        {key !== 'piper' ? (
                          <Badge size="xs" color="blue">Recommended</Badge>
                        ) : (
                          <Badge size="xs" color="gray">Optional</Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        Size: {dep.size}
                      </Text>
                    </Box>
                  </Group>

                  {status[key] ? (
                    <Badge color="green" leftSection={<IconCheck size={12} />}>
                      Installed
                    </Badge>
                  ) : preferences[key] ? (
                    <Badge color="yellow">Will Install</Badge>
                  ) : (
                    <Badge color="gray">Skipped</Badge>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>

          <Group justify="space-between" mt="md">
            <Button variant="subtle" onClick={skipSetup}>
              Skip for now
            </Button>

            {allInstalled ? (
              <Button
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={() => { onComplete?.(); onClose(); }}
              >
                All Set!
              </Button>
            ) : (
              <Button
                leftSection={<IconDownload size={16} />}
                onClick={startInstallation}
                disabled={!anySelected}
              >
                Install Selected
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
