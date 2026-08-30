/**
 * Documentation: How much of the screen the on-screen keyboard has taken.
 *
 * - `interactive-widget=resizes-content` in the viewport meta already does most of this work: the layout shrinks, so a sticky footer lands above the keyboard rather than behind it. This is for the cases that need to react rather than merely reflow — a panel that should give up its scroll area, a hint line worth hiding when there is no room for it.
 * - Measured from `visualViewport` rather than the VirtualKeyboard API. The latter is Chromium-only and requires opting out of the automatic resize, which would undo the meta tag; `visualViewport` is supported nearly everywhere and reports the same thing from the outside.
 * - A keyboard is never assumed. Rotating a phone, an address bar collapsing, and a browser zoom all move the visual viewport too, so the height is only reported as a keyboard past a threshold no toolbar reaches.
 * - Primary exports: useVirtualKeyboard.
 */
import * as React from "react";

/**
 * Below this, the gap is a collapsing address bar or a toolbar, not a keyboard.
 * Every on-screen keyboard is far taller than this on every phone.
 */
const KEYBOARD_THRESHOLD_PX = 150;

export type VirtualKeyboardState = {
  /** How many pixels the keyboard covers. 0 when it is closed. */
  height: number;
  open: boolean;
};

export function useVirtualKeyboard(): VirtualKeyboardState {
  const [state, setState] = React.useState<VirtualKeyboardState>({
    height: 0,
    open: false,
  });

  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const measure = () => {
      // The gap between the window and what is actually visible. The keyboard
      // is the only thing that takes this much of it.
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      const height = covered > KEYBOARD_THRESHOLD_PX ? Math.round(covered) : 0;

      setState((current) =>
        current.height === height ? current : { height, open: height > 0 },
      );
    };

    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);

    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  return state;
}
