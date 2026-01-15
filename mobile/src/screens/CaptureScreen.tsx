import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  Text,
  Button,
  TextInput,
  SegmentedButtons,
  Surface,
  Divider,
} from 'react-native-paper';
import { useCaptureStore } from '../store/capture-store';
import { useQueueStore } from '../store/queue-store';
import { CameraView } from '../components/CameraView';
import { PhotoIntentPicker } from '../components/PhotoIntentPicker';
import { TextNoteInput } from '../components/TextNoteInput';
import { EvidenceList } from '../components/EvidenceList';

type CaptureStep = 'vehicle' | 'evidence' | 'review';

export function CaptureScreen() {
  const [currentStep, setCurrentStep] = useState<CaptureStep>('vehicle');
  const [showCamera, setShowCamera] = useState(false);
  const [showIntentPicker, setShowIntentPicker] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);

  const {
    licensePlate,
    issuingState,
    registrationMonth,
    registrationYear,
    photos,
    notes,
    setVehicleInfo,
    addPhoto,
    removePhoto,
    addNote,
    removeNote,
    hasMinimumEvidence,
    resetCapture,
  } = useCaptureStore();

  const { addToQueue } = useQueueStore();

  // Vehicle info state
  const [plateInput, setPlateInput] = useState(licensePlate);
  const [stateInput, setStateInput] = useState(issuingState);
  const [monthInput, setMonthInput] = useState(
    registrationMonth?.toString() || ''
  );
  const [yearInput, setYearInput] = useState(registrationYear?.toString() || '');

  const handleNextStep = () => {
    if (currentStep === 'vehicle') {
      // Validate and save vehicle info
      if (!plateInput.trim()) {
        Alert.alert('Required', 'Please enter a license plate number');
        return;
      }
      if (!stateInput.trim()) {
        Alert.alert('Required', 'Please enter an issuing state');
        return;
      }

      setVehicleInfo(
        plateInput,
        stateInput,
        monthInput ? parseInt(monthInput) : undefined,
        yearInput ? parseInt(yearInput) : undefined
      );
      setCurrentStep('evidence');
    } else if (currentStep === 'evidence') {
      if (!hasMinimumEvidence()) {
        Alert.alert(
          'Evidence Required',
          'Please add at least one photo or text note before continuing.'
        );
        return;
      }
      setCurrentStep('review');
    }
  };

  const handlePreviousStep = () => {
    if (currentStep === 'review') {
      setCurrentStep('evidence');
    } else if (currentStep === 'evidence') {
      setCurrentStep('vehicle');
    }
  };

  const handlePhotoCapture = (uri: string) => {
    setPendingPhotoUri(uri);
    setShowIntentPicker(true);
  };

  const handleIntentSelect = (intent: string) => {
    if (pendingPhotoUri) {
      addPhoto(pendingPhotoUri, intent);
      setPendingPhotoUri(null);
    }
  };

  const handleAddNote = (text: string) => {
    addNote(text);
  };

  const handleSubmit = async () => {
    try {
      await addToQueue();
      Alert.alert(
        'Observation Queued',
        'The observation has been added to the sync queue.',
        [
          {
            text: 'OK',
            onPress: () => {
              resetCapture();
              setCurrentStep('vehicle');
              setPlateInput('');
              setStateInput('');
              setMonthInput('');
              setYearInput('');
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to queue observation. Please try again.');
      console.error('Queue error:', error);
    }
  };

  if (showCamera) {
    return (
      <CameraView
        onPhotoCapture={handlePhotoCapture}
        onClose={() => setShowCamera(false)}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text variant="headlineMedium">Capture Observation</Text>
        <SegmentedButtons
          value={currentStep}
          onValueChange={(value) => setCurrentStep(value as CaptureStep)}
          buttons={[
            { value: 'vehicle', label: 'Vehicle' },
            { value: 'evidence', label: 'Evidence', disabled: !licensePlate },
            {
              value: 'review',
              label: 'Review',
              disabled: !hasMinimumEvidence(),
            },
          ]}
          style={styles.stepIndicator}
        />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Vehicle Information Step */}
        {currentStep === 'vehicle' && (
          <Surface style={styles.section} elevation={1}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Vehicle Information
            </Text>
            <TextInput
              mode="outlined"
              label="License Plate *"
              value={plateInput}
              onChangeText={setPlateInput}
              autoCapitalize="characters"
              style={styles.input}
              placeholder="ABC1234"
            />
            <TextInput
              mode="outlined"
              label="Issuing State *"
              value={stateInput}
              onChangeText={setStateInput}
              autoCapitalize="characters"
              maxLength={2}
              style={styles.input}
              placeholder="CA"
            />
            <View style={styles.row}>
              <TextInput
                mode="outlined"
                label="Reg. Month"
                value={monthInput}
                onChangeText={setMonthInput}
                keyboardType="numeric"
                maxLength={2}
                style={[styles.input, styles.halfWidth]}
                placeholder="12"
              />
              <TextInput
                mode="outlined"
                label="Reg. Year"
                value={yearInput}
                onChangeText={setYearInput}
                keyboardType="numeric"
                maxLength={4}
                style={[styles.input, styles.halfWidth]}
                placeholder="2024"
              />
            </View>
          </Surface>
        )}

        {/* Evidence Collection Step */}
        {currentStep === 'evidence' && (
          <View style={styles.section}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Evidence Collection
            </Text>
            <View style={styles.buttonRow}>
              <Button
                mode="contained"
                icon="camera"
                onPress={() => setShowCamera(true)}
                style={styles.actionButton}
              >
                Add Photo
              </Button>
              <Button
                mode="outlined"
                icon="note-text"
                onPress={() => setShowNoteInput(true)}
                style={styles.actionButton}
              >
                Add Note
              </Button>
            </View>
            <Divider style={styles.divider} />
            <EvidenceList
              photos={photos}
              notes={notes}
              onRemovePhoto={removePhoto}
              onRemoveNote={removeNote}
            />
          </View>
        )}

        {/* Review Step */}
        {currentStep === 'review' && (
          <View style={styles.section}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Review & Submit
            </Text>

            <Surface style={styles.reviewSection} elevation={1}>
              <Text variant="titleMedium">Vehicle Information</Text>
              <View style={styles.reviewItem}>
                <Text variant="bodySmall" style={styles.reviewLabel}>
                  License Plate:
                </Text>
                <Text variant="bodyLarge" style={styles.reviewValue}>
                  {licensePlate} ({issuingState})
                </Text>
              </View>
              {registrationMonth && registrationYear && (
                <View style={styles.reviewItem}>
                  <Text variant="bodySmall" style={styles.reviewLabel}>
                    Registration:
                  </Text>
                  <Text variant="bodyMedium">
                    {registrationMonth}/{registrationYear}
                  </Text>
                </View>
              )}
            </Surface>

            <Divider style={styles.divider} />

            <EvidenceList
              photos={photos}
              notes={notes}
              onRemovePhoto={removePhoto}
              onRemoveNote={removeNote}
              readOnly
            />
          </View>
        )}
      </ScrollView>

      {/* Navigation Buttons */}
      <Surface style={styles.footer} elevation={4}>
        {currentStep !== 'vehicle' && (
          <Button mode="outlined" onPress={handlePreviousStep}>
            Previous
          </Button>
        )}
        {currentStep !== 'review' ? (
          <Button
            mode="contained"
            onPress={handleNextStep}
            style={styles.nextButton}
          >
            Next
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={handleSubmit}
            style={styles.nextButton}
          >
            Submit to Queue
          </Button>
        )}
      </Surface>

      {/* Dialogs */}
      <PhotoIntentPicker
        visible={showIntentPicker}
        onDismiss={() => {
          setShowIntentPicker(false);
          setPendingPhotoUri(null);
        }}
        onSelectIntent={handleIntentSelect}
      />
      <TextNoteInput
        visible={showNoteInput}
        onDismiss={() => setShowNoteInput(false)}
        onSave={handleAddNote}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  stepIndicator: {
    marginTop: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: '600',
  },
  input: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
  },
  divider: {
    marginVertical: 16,
  },
  reviewSection: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  reviewItem: {
    marginTop: 8,
  },
  reviewLabel: {
    color: '#666',
    marginBottom: 4,
  },
  reviewValue: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  nextButton: {
    flex: 1,
    marginLeft: 12,
  },
});
