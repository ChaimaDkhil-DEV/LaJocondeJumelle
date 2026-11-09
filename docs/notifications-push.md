# Push notifications (spec 014)

Push notifications alert staff on their phone or computer even when the app is closed. They add to the
in-app bell, which stays the reference. Specification:
[specs/014-notifications-push-preferences/spec.md](../specs/014-notifications-push-preferences/spec.md).

**Off by default.** Without keys nothing is sent, and "Mon profil" shows « Les notifications push ne sont pas
activées par l’établissement. » (push notifications are not enabled by the school). Preferences (categories,
urgent sound) stay usable.

## Before enabling

1. **School decision** and entry in the processing register (record below, D9).
2. **HTTPS** is required: browsers refuse push elsewhere (except `localhost` in development).
3. **School time zone**: set `SCHOOL_TIMEZONE=Africa/Tunis` in `deploy/.env`. Otherwise the sending hours are
   evaluated in Paris time (one hour apart in summer).
4. **Sending hours**: "Administration > Réglages > Plage d’envoi des notifications push" (super administrator).
   Default: Monday to Friday, 07:30 to 18:30. Outside these hours no push is sent or postponed; lateness
   reports often arrive before 07:30.

## Enabling

1. Generate a key pair, once:

   ```text
   npm exec -w backend -- web-push generate-vapid-keys
   ```

2. In `deploy/.env`, set **all three variables or none**:

   ```text
   PUSH_VAPID_PUBLIC_KEY=<public key>
   PUSH_VAPID_PRIVATE_KEY=<private key>
   PUSH_VAPID_SUBJECT=mailto:<school contact address>
   ```

   - The subject is a `mailto:` or `https:` address of the school, never `localhost` (Apple refuses it).
   - Never commit or share the private key: it stays on the server.
   - A partial or invalid configuration stops the API at startup, with a message naming the variable.

3. Restart: `deploy/deploy.sh --no-pull`. "Administration > Réglages" then shows « Notifications push :
   activées ».

Each person then turns push on for their devices in "Mon profil > Notifications". The browser permission prompt
only appears after clicking « Activer les notifications sur cet appareil ».

## iPhone and iPad

Push works there from iOS/iPadOS 16.4 only, and only for an app **added to the Home Screen**: in Safari,
"Share", then "Add to Home Screen", then open the app from that icon. "Mon profil" shows these steps. Android and
computers need no installation.

On Apple devices a notification may appear even when the app is open: WebKit requires every push to be shown.

## Rotating the keys

Replacing the three variables and restarting makes **every existing subscription unusable**. Each device shows
« Les notifications de cet appareil doivent être réactivées. » and subscribes again in one click (« Réactiver »).

## What is pushed

Only 16 notification types, in four categories each person can turn off: Urgent (urgent work request),
Coverage, Unfilled coverage, Attendance. "Enseignant arrivé" (teacher arrived) is pushed only to the assigned
supervisor. The full mapping is in the spec; everything else stays in the bell.

The content is limited to the type label and the class name (coverage) or the reference (work request): never a
title, description, message or person's name.

## Processing register record

| Item | Content |
|---|---|
| Purpose | Alert staff, on their devices, about the school's urgent events: urgent request, class coverage, unfilled coverage, attendance. |
| Data subjects | Staff who turned push on for at least one device. |
| Data | Per device: delivery address assigned by the browser's push service (pseudonymous identifier), subscription keys, linked account, device label (e.g. "iPhone · Safari"), creation, last successful delivery and last use dates. Per account: preferences (four categories, urgent sound). |
| Message content | Notification type and class name or request reference; end-to-end encrypted (Web Push protocol). |
| Recipients | The browser vendors' push services (Google, Apple, Mozilla, Microsoft) receive the encrypted message and the metadata needed for delivery (delivery address, time, size, validity, server address). They cannot read the content. |
| Retention | Until the device is removed, its session logs out, the password is changed or reset, the account is deactivated, the push service permanently refuses it, or after 90 days without use. Preferences follow the account. An undelivered message is dropped after 30 minutes. |
| Rights | Everyone sees and removes their devices and sets their preferences in "Mon profil"; push can be refused or withdrawn at any time in the browser or phone settings. |
| Activation | On the school's decision, after this record is added to the register. |

## Checking

Pre-production checks behind Caddy and the display-delay measurement:
[spec 014 quickstart](../specs/014-notifications-push-preferences/quickstart.md). Record the results in
[docs/validation/verification-014.md](validation/verification-014.md).
