import { apiClient } from '@/lib/shared/api-client';
import type { UserNotificationPreferences } from '@/store/shared/use-notification-preferences-store';

export interface NotificationPreferencesResponse {
  preferences: UserNotificationPreferences;
}

export const notificationPreferencesApi = {
  get() {
    return apiClient.get<NotificationPreferencesResponse>('/admin/me/notification-preferences');
  },
  put(preferences: UserNotificationPreferences) {
    return apiClient.put<NotificationPreferencesResponse>(
      '/admin/me/notification-preferences',
      preferences,
    );
  },
};
