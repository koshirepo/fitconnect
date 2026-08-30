/**
 * Documentation: Passkey ceremonies, browser side.
 *
 * - Wraps the four endpoints and the two browser calls into two functions a screen can await: `registerPasskey` and `signInWithPasskey`. Everything else here exists to keep the ceremony's two halves — options, then verification — from being reassembled at each call site.
 * - `startRegistration` and `startAuthentication` open a native dialog, so both throw when somebody closes it. That is a decision rather than a failure, and it is reported as one so a screen can stay quiet instead of showing an error for a cancelled prompt.
 * - Support is checked before anything is offered. A "Sign in with a passkey" button that only ever errors is worse than no button.
 * - Primary exports: passkeysApi, registerPasskey, signInWithPasskey, isPasskeySupported, PasskeyCancelled.
 */
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { api } from "./client";
import type { ApiResponse, AuthResponse } from "@/types/api";

export type Passkey = {
  id: string;
  label: string | null;
  transports: string | null;
  discoverable: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

/** Thrown when the person closed the native dialog. Not an error to shout about. */
export class PasskeyCancelled extends Error {
  constructor() {
    super("Passkey prompt was dismissed.");
    this.name = "PasskeyCancelled";
  }
}

export const passkeysApi = {
  list: () => api.get<ApiResponse<{ passkeys: Passkey[] }>>("/auth/passkeys"),

  remove: (passkeyId: string) =>
    api.delete<ApiResponse<{ removed: boolean }>>(`/auth/passkeys/${passkeyId}`),

  registerOptions: () =>
    api.post<
      ApiResponse<{ options: PublicKeyCredentialCreationOptionsJSON; handle: string }>
    >("/auth/passkeys/register/options", {}),

  registerVerify: (payload: { handle: string; response: unknown; label?: string }) =>
    api.post<ApiResponse<{ registered: boolean }>>(
      "/auth/passkeys/register/verify",
      payload,
    ),

  loginOptions: () =>
    api.post<
      ApiResponse<{ options: PublicKeyCredentialRequestOptionsJSON; handle: string }>
    >("/auth/passkeys/login/options", {}),

  loginVerify: (payload: { handle: string; response: unknown }) =>
    api.post<ApiResponse<AuthResponse>>("/auth/passkeys/login/verify", payload),
};

/**
 * Whether this browser can do any of it.
 *
 * `PublicKeyCredential` is the whole API; without it there is nothing to offer,
 * and every modern browser that has it can at least use a phone as the
 * authenticator even when the device itself has no biometrics.
 */
export function isPasskeySupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    // A secure context is required, and localhost counts as one.
    window.isSecureContext
  );
}

/** A dismissed native dialog throws `NotAllowedError`, same as a real refusal. */
function asCancellation(error: unknown) {
  const name = (error as { name?: string })?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

/**
 * Create a passkey for the signed-in account.
 *
 * `label` is whatever the owner calls the device; it is only ever shown back
 * to them, so it is theirs to choose and safe to leave empty.
 */
export async function registerPasskey(label?: string) {
  const { data } = await passkeysApi.registerOptions();
  const { options, handle } = data.data;

  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (error) {
    if (asCancellation(error)) throw new PasskeyCancelled();
    throw error;
  }

  await passkeysApi.registerVerify({
    handle,
    response,
    ...(label?.trim() ? { label: label.trim() } : {}),
  });
}

/**
 * Sign in with a passkey, and hand back the same session a password would.
 *
 * No email is asked for: the authenticator already knows which account it
 * holds, which is the whole reason this is better than the password it
 * replaces.
 */
export async function signInWithPasskey(): Promise<AuthResponse> {
  const { data } = await passkeysApi.loginOptions();
  const { options, handle } = data.data;

  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (error) {
    if (asCancellation(error)) throw new PasskeyCancelled();
    throw error;
  }

  const verified = await passkeysApi.loginVerify({ handle, response });
  return verified.data.data;
}
