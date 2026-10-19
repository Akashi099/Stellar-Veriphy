# Email Notifications Setup Guide

This guide explains how to set up and manage email notifications for the Stellar-Veriphy community forum.

## Overview

Email notifications keep users engaged with the community by alerting them about:
- New replies to their threads
- Mentions of their username
- New posts in watched categories
- Community announcements
- Moderation actions

## Server-Side Setup

### Required Environment Variables

```bash
# Email Configuration
SMTP_HOST=your-smtp-host.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@example.com
SMTP_FROM_NAME=Stellar-Veriphy

# Notification Settings
NOTIFICATION_ENABLED=true
NOTIFICATION_BATCH_INTERVAL=3600
```

### Email Service Integration

The system supports multiple email services:

#### SendGrid

```bash
SENDGRID_API_KEY=sg_...
```

#### Mailgun

```bash
MAILGUN_DOMAIN=mg.example.com
MAILGUN_API_KEY=key-...
```

#### AWS SES

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

#### Custom SMTP

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## User Settings

### Email Preference Management

Users can manage their email preferences in Settings > Notifications:

1. **Email Frequency**
   - Instant (immediate)
   - Digest (daily)
   - Weekly digest
   - Never

2. **Notification Types**
   - Direct replies
   - Mentions
   - Category updates
   - Announcements
   - Moderation notices

3. **Category Subscriptions**
   - Select which categories to follow
   - Choose notification frequency per category

### Unsubscribe

Users can unsubscribe from all emails:
- Click "Unsubscribe" link in any email
- Manage preferences in settings
- Delete account

## Email Templates

### Template Locations

Email templates are stored in `emails/templates/`:
- `reply-notification.html`
- `mention-notification.html`
- `digest-weekly.html`
- `announcement.html`
- `moderation-action.html`

### Customizing Templates

1. Edit HTML template in `emails/templates/`
2. Use variables like `{{username}}`, `{{threadTitle}}`, etc.
3. Maintain responsive design
4. Test before deploying

### Template Variables

```
{{username}} - User's username
{{threadTitle}} - Discussion title
{{categoryName}} - Category name
{{replyContent}} - Content of reply
{{authorName}} - Author of reply
{{threadUrl}} - Link to thread
{{timestamp}} - When the action occurred
{{notificationPreferences}} - User's notification settings
```

## Implementation

### Notification Service

Create `services/notifications.ts`:

```typescript
interface NotificationParams {
  userId: string;
  type: 'reply' | 'mention' | 'digest' | 'announcement';
  data: Record<string, string>;
}

export async function sendNotification(params: NotificationParams) {
  // Get user preferences
  const user = await getUser(params.userId);
  
  if (!user.emailNotificationsEnabled) return;
  
  // Get appropriate template
  const template = getTemplate(params.type);
  
  // Render template with data
  const html = renderTemplate(template, params.data);
  
  // Send email
  await sendEmail({
    to: user.email,
    subject: getSubject(params.type),
    html,
  });
}
```

### Scheduling Digests

Use a job scheduler like:
- Node-cron
- Bull
- AWS EventBridge
- Google Cloud Scheduler

```typescript
// Daily digest at 9 AM UTC
cron.schedule('0 9 * * *', async () => {
  const users = await getUsersWithDailyDigest();
  for (const user of users) {
    await sendDailyDigest(user);
  }
});
```

## Testing

### Local Testing

1. Use MailHog for local SMTP:
   ```bash
   docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
   ```

2. Configure local environment:
   ```bash
   SMTP_HOST=localhost
   SMTP_PORT=1025
   ```

3. View emails at `http://localhost:8025`

### Email Preview

Test templates with:
```bash
npm run test:email-templates
```

## Monitoring

### Email Delivery Metrics

Monitor:
- Delivery rate
- Bounce rate
- Complaint rate
- Unsubscribe rate

### Logging

Log all email sends:

```typescript
logger.info('Email sent', {
  userId,
  type,
  timestamp: new Date(),
  status: 'sent',
});
```

## Best Practices

1. **Authenticate Email Domain**
   - Set up SPF records
   - Configure DKIM
   - Enable DMARC

2. **Avoid Spam**
   - Use consistent sender
   - Provide unsubscribe link
   - Keep list clean
   - Monitor bounce rates

3. **Personalization**
   - Use user's name
   - Tailor content to preferences
   - Include relevant links

4. **Performance**
   - Use async/background jobs
   - Batch emails when possible
   - Implement rate limiting

5. **Compliance**
   - Follow CAN-SPAM requirements
   - Respect GDPR/privacy laws
   - Get explicit consent

## Troubleshooting

### Emails Not Sending

1. Check SMTP credentials
2. Verify firewall/network access
3. Review server logs
4. Test with simple email first

### High Bounce Rate

1. Verify email addresses
2. Check sender reputation
3. Monitor for invalid addresses
4. Remove bounced emails

### Unsubscribes

1. Respect user preferences
2. Make unsubscribe easy
3. Send preference update confirmation
4. Track unsubscribe reasons

## Compliance

### GDPR

- Get explicit consent before sending
- Provide easy unsubscribe
- Respect data retention policies
- Allow data export/deletion

### CAN-SPAM

- Identify as commercial message
- Provide physical address
- Honor opt-out requests
- Monitor compliance

## Analytics

### Track Email Metrics

```typescript
interface EmailMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}
```

Generate reports for:
- Campaign performance
- User engagement
- Delivery health
- Conversion tracking

## Future Enhancements

- SMS notifications
- Push notifications
- In-app notifications
- Webhook support
- Custom email templates in UI
- A/B testing for emails

## Support

For email notification issues:
- Check logs in `logs/email.log`
- Review configuration
- Contact email service provider
- Report on GitHub issues

## Related Documentation

- [Community Forum Guide](./COMMUNITY_FORUM_GUIDE.md)
- [Environment Setup](./DEVELOPMENT_WORKFLOW.md)
- [Deployment Guide](./DEPLOYMENT.md)
