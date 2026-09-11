import webpush from "web-push";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

export const pushConfigured = Boolean(publicKey && privateKey && subject);

if (pushConfigured) {
  webpush.setVapidDetails(subject as string, publicKey as string, privateKey as string);
}

export { webpush };
