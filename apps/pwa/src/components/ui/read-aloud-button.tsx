/**
 * Documentation: Reading a block of text out loud.
 *
 * - Wraps the browser's own speech synthesis, so somebody who finds a wall of terms hard to read can listen to it instead. Built for the joining consent, where the whole point is that the person understood what they agreed to — a waiver skimmed because it was hard to read is the failure this is here to reduce.
 * - This is not a screen-reader substitute and does not replace the text. The words stay on the page, selectable and readable by assistive technology; this is an extra route to the same content for people who do not run a screen reader — poor eyesight, low literacy, reading English as a second language.
 * - Renders nothing when the browser has no speech synthesis. A dead button that does nothing when pressed is worse than no button, and support is genuinely absent in some in-app webviews.
 * - Primary exports: ReadAloudButton.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Pause, Volume2 } from "lucide-react";

/**
 * Whether this browser can speak at all.
 *
 * Read once at module scope rather than per render, but guarded for the
 * non-browser case so the component can be imported anywhere.
 */
function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function ReadAloudButton({
  text,
  /** BCP-47 tag. The gym's terms are whatever language the gym wrote them in. */
  lang = "en-IN",
  label = "Read aloud",
  className,
}: {
  text: string;
  lang?: string;
  label?: string;
  className?: string;
}) {
  const [supported] = React.useState(speechSupported);
  const [speaking, setSpeaking] = React.useState(false);

  /**
   * Stop talking when this unmounts.
   *
   * `speechSynthesis` belongs to the window, not to the component: navigate
   * away mid-sentence without this and the page keeps reading terms aloud to
   * somebody who is now looking at something else entirely.
   */
  React.useEffect(() => {
    if (!supported) return;
    return () => window.speechSynthesis.cancel();
  }, [supported]);

  if (!supported || !text.trim()) return null;

  const stop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const start = () => {
    // Anything already queued — including from a previous press — goes first,
    // otherwise the browser reads them back to back.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    // Terms read at the default rate sound hurried. Slightly slower is the
    // difference between hearing the words and following the sentence.
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={speaking ? stop : start}
      // The visible label says "Read aloud"; this says what pressing it does
      // now, which is what a screen reader user needs from a toggle.
      aria-label={speaking ? "Stop reading aloud" : label}
      aria-pressed={speaking}
    >
      {speaking ? <Pause className="size-4" /> : <Volume2 className="size-4" />}
      <span className="ml-1">{speaking ? "Stop" : label}</span>
    </Button>
  );
}
