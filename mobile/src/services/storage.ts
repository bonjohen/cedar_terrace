import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const KEYS = {
  USER_ID: '@cedar_terrace:userId',
  SELECTED_SITE_ID: '@cedar_terrace:selectedSiteId',
  SYNC_TIMESTAMP: '@cedar_terrace:syncTimestamp',
  PHOTO_QUALITY: '@cedar_terrace:photoQuality',
} as const;

/**
 * Get user ID
 */
export async function getUserId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.USER_ID);
}

/**
 * Set user ID
 */
export async function setUserId(userId: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER_ID, userId);
}

/**
 * Clear user ID
 */
export async function clearUserId(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.USER_ID);
}

/**
 * Get selected site ID
 */
export async function getSelectedSiteId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.SELECTED_SITE_ID);
}

/**
 * Set selected site ID
 */
export async function setSelectedSiteId(siteId: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.SELECTED_SITE_ID, siteId);
}

/**
 * Get last sync timestamp
 */
export async function getSyncTimestamp(): Promise<Date | null> {
  const timestamp = await AsyncStorage.getItem(KEYS.SYNC_TIMESTAMP);
  return timestamp ? new Date(timestamp) : null;
}

/**
 * Set last sync timestamp
 */
export async function setSyncTimestamp(timestamp: Date): Promise<void> {
  await AsyncStorage.setItem(KEYS.SYNC_TIMESTAMP, timestamp.toISOString());
}

/**
 * Get photo quality setting
 */
export async function getPhotoQuality(): Promise<'low' | 'medium' | 'high'> {
  const quality = await AsyncStorage.getItem(KEYS.PHOTO_QUALITY);
  return (quality as 'low' | 'medium' | 'high') || 'medium';
}

/**
 * Set photo quality setting
 */
export async function setPhotoQuality(quality: 'low' | 'medium' | 'high'): Promise<void> {
  await AsyncStorage.setItem(KEYS.PHOTO_QUALITY, quality);
}

/**
 * Clear all storage
 */
export async function clearAllStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEYS.USER_ID,
    KEYS.SELECTED_SITE_ID,
    KEYS.SYNC_TIMESTAMP,
    KEYS.PHOTO_QUALITY,
  ]);
}
