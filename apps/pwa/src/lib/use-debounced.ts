/**
 * Documentation: A value that waits for the typing to stop.
 *
 * - Holds a value back until it has been still for a moment, so a search box drives one request rather than one per keystroke. "shoulder press" is thirteen renders and, without this, thirteen round trips.
 * - The value is returned rather than a callback wrapped: a query key built from it then changes once, which is what makes react-query fetch once.
 * - Primary exports: useDebounced.
 */
import * as React from "react";

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
