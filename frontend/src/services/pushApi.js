import { API_BASE } from '../config/apiBase.js';
import { apiBaseHeaders } from './apiClient.js';

async function parseJson(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { error: text || 'Request failed' };
  }
}

async function ensureOk(res, fallbackMessage) {
  const payload = await parseJson(res);
  if (!res.ok) {
    throw new Error(payload.error || fallbackMessage);
  }
  return payload;
}

export function browserPushSupported() {
  return (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  );
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

export async function getPublicPushConfig() {
  const res = await fetch(`${API_BASE}/api/public/push/config`, {
    headers: { ...apiBaseHeaders() },
  });
  return ensureOk(res, 'Failed to load push notification config');
}

export async function registerPublicPushDevice(payload = {}) {
  const res = await fetch(`${API_BASE}/api/public/push/register-device`, {
    method: 'POST',
    headers: {
      ...apiBaseHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return ensureOk(res, 'Failed to register this device for push notifications');
}

export async function unregisterPublicPushDevice(payload = {}) {
  const res = await fetch(`${API_BASE}/api/public/push/unregister-device`, {
    method: 'POST',
    headers: {
      ...apiBaseHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return ensureOk(res, 'Failed to unregister this device from push notifications');
}

export async function getFleetPushSubscription() {
  if (!browserPushSupported()) return null;
  const registration = await navigator.serviceWorker.register('/fleetcheck-sw.js');
  return registration.pushManager.getSubscription();
}
