import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, Dialog, Portal } from 'react-native-paper';
import { EvidenceIntent } from '@cedar-terrace/shared';

interface PhotoIntentPickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectIntent: (intent: string) => void;
}

const INTENT_OPTIONS = [
  {
    value: EvidenceIntent.PRIMARY_VEHICLE,
    label: 'Primary Vehicle View',
    description: 'Main photo of the vehicle',
  },
  {
    value: EvidenceIntent.SECONDARY_VEHICLE,
    label: 'Secondary Vehicle View',
    description: 'Additional angle or detail',
  },
  {
    value: EvidenceIntent.REGISTRATION_UPDATE,
    label: 'Registration/Plate',
    description: 'License plate or registration tags',
  },
  {
    value: EvidenceIntent.HANDICAPPED_PLACARD,
    label: 'Handicapped Placard',
    description: 'Visible placard or tag',
  },
  {
    value: EvidenceIntent.GENERAL,
    label: 'General',
    description: 'Other documentation',
  },
];

export function PhotoIntentPicker({
  visible,
  onDismiss,
  onSelectIntent,
}: PhotoIntentPickerProps) {
  const handleSelect = (intent: string) => {
    onSelectIntent(intent);
    onDismiss();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Photo Purpose</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={styles.description}>
            What does this photo document?
          </Text>
          <View style={styles.optionsContainer}>
            {INTENT_OPTIONS.map((option) => (
              <View key={option.value} style={styles.optionItem}>
                <Button
                  mode="outlined"
                  onPress={() => handleSelect(option.value)}
                  style={styles.optionButton}
                  contentStyle={styles.buttonContent}
                >
                  <View style={styles.buttonText}>
                    <Text variant="bodyLarge" style={styles.optionLabel}>
                      {option.label}
                    </Text>
                    <Text variant="bodySmall" style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>
                </Button>
              </View>
            ))}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '80%',
  },
  description: {
    marginBottom: 16,
    color: '#666',
  },
  optionsContainer: {
    gap: 8,
  },
  optionItem: {
    marginBottom: 8,
  },
  optionButton: {
    justifyContent: 'flex-start',
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  buttonText: {
    alignItems: 'flex-start',
  },
  optionLabel: {
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDescription: {
    color: '#666',
    fontSize: 12,
  },
});
