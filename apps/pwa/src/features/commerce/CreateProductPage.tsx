import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { uploadsApi } from "@/api/uploads";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { PhotoCapture } from "@/components/ui/photo-capture";
import { ArrowLeft, Plus, CheckCircle2, AlertCircle, X } from "lucide-react";

type ProductForm = {
  name: string;
  description: string;
  markdown: string;
  photoUrls: string[];
  videosText: string;
  category: string;
  price: string;
  stock: string;
  minOrderQty: string;
  maxOrderQty: string;
  isActive: boolean;
};

const emptyForm: ProductForm = {
  name: "",
  description: "",
  markdown: "",
  photoUrls: [],
  videosText: "",
  category: "",
  price: "",
  stock: "",
  minOrderQty: "1",
  maxOrderQty: "10",
  isActive: true,
};

function isYoutubeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
}

export default function CreateProductPage() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState<ProductForm>(emptyForm);
  const [photoPreviews, setPhotoPreviews] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);
  const [createdProductName, setCreatedProductName] = React.useState("");

  const handlePhotoCapture = async (file: File | null, preview: string | null) => {
    if (!file || !preview) return;

    setUploading(true);
    try {
      const res = await uploadsApi.uploadProductPhoto(file);
      const photoUrl = res.data?.data?.url;
      if (photoUrl) {
        setForm((prev) => ({
          ...prev,
          photoUrls: [...prev.photoUrls, photoUrl],
        }));
        setPhotoPreviews((prev) => [...prev, preview]);
      }
    } catch (err) {
      setError(`Failed to upload photo: ${getApiError(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    setForm((prev) => ({
      ...prev,
      photoUrls: prev.photoUrls.filter((_, i) => i !== index),
    }));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const videos = form.videosText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      markdown: form.markdown.trim() || undefined,
      photos: form.photoUrls,
      videos,
      category: form.category.trim(),
      price: Number(form.price),
      stock: Number(form.stock),
      minOrderQty: Number(form.minOrderQty),
      maxOrderQty: Number(form.maxOrderQty),
      isActive: form.isActive,
    };

    if (!payload.name || !payload.category || form.photoUrls.length === 0) {
      setError("Name, category, and at least one product photo are required.");
      return;
    }

    if (
      [payload.price, payload.stock, payload.minOrderQty, payload.maxOrderQty].some((value) =>
        Number.isNaN(value) || !Number.isInteger(value),
      )
    ) {
      setError("Price, stock, min qty, and max qty must be whole numbers.");
      return;
    }

    if (payload.maxOrderQty < payload.minOrderQty) {
      setError("Max order quantity must be greater than or equal to min order quantity.");
      return;
    }

    if (videos.some((video) => !isYoutubeUrl(video))) {
      setError("All video URLs must be valid YouTube links.");
      return;
    }

    setSubmitting(true);
    try {
      await commerceApi.createProduct(payload);
      setCreatedProductName(payload.name);
      setSuccess(true);
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success state ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
            <CardTitle>Product Created!</CardTitle>
            <CardDescription>
              The product &quot;{createdProductName}&quot; has been created successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button onClick={() => navigate("/platform-commerce")} className="w-full max-w-xs">
              View All Products
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccess(false);
                setForm(emptyForm);
                setPhotoPreviews([]);
                setError("");
              }}
              className="w-full max-w-xs"
            >
              <Plus className="h-4 w-4" />
              Create Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/platform-commerce")}
          aria-label="Back to products"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Product</h1>
          <p className="text-muted-foreground">Add a new product to your e-commerce catalog.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Product Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product Details</CardTitle>
            <CardDescription>Enter the basic information about your product.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Premium Yoga Mat"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  placeholder="e.g., Fitness Equipment"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your product features and benefits..."
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="sm:col-span-2">
                <MarkdownEditor
                  id="markdown"
                  label="Detailed Description (Markdown)"
                  placeholder={
                    "Write a rich product description using Markdown...\n\n## Features\n- Feature 1\n- Feature 2\n\n## Specifications\n| Spec | Value |\n|------|-------|\n| Weight | 500g |"
                  }
                  value={form.markdown}
                  onChange={(val) => setForm((prev) => ({ ...prev, markdown: val }))}
                  rows={10}
                  hint="Optional. Supports headings, lists, tables, bold, italic, and more."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Media - Photos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product Photos *</CardTitle>
            <CardDescription>Add photos to showcase your product.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PhotoCapture
              value={null}
              onChange={handlePhotoCapture}
              disabled={uploading || submitting}
              requireFace={false}
            />
            {uploading && <p className="text-sm text-muted-foreground">Uploading photo...</p>}

            {/* Photo Gallery */}
            {photoPreviews.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {photoPreviews.length} photo{photoPreviews.length !== 1 ? "s" : ""} added
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {photoPreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Product photo ${index + 1}`}
                        className="aspect-square rounded border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute top-1 right-1 rounded bg-destructive p-1 opacity-0 transition group-hover:opacity-100"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing & Inventory */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pricing & Inventory</CardTitle>
            <CardDescription>Set product price and inventory details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">Price (in rupees) *</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="e.g., 999"
                  value={form.price}
                  onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the product price in rupees.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock">Stock Quantity *</Label>
                <Input
                  id="stock"
                  type="number"
                  min={0}
                  placeholder="e.g., 50"
                  value={form.stock}
                  onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minOrderQty">Minimum Order Quantity *</Label>
                <Input
                  id="minOrderQty"
                  type="number"
                  min={1}
                  placeholder="e.g., 1"
                  value={form.minOrderQty}
                  onChange={(e) => setForm((prev) => ({ ...prev, minOrderQty: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxOrderQty">Maximum Order Quantity *</Label>
                <Input
                  id="maxOrderQty"
                  type="number"
                  min={1}
                  placeholder="e.g., 100"
                  value={form.maxOrderQty}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxOrderQty: e.target.value }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Availability</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={form.isActive ? "ACTIVE" : "INACTIVE"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, isActive: e.target.value === "ACTIVE" }))
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Inactive products won't be visible to customers.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting || uploading}>
            {submitting ? "Creating..." : "Create Product"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/platform-commerce")}
            disabled={submitting || uploading}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
