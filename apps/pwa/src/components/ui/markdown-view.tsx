/**
 * Documentation: Read-only markdown.
 *
 * - The rendering half of `MarkdownEditor`, for the pages that only display what somebody wrote: a gym's profile, a product's long description.
 * - GitHub-flavoured markdown, so tables, task lists, and bare URLs behave the way anyone writing in a text box expects.
 * - Raw HTML is deliberately not enabled here. This renders text a member typed into a comment-adjacent box, and a `<script>` or an `onerror` attribute pasted into a product description should stay text.
 * - Primary exports: MarkdownView.
 */
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function MarkdownView({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-neutral max-w-none dark:prose-invert",
        "prose-headings:font-bold prose-a:text-primary prose-img:rounded-xl prose-pre:rounded-xl",
        className,
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}
