import type { Actor } from '@yusr/core';
import { createMockBackend, type BackendEvent, type MockBackend } from '@yusr/sdk/mock';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/** One in-memory backend shared by the website, the mobile app and the control hub. */
export const backend: MockBackend = createMockBackend({ liveIntervalMs: [6_500, 12_500] });

const subscribe = (onChange: () => void) => backend.subscribe(() => onChange());

export function useBackendVersion(): number {
  return useSyncExternalStore(subscribe, backend.getVersion, backend.getVersion);
}

/** Re-renders when backend data changes; selectors are memoized per version inside the backend. */
export function useRead<T>(select: (read: MockBackend['read']) => T): T {
  useBackendVersion();
  return select(backend.read);
}

export function useBackendEvents(handler: (event: BackendEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => backend.subscribe((event) => ref.current(event)), []);
}

export interface Persona extends Actor {
  nameEn: string;
}

/** Staff personas for the control hub's role switcher (two finance officers for maker-checker). */
export const PERSONAS: readonly Persona[] = backend.staff
  .filter((member) => member.id !== 'u_aya')
  .map((member) => ({ id: member.id, name: member.name.ar, nameEn: member.name.en, roles: [...member.roles] }));
