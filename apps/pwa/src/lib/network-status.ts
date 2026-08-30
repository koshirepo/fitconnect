/**
 * Documentation: What kind of connection this is, not merely whether there is one.
 *
 * - `useOnlineStatus` answers online or offline. This answers *how* online, which is the question that matters on a gym floor: a phone showing full bars on a 2G fallback is online and will still take fifteen seconds to pull a roster.
 * - The one place it changes behaviour today is the fetch-everything loaders. The member roster and the payment ledger are downloaded whole so search and offline reads stay instant; on a slow link or with Data Saver on, that trade stops being worth it and the page falls back to a single page of rows.
 * - Chromium-only, and deliberately optimistic where it is missing: an unknown connection is treated as a good one, so Safari and Firefox behave exactly as they did before rather than being punished for not reporting.
 * - Primary exports: getNetworkQuality, isSlowConnection, useNetworkQuality.
 */
import * as React from "react";

type EffectiveType = "slow-2g" | "2g" | "3g" | "4g";

type NetworkInformation = EventTarget & {
  effectiveType?: EffectiveType;
  /** The user has asked every site to use less data. */
  saveData?: boolean;
  /** Estimated bandwidth, Mb/s. */
  downlink?: number;
  /** Estimated round-trip time, ms. */
  rtt?: number;
};

type NavigatorWithConnection = Navigator & { connection?: NetworkInformation };

export type NetworkQuality = {
  effectiveType: EffectiveType | "unknown";
  saveData: boolean;
  downlink: number | null;
  rtt: number | null;
  /**
   * Whether to prefer the cheap path.
   *
   * True on 2G of either kind, and whenever Data Saver is on — that is a
   * request, not a measurement, and it should be honoured on a fast link too.
   * 3G is deliberately not slow: it is most of India on a weekday, and
   * degrading the app for it would degrade it for nearly everybody.
   */
  isSlow: boolean;
};

function read(): NetworkQuality {
  const connection =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as NavigatorWithConnection).connection;

  const effectiveType = connection?.effectiveType ?? "unknown";
  const saveData = Boolean(connection?.saveData);

  return {
    effectiveType,
    saveData,
    downlink: connection?.downlink ?? null,
    rtt: connection?.rtt ?? null,
    // An unknown connection is assumed good: every non-Chromium browser reports
    // nothing, and treating silence as "slow" would quietly halve the app for
    // most of Safari.
    isSlow: saveData || effectiveType === "2g" || effectiveType === "slow-2g",
  };
}

/** A one-off read, for code outside React — the query loaders, mainly. */
export function getNetworkQuality(): NetworkQuality {
  return read();
}

/** The single question most callers have. */
export function isSlowConnection(): boolean {
  return read().isSlow;
}

/** The same reading, kept current as the connection changes underfoot. */
export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = React.useState(read);

  React.useEffect(() => {
    const connection = (navigator as NavigatorWithConnection).connection;
    if (!connection) return;

    const onChange = () => setQuality(read());
    connection.addEventListener("change", onChange);
    return () => connection.removeEventListener("change", onChange);
  }, []);

  return quality;
}
