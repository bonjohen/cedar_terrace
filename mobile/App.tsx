import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CaptureScreen, QueueScreen } from './src/screens';
import { initializeDatabase } from './src/services/database';
import { useCaptureStore } from './src/store/capture-store';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';

const Tab = createBottomTabNavigator();

// Simple Settings placeholder screen
function SettingsScreen() {
  const { siteId, setSite } = useCaptureStore();

  return (
    <View style={styles.settingsContainer}>
      <Text variant="headlineMedium" style={styles.settingsTitle}>
        Settings
      </Text>
      <Text variant="bodyMedium" style={styles.settingsText}>
        Current Site ID: {siteId || 'Not Set'}
      </Text>
      <Button
        mode="contained"
        onPress={() => setSite('site-001')}
        style={styles.settingsButton}
      >
        Set Default Site (site-001)
      </Button>
      <Text variant="bodySmall" style={styles.settingsNote}>
        Note: Full settings configuration will be added in later phases
      </Text>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    // Initialize SQLite database on app startup
    initializeDatabase().catch((error) => {
      console.error('Failed to initialize database:', error);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <PaperProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              tabBarIcon: ({ focused, color, size }) => {
                let iconName: keyof typeof MaterialCommunityIcons.glyphMap;

                if (route.name === 'Capture') {
                  iconName = 'camera';
                } else if (route.name === 'Queue') {
                  iconName = 'sync';
                } else if (route.name === 'Settings') {
                  iconName = 'cog';
                } else {
                  iconName = 'help-circle';
                }

                return (
                  <MaterialCommunityIcons
                    name={iconName}
                    size={size}
                    color={color}
                  />
                );
              },
              tabBarActiveTintColor: '#6200EE',
              tabBarInactiveTintColor: 'gray',
              headerShown: false,
            })}
          >
            <Tab.Screen
              name="Capture"
              component={CaptureScreen}
              options={{ tabBarLabel: 'Capture' }}
            />
            <Tab.Screen
              name="Queue"
              component={QueueScreen}
              options={{ tabBarLabel: 'Queue' }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ tabBarLabel: 'Settings' }}
            />
          </Tab.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  settingsContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  settingsTitle: {
    marginBottom: 24,
    marginTop: 40,
  },
  settingsText: {
    marginBottom: 16,
  },
  settingsButton: {
    marginBottom: 16,
  },
  settingsNote: {
    color: '#666',
    fontStyle: 'italic',
  },
});
