import { z } from "zod";

function isYoutubeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
}

const youtubeUrlSchema = z
  .string()
  .url()
  .refine((value) => isYoutubeUrl(value), "Only YouTube video URLs are allowed.");

const productCoreSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  markdown: z.string().max(20000).optional(),
  photos: z.array(z.string().url()).min(1).max(10),
  videos: z.array(youtubeUrlSchema).max(8).optional(),
  category: z.string().min(2).max(100),
  price: z.number().int().min(0),
  stock: z.number().int().min(0),
  minOrderQty: z.number().int().min(1),
  maxOrderQty: z.number().int().min(1),
  isActive: z.boolean().optional(),
});

export const createProductSchema = productCoreSchema.superRefine((data, ctx) => {
  if (data.maxOrderQty < data.minOrderQty) {
    ctx.addIssue({
      code: "custom",
      path: ["maxOrderQty"],
      message: "maxOrderQty must be greater than or equal to minOrderQty.",
    });
  }
});

export const updateProductSchema = productCoreSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one product field must be provided.",
  });

const orderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
});

export const placeOrderSchema = z.object({
  buyerName: z.string().min(2).max(120),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().min(8).max(20),
  buyerAddress: z.string().min(10).max(500),
  items: z.array(orderItemSchema).min(1).max(100),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "SHIPPED", "DELIVERED"]),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
