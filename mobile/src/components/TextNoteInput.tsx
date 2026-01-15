import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text, Dialog, Portal } from 'react-native-paper';

interface TextNoteInputProps {
  visible: boolean;
  onDismiss: () => void;
  onSave: (text: string) => void;
}

export function TextNoteInput({
  visible,
  onDismiss,
  onSave,
}: TextNoteInputProps) {
  const [noteText, setNoteText] = useState('');

  const handleSave = () => {
    const trimmed = noteText.trim();
    if (trimmed.length === 0) {
      return;
    }
    onSave(trimmed);
    setNoteText('');
    onDismiss();
  };

  const handleCancel = () => {
    setNoteText('');
    onDismiss();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleCancel} style={styles.dialog}>
        <Dialog.Title>Add Text Note</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={styles.description}>
            Document conditions, context, or observations that aren't captured in photos.
          </Text>
          <TextInput
            mode="outlined"
            label="Note"
            value={noteText}
            onChangeText={setNoteText}
            multiline
            numberOfLines={5}
            style={styles.textInput}
            placeholder="e.g., Vehicle parked across two spaces, blocking fire lane..."
            autoFocus
          />
          <Text variant="bodySmall" style={styles.charCount}>
            {noteText.length} / 500 characters
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleCancel}>Cancel</Button>
          <Button
            onPress={handleSave}
            mode="contained"
            disabled={noteText.trim().length === 0}
          >
            Save Note
          </Button>
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
  textInput: {
    marginBottom: 8,
    minHeight: 120,
  },
  charCount: {
    textAlign: 'right',
    color: '#999',
  },
});
