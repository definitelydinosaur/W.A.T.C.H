import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Cron } from '@nestjs/schedule';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';

type NotificationKind =
  | 'announcement_local'
  | 'announcement_institution'
  | 'weather_hazard'
  | 'institution'
  | 'local'
  | 'weather'
  | 'safety_tip'
  | 'system';

interface NotificationPreferences {
  announcements?: boolean;
  weather?: boolean;
  safety?: boolean;
  school?: boolean;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo: Expo;

  constructor(
    config: ConfigService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {
    this.expo = new Expo({
      accessToken: config.get<string>('EXPO_ACCESS_TOKEN'),
    });
  }

  async sendUserNotification(input: {
    userId: string;
    title: string;
    body: string;
    data: Record<string, string>;
    kind: NotificationKind;
    sourceName?: string | null;
    sourceUrl?: string | null;
    announcementId?: string;
    hazardId?: string;
    ignorePreferences?: boolean;
  }) {
    const hasAnnouncement = Boolean(input.announcementId);
    const hasHazard = Boolean(input.hazardId);
    if (hasAnnouncement === hasHazard) {
      throw new Error('Notification requires exactly one alert reference.');
    }
    const referenceColumn = hasAnnouncement ? 'announcement_id' : 'hazard_id';
    const referenceId = input.announcementId ?? input.hazardId!;
    if (input.kind === 'safety_tip' && !input.data.tip_key) {
      throw new Error('Safety-tip notifications require a stable tip_key.');
    }
    let priorQuery = this.supabase
      .from('notifications')
      .select('id')
      .eq('user_id', input.userId)
      .eq(referenceColumn, referenceId);
    if (input.kind === 'safety_tip') {
      priorQuery = priorQuery
        .eq('kind', 'safety_tip')
        .eq('data->>tip_key', input.data.tip_key);
    } else {
      priorQuery = priorQuery.neq('kind', 'safety_tip');
    }
    const { data: prior, error: priorError } = await priorQuery.maybeSingle();
    if (priorError) {
      throw new Error(
        `Notification dedupe check failed: ${priorError.message}`,
      );
    }
    if (prior) {
      return { sent: false, duplicate: true, deliveryError: null };
    }

    const { data: profile, error: profileError } = await this.supabase
      .from('user_info')
      .select('expo_push_token,notification_prefs')
      .eq('id', input.userId)
      .maybeSingle();
    if (profileError) {
      throw new Error(
        `Push preferences could not be loaded: ${profileError.message}`,
      );
    }
    const profileToken =
      typeof profile?.expo_push_token === 'string'
        ? profile.expo_push_token
        : null;
    const token = await this.getValidExpoPushToken(
      input.userId,
      profileToken,
    );
    const notificationPrefs = (profile?.notification_prefs ??
      {}) as NotificationPreferences;
    const allowsPush =
      input.ignorePreferences === true
        ? true
        : input.kind === 'weather_hazard' ||
            input.kind === 'weather' ||
            input.kind === 'safety_tip'
          ? notificationPrefs.weather !== false &&
            (input.kind !== 'safety_tip' || notificationPrefs.safety !== false)
          : input.kind === 'announcement_institution' ||
              input.kind === 'institution'
            ? (notificationPrefs.school ?? notificationPrefs.announcements) !==
              false
            : (notificationPrefs.safety ?? notificationPrefs.announcements) !==
              false;
    const body = this.ensureOpenAppInstruction(input.body);
    const title = input.title.trim().slice(0, 80) || 'W.A.T.C.H. Alert';

    const { data: notification, error: insertError } = await this.supabase
      .from('notifications')
      .insert({
        user_id: input.userId,
        announcement_id: input.announcementId ?? null,
        hazard_id: input.hazardId ?? null,
        kind: input.kind,
        source_name: input.sourceName ?? null,
        source_url: input.sourceUrl ?? null,
        title,
        body,
        data: {},
        status: 'Failed',
        delivery_error:
          !token || !Expo.isExpoPushToken(token)
            ? 'No valid Expo push token is registered.'
            : !allowsPush
              ? 'The user notification preferences prevent push delivery.'
              : null,
        expo_ticket_ids: [],
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insertError || !notification) {
      if (insertError?.code === '23505')
        return { sent: false, duplicate: true };
      throw new Error(
        `Notification record could not be saved: ${insertError?.message ?? 'No row returned'}`,
      );
    }
    const notificationId = String(notification.id);
    const pushData: Record<string, string> = {
      notification_id: notificationId,
      kind: input.kind === 'safety_tip' ? 'weather' : input.kind,
      ...(input.announcementId
        ? { announcement_id: input.announcementId }
        : { hazard_id: input.hazardId! }),
      source_url: input.sourceUrl ?? '',
      ...(input.kind === 'safety_tip' ? { tip_key: input.data.tip_key } : {}),
    };
    const { error: payloadError } = await this.supabase
      .from('notifications')
      .update({ data: pushData })
      .eq('id', notificationId);
    if (payloadError) {
      throw new Error(
        `Notification payload could not be saved: ${payloadError.message}`,
      );
    }
    if (!token || !Expo.isExpoPushToken(token) || !allowsPush) {
      if (token && !Expo.isExpoPushToken(token)) {
        this.logger.warn(
          `Ignoring invalid Expo token for user ${input.userId}.`,
        );
      }
      return {
        sent: false,
        duplicate: false,
        notificationId,
        noToken: !token || !Expo.isExpoPushToken(token),
        deliveryError:
          !token || !Expo.isExpoPushToken(token)
            ? 'No valid Expo push token is registered for this user.'
            : !allowsPush
              ? 'The user notification preferences prevent push delivery.'
              : null,
      };
    }

    const message: ExpoPushMessage = {
      to: token,
      title,
      body,
      data: pushData,
      sound: 'default',
      channelId: 'weather-alerts',
      priority: 'high',
    };
    let status: 'Sent' | 'Failed' = 'Failed';
    let receiptIds: string[] = [];
    let deliveryError: string | null = null;
    try {
      const tickets = await this.expo.sendPushNotificationsAsync([message]);
      receiptIds = tickets.flatMap((ticket) =>
        ticket.status === 'ok' ? [ticket.id] : [],
      );
      status = tickets.some((ticket) => ticket.status === 'ok')
        ? 'Sent'
        : 'Failed';
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          const ticketCode =
            ticket.details?.error && typeof ticket.details.error === 'string'
              ? `${ticket.details.error}: `
              : '';
          deliveryError = `${ticketCode}${ticket.message}`;
          this.logger.error(`Expo push rejected a message: ${ticket.message}`);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await this.clearInvalidToken(input.userId, token);
          }
        }
      }
    } catch (error) {
      deliveryError =
        error instanceof Error ? error.message : 'Unknown Expo push error.';
      this.logger.error(`Expo push request failed: ${deliveryError}`);
    }

    const { error: updateError } = await this.supabase
      .from('notifications')
      .update({
        status,
        expo_ticket_ids: receiptIds,
        delivery_error: status === 'Failed' ? deliveryError : null,
      })
      .eq('id', notificationId);
    if (updateError) {
      throw new Error(
        `Notification status update failed: ${updateError.message}`,
      );
    }
    return {
      sent: status === 'Sent',
      duplicate: false,
      notificationId,
      deliveryError: status === 'Failed' ? deliveryError : null,
    };
  }

  async sendTestPushToUser(userId: string) {
    const token = await this.getValidExpoPushToken(userId);
    if (!token) {
      return { sent: false, no_token: true, raw: null, delivery_error: 'No Expo push token is registered for this device.' };
    }
    const message: ExpoPushMessage = {
      to: token,
      title: 'W.A.T.C.H. test push',
      body: 'Test push from the admin panel.',
      data: { test_push: 'true' },
      sound: 'default',
      channelId: 'weather-alerts',
      priority: 'high',
    };
    try {
      const tickets = await this.expo.sendPushNotificationsAsync([message]);
      const ticket = tickets[0];
      if (ticket?.status === 'error') {
        const code =
          ticket.details?.error && typeof ticket.details.error === 'string'
            ? `${ticket.details.error}: `
            : '';
        return {
          sent: false,
          no_token: false,
          raw: tickets,
          delivery_error: `${code}${ticket.message}`,
        };
      }
      return { sent: ticket?.status === 'ok', no_token: false, raw: tickets, delivery_error: null };
    } catch (error) {
      const deliveryError =
        error instanceof Error ? error.message : 'Unknown Expo push error.';
      return { sent: false, no_token: false, raw: null, delivery_error: deliveryError };
    }
  }

  @Cron('*/1 * * * *', { waitForCompletion: true })
  async updateDeliveryReceipts() {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('notifications')
      .select('id,user_id,expo_ticket_ids')
      .eq('status', 'Sent')
      .lt('created_at', cutoff)
      .not('expo_ticket_ids', 'is', null)
      .limit(500);
    if (error) {
      this.logger.error(
        `Push receipt queue could not be loaded: ${error.message}`,
      );
      return;
    }
    for (const row of data ?? []) {
      const ticketIds = Array.isArray(row.expo_ticket_ids)
        ? row.expo_ticket_ids.filter(
            (ticketId): ticketId is string => typeof ticketId === 'string',
          )
        : [];
      if (!ticketIds.length) continue;
      try {
        const receipts =
          await this.expo.getPushNotificationReceiptsAsync(ticketIds);
        const values = Object.values(receipts);
        let invalidDevice = false;
        for (const receipt of values) {
          if (
            receipt.status === 'error' &&
            receipt.details?.error === 'DeviceNotRegistered'
          ) {
            invalidDevice = true;
          }
        }

        if (invalidDevice && typeof row.user_id === 'string') {
          const { error: profileError } = await this.supabase
            .from('user_info')
            .update({ expo_push_token: null })
            .eq('id', row.user_id);
          if (profileError) {
            this.logger.error(
              `Invalid Expo token could not be cleared: ${profileError.message}`,
            );
          }
          await this.supabase
            .from('push_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', row.user_id);
        }

        const status = values.some((receipt) => receipt.status === 'ok')
          ? 'Delivered'
          : values.some((receipt) => receipt.status === 'error')
            ? 'Failed'
            : null;
        if (!status) continue;
        const deliveryError =
          status === 'Failed'
            ? values
                .filter((receipt) => receipt.status === 'error')
                .map(
                  (receipt) => receipt.details?.error ?? 'Expo receipt error',
                )
                .join('; ')
            : null;
        const { error: updateError } = await this.supabase
          .from('notifications')
          .update({
            status,
            delivered_at:
              status === 'Delivered' ? new Date().toISOString() : null,
            expo_ticket_ids: [],
            delivery_error: deliveryError,
          })
          .eq('id', row.id);
        if (updateError) {
          this.logger.error(
            `Push delivery receipt could not be saved: ${updateError.message}`,
          );
        }
      } catch (receiptError) {
        this.logger.error(
          `Expo delivery receipt lookup failed: ${receiptError instanceof Error ? receiptError.message : 'Unknown error'}`,
        );
      }
    }
  }

  private async clearInvalidToken(userId: string, token: string) {
    const { error } = await this.supabase
      .from('user_info')
      .update({ expo_push_token: null })
      .eq('id', userId)
      .eq('expo_push_token', token);
    if (error) {
      this.logger.error(
        `Invalid Expo token could not be cleared: ${error.message}`,
      );
    }
    const { error: tokenError } = await this.supabase
      .from('push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('expo_push_token', token);
    if (tokenError) {
      this.logger.error(
        `Invalid registered Expo token could not be disabled: ${tokenError.message}`,
      );
    }
  }

  private async getValidExpoPushToken(
    userId: string,
    profileToken?: string | null,
  ): Promise<string | null> {
    let token = profileToken;
    if (token === undefined) {
      const { data: profile, error: profileError } = await this.supabase
        .from('user_info')
        .select('expo_push_token')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) {
        throw new Error(
          `Push token could not be loaded: ${profileError.message}`,
        );
      }
      token =
        typeof profile?.expo_push_token === 'string'
          ? profile.expo_push_token
          : null;
    }
    if (typeof token === 'string' && Expo.isExpoPushToken(token)) {
      return token;
    }

    const { data: pushTokens, error: tokenError } = await this.supabase
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(50)
      .overrideTypes<{ expo_push_token: string }[], { merge: false }>();
    if (tokenError) {
      throw new Error(
        `Registered push token could not be loaded: ${tokenError.message}`,
      );
    }
    return (
      pushTokens?.find(
        (pushToken) =>
          typeof pushToken.expo_push_token === 'string' &&
          Expo.isExpoPushToken(pushToken.expo_push_token),
      )?.expo_push_token ?? null
    );
  }

  private ensureOpenAppInstruction(body: string) {
    const instruction = 'Open app to see full details';
    const trimmedBody = body.trimEnd();
    return trimmedBody.endsWith(instruction)
      ? trimmedBody
      : `${trimmedBody}\n${instruction}`;
  }
}
