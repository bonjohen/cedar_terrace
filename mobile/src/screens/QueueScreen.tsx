import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  Chip,
  Button,
  IconButton,
  Surface,
  ActivityIndicator,
} from 'react-native-paper';
import { useQueueStore } from '../store/queue-store';
import { syncObservations } from '../api/sync';
import type { QueueObservation, QueueStatus } from '../types';

export function QueueScreen() {
  const { observations, stats, loadQueue, updateStatus } = useQueueStore();
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadQueue();
    setRefreshing(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncObservations();
      await loadQueue(); // Refresh after sync
      Alert.alert('Sync Complete', 'All observations have been synchronized.');
    } catch (error) {
      Alert.alert('Sync Error', 'Failed to sync some observations. Please try again.');
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusColor = (status: QueueStatus): string => {
    switch (status) {
      case 'pending':
        return '#FFA726';
      case 'uploading':
      case 'submitting':
        return '#42A5F5';
      case 'submitted':
        return '#66BB6A';
      case 'failed':
        return '#EF5350';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: QueueStatus): string => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'uploading':
        return 'Uploading';
      case 'submitting':
        return 'Submitting';
      case 'submitted':
        return 'Submitted';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: QueueStatus): string => {
    switch (status) {
      case 'pending':
        return 'clock-outline';
      case 'uploading':
      case 'submitting':
        return 'sync';
      case 'submitted':
        return 'check-circle';
      case 'failed':
        return 'alert-circle';
      default:
        return 'help-circle';
    }
  };

  const renderObservationCard = (observation: QueueObservation) => {
    const statusColor = getStatusColor(observation.status);

    return (
      <Card key={observation.id} style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitle}>
              <Text variant="titleMedium" style={styles.licensePlate}>
                {observation.licensePlate || 'Unknown Plate'}
              </Text>
              {observation.issuingState && (
                <Chip mode="outlined" compact style={styles.stateChip}>
                  {observation.issuingState}
                </Chip>
              )}
            </View>
            <Chip
              mode="flat"
              icon={getStatusIcon(observation.status)}
              style={[styles.statusChip, { backgroundColor: statusColor }]}
              textStyle={styles.statusText}
            >
              {getStatusLabel(observation.status)}
            </Chip>
          </View>

          <View style={styles.metadata}>
            <View style={styles.metadataItem}>
              <Text variant="bodySmall" style={styles.metadataLabel}>
                Observed:
              </Text>
              <Text variant="bodySmall">
                {new Date(observation.observedAt).toLocaleString()}
              </Text>
            </View>

            {observation.parkingPositionId && (
              <View style={styles.metadataItem}>
                <Text variant="bodySmall" style={styles.metadataLabel}>
                  Position:
                </Text>
                <Text variant="bodySmall" numberOfLines={1}>
                  {observation.parkingPositionId}
                </Text>
              </View>
            )}

            {observation.errorMessage && (
              <View style={styles.errorContainer}>
                <Text variant="bodySmall" style={styles.errorText}>
                  Error: {observation.errorMessage}
                </Text>
              </View>
            )}

            {observation.backendObservationId && (
              <View style={styles.metadataItem}>
                <Text variant="bodySmall" style={styles.metadataLabel}>
                  Backend ID:
                </Text>
                <Text variant="bodySmall" numberOfLines={1}>
                  {observation.backendObservationId}
                </Text>
              </View>
            )}
          </View>

          {observation.status === 'failed' && (
            <Button
              mode="outlined"
              icon="sync"
              onPress={handleSync}
              style={styles.retryButton}
              compact
            >
              Retry
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Stats */}
      <Surface style={styles.header} elevation={2}>
        <Text variant="headlineMedium">Sync Queue</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text variant="displaySmall" style={styles.statValue}>
              {stats.total}
            </Text>
            <Text variant="bodySmall" style={styles.statLabel}>
              Total
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text
              variant="displaySmall"
              style={[styles.statValue, { color: '#FFA726' }]}
            >
              {stats.pending}
            </Text>
            <Text variant="bodySmall" style={styles.statLabel}>
              Pending
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text
              variant="displaySmall"
              style={[styles.statValue, { color: '#EF5350' }]}
            >
              {stats.failed}
            </Text>
            <Text variant="bodySmall" style={styles.statLabel}>
              Failed
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text
              variant="displaySmall"
              style={[styles.statValue, { color: '#66BB6A' }]}
            >
              {stats.submitted}
            </Text>
            <Text variant="bodySmall" style={styles.statLabel}>
              Submitted
            </Text>
          </View>
        </View>

        {/* Sync Button */}
        <Button
          mode="contained"
          icon={syncing ? undefined : 'sync'}
          onPress={handleSync}
          disabled={syncing || (stats.pending === 0 && stats.failed === 0)}
          style={styles.syncButton}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            `Sync Now (${stats.pending + stats.failed})`
          )}
        </Button>
      </Surface>

      {/* Queue List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {observations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="titleLarge" style={styles.emptyText}>
              No observations in queue
            </Text>
            <Text variant="bodyMedium" style={styles.emptySubtext}>
              Captured observations will appear here before syncing to the server
            </Text>
          </View>
        ) : (
          <>
            {observations
              .filter((obs) => obs.status !== 'submitted')
              .map(renderObservationCard)}

            {/* Show submitted observations separately */}
            {stats.submitted > 0 && (
              <>
                <Text variant="titleMedium" style={styles.submittedHeader}>
                  Recently Submitted ({stats.submitted})
                </Text>
                {observations
                  .filter((obs) => obs.status === 'submitted')
                  .map(renderObservationCard)}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
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
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#666',
    marginTop: 4,
  },
  syncButton: {
    marginTop: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  licensePlate: {
    fontWeight: '600',
  },
  stateChip: {
    height: 24,
  },
  statusChip: {
    marginLeft: 8,
  },
  statusText: {
    color: 'white',
    fontWeight: '600',
  },
  metadata: {
    gap: 8,
  },
  metadataItem: {
    flexDirection: 'row',
    gap: 8,
  },
  metadataLabel: {
    color: '#666',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  errorText: {
    color: '#C62828',
  },
  retryButton: {
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyText: {
    color: '#999',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#bbb',
    textAlign: 'center',
  },
  submittedHeader: {
    marginTop: 24,
    marginBottom: 12,
    color: '#666',
  },
});
