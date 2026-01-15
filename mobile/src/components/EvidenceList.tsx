import React from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import { Card, Text, IconButton, Chip } from 'react-native-paper';
import type { LocalPhoto, TextNote } from '../types';

interface EvidenceListProps {
  photos: LocalPhoto[];
  notes: TextNote[];
  onRemovePhoto: (uri: string) => void;
  onRemoveNote: (index: number) => void;
  readOnly?: boolean;
}

export function EvidenceList({
  photos,
  notes,
  onRemovePhoto,
  onRemoveNote,
  readOnly = false,
}: EvidenceListProps) {
  const totalItems = photos.length + notes.length;

  if (totalItems === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text variant="bodyLarge" style={styles.emptyText}>
          No evidence added yet
        </Text>
        <Text variant="bodySmall" style={styles.emptySubtext}>
          Tap "Add Photo" or "Add Note" to document evidence
        </Text>
      </View>
    );
  }

  const formatIntent = (intent: string): string => {
    return intent
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <ScrollView style={styles.container}>
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Evidence ({totalItems} item{totalItems !== 1 ? 's' : ''})
      </Text>

      {/* Photos */}
      {photos.map((photo, index) => (
        <Card key={photo.uri} style={styles.evidenceCard}>
          <View style={styles.photoContainer}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            <View style={styles.photoInfo}>
              <View style={styles.photoHeader}>
                <Text variant="bodyLarge" style={styles.photoTitle}>
                  Photo {index + 1}
                </Text>
                {!readOnly && (
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => onRemovePhoto(photo.uri)}
                    style={styles.removeButton}
                  />
                )}
              </View>
              <Chip mode="outlined" compact style={styles.intentChip}>
                {formatIntent(photo.intent)}
              </Chip>
              <Text variant="bodySmall" style={styles.timestamp}>
                {new Date(photo.capturedAt).toLocaleTimeString()}
              </Text>
            </View>
          </View>
        </Card>
      ))}

      {/* Text Notes */}
      {notes.map((note, index) => (
        <Card key={index} style={styles.evidenceCard}>
          <Card.Content>
            <View style={styles.noteHeader}>
              <Text variant="titleMedium">Text Note {index + 1}</Text>
              {!readOnly && (
                <IconButton
                  icon="close"
                  size={20}
                  onPress={() => onRemoveNote(index)}
                  style={styles.removeButton}
                />
              )}
            </View>
            <Text variant="bodyMedium" style={styles.noteText}>
              {note.text}
            </Text>
            {note.intent && (
              <Chip mode="outlined" compact style={styles.intentChip}>
                {formatIntent(note.intent)}
              </Chip>
            )}
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#bbb',
    textAlign: 'center',
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  evidenceCard: {
    marginBottom: 12,
  },
  photoContainer: {
    flexDirection: 'row',
    padding: 12,
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  photoInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  photoTitle: {
    fontWeight: '600',
  },
  removeButton: {
    margin: 0,
  },
  intentChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  timestamp: {
    color: '#999',
    marginTop: 4,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteText: {
    marginBottom: 8,
    lineHeight: 20,
  },
});
