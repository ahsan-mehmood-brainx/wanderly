import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type BudgetDependencies } from '@/features/budget/di';
import { type ItineraryDependencies } from '@/features/itinerary/di';
import { type PreferencesDependencies } from '@/features/preferences/di';
import { type TripsDependencies } from '@/features/trips/di';

import { ExpoBackgroundRefreshService } from './data/ExpoBackgroundRefreshService';
import { ExpoNotificationResponses } from './data/ExpoNotificationResponses';
import { ExpoNotificationService, UnsupportedNotificationService } from './data/ExpoNotificationService';
import { StorageNotificationRepository } from './data/StorageNotificationRepository';
import { SystemDeviceTimeZone } from './data/SystemDeviceTimeZone';
import { type NotificationPermission } from './domain/Notification';
import { type NotificationSettings, type NotificationSettingsChanges } from './domain/NotificationSettings';
import {
  type BackgroundRefreshService,
  type DeviceTimeZone,
  type NotificationRepository,
  type NotificationResponses,
  type NotificationService,
  type NotificationText,
} from './domain/repositories';
import {
  ClearNotifications,
  GetNotificationPermission,
  GetNotificationSettings,
  NotificationSignOuts,
  type ReconcileInput,
  ReconcileNotifications,
  type ReconcileSummary,
  RequestNotificationPermission,
  SaveNotificationSettings,
} from './domain/usecases/notificationUseCases';

export interface NotificationsDependencies {
  readonly notificationService: NotificationService;
  readonly notificationRepository: NotificationRepository;
  readonly notificationTimeZone: DeviceTimeZone;
  readonly notificationText: NotificationText;
  readonly backgroundRefreshService: BackgroundRefreshService;
  readonly notificationResponses: NotificationResponses;
  /** Shared by reconcile and clear, so a sign-out stops a reconcile already running. */
  readonly notificationSignOuts: NotificationSignOuts;
  readonly reconcileNotifications: UseCase<ReconcileInput, Result<ReconcileSummary, AppError>>;
  readonly clearNotifications: UseCase<void, Result<void, AppError>>;
  readonly getNotificationPermission: UseCase<void, NotificationPermission>;
  readonly requestNotificationPermission: UseCase<SupportedLanguage, NotificationPermission>;
  readonly getNotificationSettings: UseCase<void, Result<NotificationSettings, AppError>>;
  readonly saveNotificationSettings: UseCase<NotificationSettingsChanges, Result<NotificationSettings, AppError>>;
}

/**
 * `notificationText` has no factory here: it must use the app's own i18n instance, which only the
 * composition root has (a second instance would replace react-i18next's global one).
 */
export const notificationsFactories: Factories<
  Omit<NotificationsDependencies, 'notificationText'>,
  CoreDependencies &
    Pick<TripsDependencies, 'tripRepository' | 'tripOwnerProvider'> &
    Pick<ItineraryDependencies, 'activityRepository'> &
    Pick<BudgetDependencies, 'expenseRepository'> &
    Pick<PreferencesDependencies, 'preferencesRepository'> &
    NotificationsDependencies
> = {
  notificationService: (c) =>
    Platform.OS === 'web'
      ? new UnsupportedNotificationService()
      : new ExpoNotificationService(c.logger.child({ scope: 'notifications' })),
  notificationRepository: (c) =>
    new StorageNotificationRepository(c.keyValueStore, c.logger.child({ scope: 'notificationStorage' })),
  notificationTimeZone: () => new SystemDeviceTimeZone(),
  backgroundRefreshService: (c) => new ExpoBackgroundRefreshService(c.logger.child({ scope: 'backgroundRefresh' })),
  notificationResponses: (c) => new ExpoNotificationResponses(c.logger.child({ scope: 'notificationResponses' })),
  notificationSignOuts: () => new NotificationSignOuts(),
  reconcileNotifications: (c) =>
    new ReconcileNotifications({
      notificationService: c.notificationService,
      notificationRepository: c.notificationRepository,
      timeZone: c.notificationTimeZone,
      text: c.notificationText,
      backgroundRefresh: c.backgroundRefreshService,
      preferencesRepository: c.preferencesRepository,
      tripRepository: c.tripRepository,
      activityRepository: c.activityRepository,
      expenseRepository: c.expenseRepository,
      tripOwnerProvider: c.tripOwnerProvider,
      signOuts: c.notificationSignOuts,
      clock: c.clock,
      deviceLanguages: () => getLocales().map((locale) => locale.languageCode),
      logger: c.logger.child({ scope: 'reconcileNotifications' }),
    }),
  clearNotifications: (c) =>
    new ClearNotifications({
      notificationService: c.notificationService,
      notificationRepository: c.notificationRepository,
      backgroundRefresh: c.backgroundRefreshService,
      signOuts: c.notificationSignOuts,
      logger: c.logger.child({ scope: 'clearNotifications' }),
    }),
  getNotificationPermission: (c) => new GetNotificationPermission(c.notificationService),
  requestNotificationPermission: (c) => new RequestNotificationPermission(c.notificationService, c.notificationText),
  getNotificationSettings: (c) => new GetNotificationSettings(c.notificationRepository),
  saveNotificationSettings: (c) => new SaveNotificationSettings(c.notificationRepository, c.logger),
};
