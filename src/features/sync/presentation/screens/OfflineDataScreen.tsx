import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { formatAge } from '@/features/weather/presentation/format';
import {
  AppButton,
  AppCard,
  AppIcon,
  AppLoader,
  AppText,
  InlineMessage,
  Screen,
  SettingsSection,
  type AppIconName,
} from '@/shared/ui';

import { describeConnection, formatBytes } from '../format';
import { useOfflineData } from '../hooks/useOfflineData';

/**
 * Settings › Offline and data: whether the device is online, what works offline,
 * which changes exist only on this device, and the saved copies of destination
 * information (with a way to clear them). Says plainly that nothing is backed up
 * to a cloud, because Wanderly has no backend.
 */
export function OfflineDataScreen() {
  const { t, i18n } = useTranslation();
  const data = useOfflineData();
  const { connectivity, sync, saved } = data;
  const { spacing } = useAppTheme();
  const column = [styles.column, { gap: spacing.md }];
  const [confirmClear, setConfirmClear] = useState(false);
  const localOnly = sync.mode === 'localOnly';

  return (
    <Screen>
      <SettingsSection title={t('offline.screen.connectionTitle')}>
        <AppCard testID="offline-connection">
          <Row
            icon={connectivity.isOffline ? 'offline' : 'online'}
            tone={connectivity.isOffline ? 'warning' : 'success'}
            title={describeConnection(connectivity, t)}
            body={connectivity.isOffline ? t('offline.screen.offlineHint') : t('offline.screen.onlineHint')}
          />
        </AppCard>
      </SettingsSection>

      <SettingsSection title={t('offline.screen.yourDataTitle')} caption={t('offline.screen.yourDataHint')}>
        <AppCard testID="offline-changes">
          <View style={column}>
            {sync.phase === 'error' ? (
              <InlineMessage message={t(getErrorMessageKey('storage'))} />
            ) : (
              <Row
                icon={localOnly ? 'storage' : 'cloud'}
                tone="primary"
                title={
                  sync.pending === 0
                    ? t('offline.screen.noUnsynced')
                    : localOnly
                      ? t('offline.screen.unsynced', { count: sync.pending })
                      : t('offline.screen.waiting', { count: sync.pending })
                }
                body={localOnly ? `${t('offline.screen.localOnly')} ${t('offline.screen.unsyncedHint')}` : undefined}
              />
            )}
            {sync.failed > 0 ? (
              <>
                <InlineMessage tone="warning" message={t('offline.screen.failed', { count: sync.failed })} />
                <AppButton
                  label={t('offline.screen.retryFailed')}
                  variant="outline"
                  leftIcon="refresh"
                  onPress={data.retryFailedChanges}
                />
              </>
            ) : null}
          </View>
        </AppCard>
      </SettingsSection>

      <SettingsSection title={t('offline.screen.savedInfoTitle')} caption={t('offline.screen.savedInfoHint')}>
        <AppCard testID="offline-saved-info">
          {saved.status === 'loading' ? (
            <AppLoader />
          ) : saved.status === 'failed' ? (
            <View style={column}>
              <InlineMessage message={t(getErrorMessageKey(saved.errorKind))} />
              <AppButton label={t('common.tryAgain')} variant="outline" onPress={data.retrySaved} />
            </View>
          ) : (
            <View style={column}>
              <Row
                icon="history"
                tone="primary"
                title={
                  saved.summary.entries === 0
                    ? t('offline.screen.savedInfoEmpty')
                    : t('offline.screen.savedInfoCount', {
                        count: saved.summary.entries,
                        size: formatBytes(saved.summary.bytes, i18n.language),
                      })
                }
                body={
                  saved.summary.newestStoredAt === null
                    ? undefined
                    : t('offline.screen.savedInfoUpdated', {
                        age: formatAge(Math.max(0, data.now - saved.summary.newestStoredAt), t),
                      })
                }
              />
              {data.clearResult === 'cleared' ? (
                <InlineMessage
                  tone="success"
                  message={t('offline.screen.cleared')}
                  dismissLabel={t('common.dismiss')}
                  onDismiss={data.dismissClearResult}
                />
              ) : data.clearResult ? (
                <InlineMessage
                  message={t(getErrorMessageKey(data.clearResult))}
                  dismissLabel={t('common.dismiss')}
                  onDismiss={data.dismissClearResult}
                />
              ) : null}
              {saved.summary.entries > 0 ? (
                <AppButton
                  label={t('offline.screen.clearSaved')}
                  variant="outline"
                  leftIcon="trash"
                  loading={data.clearing}
                  onPress={() => setConfirmClear(true)}
                />
              ) : null}
            </View>
          )}
        </AppCard>
      </SettingsSection>

      <ConfirmSheet
        visible={confirmClear}
        title={t('offline.screen.clearConfirmTitle')}
        message={t('offline.screen.clearConfirmMessage')}
        confirmLabel={t('offline.screen.clearConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setConfirmClear(false);
          data.clearSaved();
        }}
        onCancel={() => setConfirmClear(false)}
        testID="clear-saved-sheet"
      />
    </Screen>
  );
}

function Row({
  icon,
  tone,
  title,
  body,
}: {
  icon: AppIconName;
  tone: 'primary' | 'success' | 'warning';
  title: string;
  body?: string;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <AppIcon name={icon} size="md" color={tone} />
      <View style={[styles.fill, { gap: spacing.xxs }]}>
        <AppText variant="headline">{title}</AppText>
        {body ? <AppText color="textSecondary">{body}</AppText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  fill: { flex: 1 },
  column: { flexDirection: 'column' },
});
