import * as React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Eye, Pencil, Columns2 } from "lucide-react";

type ViewMode = "write" | "preview" | "split";

interface MarkdownEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  label?: string;
  hint?: string;
  /** Minimum height for the editor area in px (default: 200) */
  minHeight?: number;
}

export function MarkdownEditor({
  id,
  value,
  onChange,
  placeholder = "Write using Markdown...",
  disabled = false,
  rows = 10,
  label,
  hint,
  minHeight = 200,
}: MarkdownEditorProps) {
  const [mode, setMode] = React.useState<ViewMode>("write");

  const toolbar: { mode: ViewMode; icon: React.ReactNode; title: string }[] = [
    { mode: "write", icon: <Pencil className="h-3.5 w-3.5" />, title: "Write" },
    { mode: "preview", icon: <Eye className="h-3.5 w-3.5" />, title: "Preview" },
    { mode: "split", icon: <Columns2 className="h-3.5 w-3.5" />, title: "Split" },
  ];

  const showEditor = mode === "write" || mode === "split";
  const showPreview = mode === "preview" || mode === "split";

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>
      )}

      <div className="rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b bg-muted/40 px-2 py-1">
          <div className="flex items-center gap-0.5">
            {toolbar.map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => setMode(item.mode)}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === item.mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {item.icon}
                {item.title}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground select-none hidden sm:inline">
            Markdown supported
          </span>
        </div>

        {/* Content area */}
        <div className={cn("grid", mode === "split" ? "grid-cols-2 divide-x" : "grid-cols-1")}>
          {showEditor && (
            <textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              rows={rows}
              style={{ minHeight }}
              className={cn(
                "w-full resize-y bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                mode === "split" && "border-none",
              )}
            />
          )}

          {showPreview && (
            <div
              style={{ minHeight }}
              className={cn(
                "overflow-auto px-3 py-2",
                !value.trim() && "flex items-center justify-center",
              )}
            >
              {value.trim() ? (
                <div className="prose prose-sm dark:prose-invert max-w-none wrap-break-word">
                  <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {value}
                  </Markdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nothing to preview</p>
              )}
            </div>
          )}
        </div>
      </div>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
