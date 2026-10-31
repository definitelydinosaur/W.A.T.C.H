import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Cron } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase/supabase.provider';

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
    announcementId?: string;
    hazardId?: string;
  }) {
    const reference = input.announcementId
      ? { announcement_id: input.announcementId }
      : { hazard_id: input.hazardId };
    const column = input.announcementId ? 'announcement_id' : 'hazard_id';
    const referenceId = input.announcementId ?? input.hazardId;
    if (!referenceId)
      throw new Error('Notification requires an alert reference.');

    const { data: prior, error: priorError } = await this.supabase
      .from('notifications')
      .select('id')
      .eq('user_id', input.userId)
      .eq(column, referenceId)
      .maybeSingle();
    if (priorError)
      throw new Error(
        `Notification dedupe check failed: ${priorError.message}`,
      );
    if (prior) return { sent: false, duplicate: true };

    const insertResult = await this.supabase
      .from('notifications')
      .insert({
        user_id: input.userId,
        ...reference,
        title: input.title,
        body: input.body,
        data: input.data,
        status: 'Failed',
      })
      .select('id')
      .single();
    const notification = insertResult.data;
    const insertError = insertResult.error;
    if (insertError || !notification) {
      if (insertError?.code === '23505')
        return { sent: false, duplicate: true };
      throw new Error(
        `Notification record could not be saved: ${insertError?.message ?? 'No row returned'}`,
      );
    }
    const notificationId = String(notification.id);

    const tokenResult = await this.supabase
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', input.userId)
      .eq('is_active', true);
    const rows: unknown = tokenResult.data;
    const tokens: string[] = Array.isArray(rows)
      ? rows.filter(isPushTokenRow).map((item) => item.expo_push_token)
      : [];
    const tokenError = tokenResult.error;
    if (tokenError)
      throw new Error(`Push tokens could not be loaded: ${tokenError.message}`);

    const messages: ExpoPushMessage[] = tokens
      .filter((token) => Expo.isExpoPushToken(token))
      .map((to) => ({
        to,
        title: input.title,
        body: input.body,
        data: { ...input.data, notificationId },
        sound: 'default',
        channelId: 'weather-alerts',
      }));

    let status: 'Sent' | 'Failed' = 'Failed';
    let receiptIds: string[] = [];
    if (messages.length) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(messages);
        receiptIds = tickets.flatMap((ticket) =>
          ticket.status === 'ok' ? [ticket.id] : [],
        );
        status = tickets.some((ticket) => ticket.status === 'ok')
          ? 'Sent'
          : 'Failed';
        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            this.logger.error(
              `Expo push rejected a message: ${ticket.message}`,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Expo push request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    function isPushTokenRow(
      value: unknown,
    ): value is { expo_push_token: string } {
      return (
        typeof value === 'object' &&
        value !== null &&
        'expo_push_token' in value &&
        typeof value.expo_push_token === 'string'
      );
    }

    const { error: updateError } = await this.supabase
      .from('notifications')
      .update({ status, expo_ticket_ids: receiptIds })
      .eq('id', notificationId);
    if (updateError)
      throw new Error(
        `Notification status update failed: ${updateError.message}`,
      );

    const { error: historyError } = await this.supabase
      .from('alert_history')
      .insert({
        user_id: input.userId,
        notification_id: notificationId,
        announcement_id: input.announcementId ?? null,
        hazard_id: input.hazardId ?? null,
      });
    if (historyError)
      throw new Error(
        `Alert history could not be saved: ${historyError.message}`,
      );
    return { sent: status === 'Sent', duplicate: false };
  }

  @Cron('*/15 * * * *', { waitForCompletion: true })
  async updateDeliveryReceipts() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('notifications')
      .select('id, expo_ticket_ids')
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
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      const ticketIds: unknown = row.expo_ticket_ids;
      if (!Array.isArray(ticketIds)) continue;
      const ids = ticketIds.filter(
        (ticketId): ticketId is string => typeof ticketId === 'string',
      );
      if (!ids.length) continue;
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(ids);
        const statuses = Object.values(receipts).map(
          (receipt) => receipt.status,
        );
        const status =
          statuses.length && statuses.every((item) => item === 'ok')
            ? 'Delivered'
            : statuses.some((item) => item === 'ok')
              ? 'Delivered'
              : statuses.some((item) => item === 'error')
                ? 'Failed'
                : null;
        if (!status) continue;
        const { error: updateError } = await this.supabase
          .from('notifications')
          .update({
            status,
            delivered_at:
              status === 'Delivered' ? new Date().toISOString() : null,
            expo_ticket_ids: [],
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
}
