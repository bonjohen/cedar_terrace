import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { CameraView as ExpoCamera, CameraType, useCameraPermissions } from 'expo-camera';
import { Button, IconButton } from 'react-native-paper';
import * as ImageManipulator from 'expo-image-manipulator';

interface CameraViewProps {
  onPhotoCapture: (uri: string) => void;
  onClose: () => void;
}

export function CameraView({ onPhotoCapture, onClose }: CameraViewProps) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<ExpoCamera>(null);

  if (!permission) {
    // Camera permissions are still loading
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          We need your permission to use the camera
        </Text>
        <Button mode="contained" onPress={requestPermission}>
          Grant Permission
        </Button>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo) {
        Alert.alert('Error', 'Failed to capture photo');
        return;
      }

      // Compress and resize the image for storage efficiency
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1920 } }], // Max width 1920px, maintain aspect ratio
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      onPhotoCapture(manipulatedImage.uri);
      onClose();
    } catch (error) {
      console.error('Error capturing photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  return (
    <View style={styles.container}>
      <ExpoCamera style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.header}>
          <IconButton
            icon="close"
            iconColor="white"
            size={30}
            onPress={onClose}
          />
        </View>

        <View style={styles.controls}>
          <IconButton
            icon="camera-flip"
            iconColor="white"
            size={40}
            onPress={toggleCameraFacing}
            style={styles.flipButton}
          />

          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>

          <View style={styles.placeholder} />
        </View>
      </ExpoCamera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingTop: 40,
    paddingHorizontal: 10,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  flipButton: {
    flex: 1,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  placeholder: {
    flex: 1,
  },
  permissionText: {
    textAlign: 'center',
    color: 'white',
    fontSize: 16,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
});
