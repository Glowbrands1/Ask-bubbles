"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * WHETHER THIS PERSON SEES THE MIC (VOICE_INPUT_ENABLED and the pilot list), decided on the server by the (app) layout
 * (`voiceInputEnabledFor`) and handed down as a yes/no. `userKey` is the person's user id, used only to remember their
 * first-use choice in this browser. With no provider (every existing test, any page outside the layout) voice is off.
 * The route checks everything again; this only decides whether a button is drawn.
 */
export interface VoiceAccess {
  readonly enabled: boolean;
  readonly userKey: string | null;
}

const OFF: VoiceAccess = { enabled: false, userKey: null };

const VoiceAccessContext = createContext<VoiceAccess>(OFF);

export function VoiceAccessProvider({ value, children }: { value: VoiceAccess; children: ReactNode }) {
  return <VoiceAccessContext.Provider value={value.enabled ? value : OFF}>{children}</VoiceAccessContext.Provider>;
}

export function useVoiceAccess(): VoiceAccess {
  return useContext(VoiceAccessContext);
}
