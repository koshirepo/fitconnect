/**
 * Documentation: Create or edit something the gym sells.
 *
 * - A product is named once and sold as variants, so this edits both together: the supplement and its flavours and sizes, or the gloves and their sizes and colours.
 * - Creating requires at least one variant, because a product with nothing sellable is a page a member can reach and not buy from. Editing an existing product manages its variants one at a time, since each carries its own stock that a bulk replace would quietly discard.
 * - Photos upload as they are chosen rather than on save, so a rejected form does not lose the six images somebody just picked. The long description is markdown, matching how a gym already writes its own profile.
 * - Attributes are free-form pairs. Supplements and accessories do not share axes, and a gym may invent its own — "Strength", "Pack size" — so the form asks for names rather than offering a fixed list.
 * - Primary exports: StoreProductFormPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { getApiError } from "@/api/client";
import {
  useAddStoreVariant,
  useCreateStoreProduct,
  useDeleteStoreVariant,
  useStoreProduct,
  useUpdateStoreProduct,
  useUpdateStoreVariant,
} from "@/api/queries/store";
import type { StoreVariantPayload } from "@/api/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { PhotoListInput } from "@/components/ui/photo-list-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Plus, Trash2 } from "lucide-react";

/** A variant being typed, before it becomes a payload. */
type VariantDraft = {
  name: string;
  price: string;
  stock: string;
  attributes: { key: string; value: string }[];
};

function emptyVariant(): VariantDraft {
  return { name: "", price: "", stock: "0", attributes: [{ key: "", value: "" }] };
}

/** Turn a draft into what the API takes, dropping half-typed attribute rows. */
function toPayload(draft: VariantDraft): StoreVariantPayload {
  const attributes: Record<string, string> = {};
  for (const pair of draft.attributes) {
    const key = pair.key.trim();
    const value = pair.value.trim();
    if (key && value) attributes[key] = value;
  }

  return {
    name: draft.name.trim(),
    price: Number(draft.price) || 0,
    stock: Number(draft.stock) || 0,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
  };
}

/** Offered in the category field; a gym may type anything else. */
const CATEGORY_SUGGESTIONS = ["Supplements", "Accessories", "Apparel", "Equipment"];

export default function StoreProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useAppNavigate();
  const toast = useToast();
  const isEdit = Boolean(productId);

  const productQuery = useStoreProduct(productId);
  const createProduct = useCreateStoreProduct();
  const updateProduct = useUpdateStoreProduct();
  const addVariant = useAddStoreVariant();
  const updateVariant = useUpdateStoreVariant();
  const deleteVariant = useDeleteStoreVariant();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [markdown, setMarkdown] = React.useState("");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [videoUrl, setVideoUrl] = React.useState("");
  const [category, setCategory] = React.useState<string>(CATEGORY_SUGGESTIONS[0]);
  const [coinsGranted, setCoinsGranted] = React.useState("0");
  const [variants, setVariants] = React.useState<VariantDraft[]>([emptyVariant()]);
  const [newVariant, setNewVariant] = React.useState<VariantDraft>(emptyVariant());
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [seeded, setSeeded] = React.useState(false);

  const product = productQuery.data;

  React.useEffect(() => {
    if (!isEdit || seeded || !product) return;
    setName(product.name);
    setDescription(product.description ?? "");
    setMarkdown(product.markdown ?? "");
    setPhotos(Array.isArray(product.photos) ? product.photos : []);
    setVideoUrl(product.videoUrl ?? "");
    setCategory(product.category);
    setCoinsGranted(String(product.coinsGranted));
    setSeeded(true);
  }, [isEdit, seeded, product]);

  const handleCreate = async () => {
    setError("");

    const payloads = variants.map(toPayload).filter((variant) => variant.name);
    if (payloads.length === 0) {
      setError("Add at least one variant — a flavour, a size, something to sell.");
      return;
    }

    setSaving(true);
    try {
      await createProduct.mutateAsync({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(markdown.trim() ? { markdown: markdown.trim() } : {}),
        ...(videoUrl.trim() ? { videoUrl: videoUrl.trim() } : {}),
        photos,
        category,
        coinsGranted: Number(coinsGranted) || 0,
        variants: payloads,
      });
      toast.success(`${name.trim()} added to the store.`);
      navigate("/store/manage");
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!productId) return;
    setError("");
    setSaving(true);

    try {
      await updateProduct.mutateAsync({
        productId,
        payload: {
          name: name.trim(),
          description: description.trim() || undefined,
          // Null, not undefined: clearing a body or a video has to be
          // distinguishable from leaving it alone, and omitting it means the latter.
          markdown: markdown.trim() || null,
          videoUrl: videoUrl.trim() || null,
          photos,
          category,
          coinsGranted: Number(coinsGranted) || 0,
        },
      });
      toast.success("Product updated.");
      navigate("/store/manage");
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleAddVariant = async () => {
    if (!productId) return;
    const payload = toPayload(newVariant);
    if (!payload.name) {
      setError("Give the variant a name, like “Chocolate · 1kg”.");
      return;
    }

    setError("");
    try {
      await addVariant.mutateAsync({ productId, payload });
      setNewVariant(emptyVariant());
      toast.success(`${payload.name} added.`);
    } catch (caught) {
      setError(getApiError(caught));
    }
  };

  const handleRemoveVariant = async (variantId: string, variantName: string) => {
    setError("");
    try {
      const result = await deleteVariant.mutateAsync(variantId);
      toast.success(
        result.retained
          ? `${variantName} has sold before, so it was retired rather than deleted.`
          : `${variantName} deleted.`,
      );
    } catch (caught) {
      setError(getApiError(caught));
    }
  };

  if (isEdit && productQuery.isPending) return <FormPageSkeleton fields={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? "Edit product" : "New product"}
        </h1>
        <p className="text-muted-foreground">
          {isEdit
            ? "Change the details, or manage what it is sold as."
            : "Name it once, then add every flavour, size, or colour you sell."}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Whey Protein"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What it is, and who it suits."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category *</Label>
              {/* Typed, not chosen from two. The list below is a suggestion, so
                  a gym selling apparel or gift cards can name its own shelf
                  while the common ones stay one keystroke away. What is typed
                  is what the storefront chip says — there is no mapping step. */}
              <Input
                id="category"
                list="store-category-suggestions"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Supplements"
                maxLength={40}
                required
              />
              <datalist id="store-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="coins">Coins earned per unit</Label>
              <Input
                id="coins"
                type="number"
                min={0}
                step={1}
                value={coinsGranted}
                onChange={(e) => setCoinsGranted(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                What the buyer gets back. Zero for no reward.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Photos and video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Photos</Label>
            <PhotoListInput value={photos} onChange={setPhotos} max={8} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="video">Video link</Label>
            <Input
              id="video"
              type="url"
              inputMode="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtu.be/..."
            />
            <p className="text-xs text-muted-foreground">
              Paste a YouTube link however you copied it — a share link, a watch link, or a
              Shorts link all work.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Full description</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownEditor
            id="markdown"
            value={markdown}
            onChange={setMarkdown}
            minHeight={220}
            hint="Shown on the product page. Ingredients, dosage, what the kit is made of."
            placeholder="Ingredients, dosage, what it is made of — written in Markdown."
          />
        </CardContent>
      </Card>

      {/* Creating: variants are part of the same write, because a product with
          nothing sellable is a page a member can reach and not buy from. */}
      {!isEdit && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What it is sold as</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {variants.map((variant, index) => (
              <VariantFields
                key={index}
                draft={variant}
                onChange={(next) =>
                  setVariants((prev) => prev.map((v, i) => (i === index ? next : v)))
                }
                onRemove={
                  variants.length > 1
                    ? () => setVariants((prev) => prev.filter((_, i) => i !== index))
                    : undefined
                }
              />
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => setVariants((prev) => [...prev, emptyVariant()])}
            >
              <Plus className="h-4 w-4" />
              Add another
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Editing: one at a time, because each variant carries its own stock and
          a bulk replace would quietly discard it. */}
      {isEdit && product && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Variants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {product.variants.map((variant) => (
              <div
                key={variant.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{variant.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ₹{variant.price} · {variant.stock} in stock
                    {!variant.isActive && " · retired"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateVariant.mutateAsync({
                        variantId: variant.id,
                        payload: { isActive: !variant.isActive },
                      })
                    }
                  >
                    {variant.isActive ? "Retire" : "Restore"}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleRemoveVariant(variant.id, variant.name)}
                    aria-label={`Delete ${variant.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Add a variant</p>
              <VariantFields draft={newVariant} onChange={setNewVariant} />
              <Button type="button" variant="outline" onClick={handleAddVariant}>
                <Plus className="h-4 w-4" />
                Add variant
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate("/store/manage")}>
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleUpdate : handleCreate}
          disabled={saving || !name.trim()}
          className="flex-1"
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add to store"}
        </Button>
      </div>
    </div>
  );
}

/** The fields that make one variant: its name, price, stock, and axes. */
function VariantFields({
  draft,
  onChange,
  onRemove,
}: {
  draft: VariantDraft;
  onChange: (next: VariantDraft) => void;
  onRemove?: () => void;
}) {
  const setAttribute = (index: number, patch: { key?: string; value?: string }) => {
    onChange({
      ...draft,
      attributes: draft.attributes.map((pair, i) =>
        i === index ? { ...pair, ...patch } : pair,
      ),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
        <div className="space-y-1.5">
          <Label>Variant name *</Label>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Chocolate · 1kg"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Price *</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={draft.price}
            onChange={(e) => onChange({ ...draft, price: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Stock</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={draft.stock}
            onChange={(e) => onChange({ ...draft, stock: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          What makes it different — flavour, size, colour
        </Label>
        {draft.attributes.map((pair, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <Input
              value={pair.key}
              onChange={(e) => setAttribute(index, { key: e.target.value })}
              placeholder="flavour"
            />
            <Input
              value={pair.value}
              onChange={(e) => setAttribute(index, { value: e.target.value })}
              placeholder="Chocolate"
            />
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({ ...draft, attributes: [...draft.attributes, { key: "", value: "" }] })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add attribute
        </Button>
      </div>

      {onRemove && (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
          Remove this variant
        </Button>
      )}
    </div>
  );
}
