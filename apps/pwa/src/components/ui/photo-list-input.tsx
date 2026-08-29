/**
 * Documentation: A short, ordered list of photos.
 *
 * - For the places that hold several images rather than one: a product photographed from the front, the back, and with the scoop out.
 * - Each file is uploaded as it is chosen, and the list holds the resulting URLs. Uploading on submit instead would mean a failed save loses every photo somebody just picked.
 * - The first photo is the one a card shows, so the order is editable and stated on screen rather than left for an admin to discover by publishing.
 * - Enforces its own `max`, matching the API's cap. Being told after a long upload that there was no room is a worse way to find out.
 * - Primary exports: PhotoListInput.
 */
import * as React from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { uploadsApi } from "@/api/uploads";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/ui/optimized-image";

export function PhotoListInput({
  value,
  onChange,
  max = 8,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");

  const room = max - value.length;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");

    // Silently taking the first few would leave an admin wondering which of
    // the six they picked actually made it.
    if (files.length > room) {
      setError(`There is room for ${room} more photo${room === 1 ? "" : "s"}.`);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => {
          const response = await uploadsApi.uploadProductPhoto(file);
          return response.data.data.url;
        }),
      );
      onChange([...value, ...uploaded]);
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setUploading(false);
      // Cleared so choosing the same file twice still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;

    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading || room <= 0}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          {uploading ? "Uploading…" : "Add photos"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {value.length}/{max} · the first one is shown on the card
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {value.map((url, index) => (
            <li key={url} className="space-y-1">
              <div className="h-24 w-24 overflow-hidden rounded-lg border">
                <OptimizedImage src={url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move photo earlier"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move photo later"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
