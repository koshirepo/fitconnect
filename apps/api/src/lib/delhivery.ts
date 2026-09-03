/**
 * Documentation: Delhivery REST client for the Workers runtime.
 *
 * - Talks to Delhivery's shipping API with `fetch` only: no SDK, no `https`, nothing that assumes Node. Every call takes the token explicitly so the caller decides which account a shipment lands in.
 * - Delhivery's API is not uniform. Serviceability and tracking are ordinary JSON GETs; manifestation is a form POST whose body is `format=json&data=<json>`; cancellation and pickup are JSON POSTs. The shape differences are absorbed here so the service layer sees one style.
 * - Amounts crossing this boundary are rupees, because that is what Delhivery quotes and charges. Everything inside the app is paise, and the callers convert.
 * - Nothing here writes to the database or decides policy. It reports what Delhivery said, including failures, and lets the service decide what that means for an order.
 * - Primary exports: checkPincodeServiceability, estimateShippingCharge, createShipment, createReverseShipment, trackShipment, cancelShipment, registerWarehouse, updateWarehouse, requestPickup, packingSlipUrl, mapDelhiveryStatus, DelhiveryError.
 */

/** Production. Staging is https://staging-express.delhivery.com — set DELHIVERY_BASE_URL. */
const DEFAULT_BASE_URL = "https://track.delhivery.com";

export class DelhiveryError extends Error {
  readonly status: number;
  /** Delhivery's own remark, when it gave one worth showing an operator. */
  readonly detail: string | undefined;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "DelhiveryError";
    this.status = status;
    this.detail = detail;
  }
}

export type DelhiveryConfig = {
  token: string;
  baseUrl: string;
  /** The warehouse name as registered in Delhivery, character for character. */
  pickupLocation: string;
  /** Where parcels leave from. Used for rate quotes. */
  originPincode: string;
  /** The account name Delhivery knows us by. Only the waybill APIs ask for it. */
  clientName: string;
};

/**
 * One address, in the shape Delhivery's manifestation call wants.
 * `pincode` is the field it actually routes on; the rest is for the label.
 */
export type DelhiveryAddress = {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
};

export type DelhiveryServiceability = {
  pincode: string;
  serviceable: boolean;
  /** Delhivery's district/state for the pincode, when it knows them. */
  city: string | null;
  state: string | null;
  /** Whether the pincode takes prepaid shipments. */
  prepaid: boolean;
  /** Whether cash on delivery is available there. */
  cod: boolean;
  /** Whether a reverse pickup can be booked — what the returns flow needs. */
  pickupAvailable: boolean;
};

export type DelhiveryScan = {
  status: string;
  detail: string;
  location: string;
  scannedAt: string;
};

export type DelhiveryTracking = {
  waybill: string;
  status: string;
  statusDetail: string | null;
  location: string | null;
  estimatedDeliveryAt: string | null;
  scans: DelhiveryScan[];
};

export type DelhiveryShipmentResult = {
  waybill: string;
  /** Delhivery's own order reference, which is the id we sent it. */
  referenceNumber: string;
  remark: string | null;
};

function authHeaders(token: string) {
  return {
    Authorization: `Token ${token}`,
    Accept: "application/json",
  };
}

/**
 * Utility helper that owns the `request` step for the Delhivery client.
 * Keeping transport in one place means every call fails the same way, and a
 * network error can never be mistaken for a courier's refusal.
 */
async function request<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { ...authHeaders(token), ...init.headers },
    });
  } catch (cause) {
    throw new DelhiveryError(
      `Could not reach Delhivery: ${(cause as Error)?.message ?? "network error"}`,
      502,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Delhivery answers HTML on auth failures and some outages. Keep the text
    // for the operator; it is usually the only clue about what went wrong.
    body = null;
  }

  if (!response.ok) {
    const detail =
      (body as { error?: string; rmk?: string } | null)?.error ??
      (body as { rmk?: string } | null)?.rmk ??
      (text ? text.slice(0, 300) : undefined);
    throw new DelhiveryError(
      response.status === 401
        ? "Delhivery rejected the API token."
        : `Delhivery request failed (${response.status}).`,
      response.status,
      detail,
    );
  }

  return body as T;
}

/**
 * Can we deliver to this pincode at all, and can we collect a return from it?
 *
 * Delhivery answers with a list because the endpoint filters rather than looks
 * up; an unserviceable pincode comes back as an empty list, not an error.
 */
export async function checkPincodeServiceability(
  config: DelhiveryConfig,
  pincode: string,
): Promise<DelhiveryServiceability> {
  const url = `${config.baseUrl}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pincode)}`;

  const body = await request<{
    delivery_codes?: Array<{
      postal_code?: {
        pin?: number | string;
        district?: string;
        state_code?: string;
        pre_paid?: string;
        cod?: string;
        pickup?: string;
      };
    }>;
  }>(url, config.token);

  const entry = body?.delivery_codes?.[0]?.postal_code;

  if (!entry) {
    return {
      pincode,
      serviceable: false,
      city: null,
      state: null,
      prepaid: false,
      cod: false,
      pickupAvailable: false,
    };
  }

  // Delhivery says "Y"/"N" as strings on these flags.
  const yes = (value: string | undefined) => (value ?? "").toUpperCase() === "Y";

  return {
    pincode,
    serviceable: true,
    city: entry.district ?? null,
    state: entry.state_code ?? null,
    prepaid: yes(entry.pre_paid),
    cod: yes(entry.cod),
    pickupAvailable: yes(entry.pickup),
  };
}

/**
 * What Delhivery will charge to carry this parcel, in rupees.
 *
 * Surface mode ("S") is the shop's default: express air costs more than the
 * goods on a ₹80 bottle. Weight is grams, which is what the invoice API wants.
 */
export async function estimateShippingCharge(
  config: DelhiveryConfig,
  params: {
    destinationPincode: string;
    weightGrams: number;
    paymentMode?: "Pre-paid" | "COD";
    /** Warehouse to price from. Defaults to the deployment's single origin. */
    originPincode?: string;
  },
): Promise<number> {
  const query = new URLSearchParams({
    md: "S",
    ss: "Delivered",
    d_pin: params.destinationPincode,
    o_pin: params.originPincode ?? config.originPincode,
    cgm: String(Math.max(1, Math.round(params.weightGrams))),
    pt: params.paymentMode ?? "Pre-paid",
  });

  const body = await request<Array<{ total_amount?: number; gross_amount?: number }>>(
    `${config.baseUrl}/api/kinko/v1/invoice/charges/.json?${query.toString()}`,
    config.token,
  );

  const first = Array.isArray(body) ? body[0] : null;
  const amount = first?.total_amount ?? first?.gross_amount;

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new DelhiveryError("Delhivery did not quote a shipping charge.", 502);
  }

  return amount;
}

/**
 * Build the form body manifestation wants.
 *
 * This endpoint predates the rest of the API: it takes form encoding, and the
 * whole payload rides inside a `data` field as JSON. Sending it as a JSON body
 * gets a 400 with no explanation, which is worth the comment.
 */
function manifestBody(payload: unknown) {
  return `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`;
}

type ManifestResponse = {
  success?: boolean;
  packages?: Array<{
    waybill?: string;
    refnum?: string;
    status?: string;
    remarks?: string[] | string;
  }>;
  rmk?: string;
  error?: string;
};

/**
 * Read the one package out of a manifestation response.
 *
 * Delhivery returns HTTP 200 for a refused shipment and puts the reason in
 * `remarks`, so success here is decided by the body, never by the status code.
 */
function readManifestResult(body: ManifestResponse): DelhiveryShipmentResult {
  const pkg = body?.packages?.[0];
  const remark = Array.isArray(pkg?.remarks)
    ? pkg.remarks.filter(Boolean).join("; ")
    : (pkg?.remarks ?? null);

  if (!pkg?.waybill) {
    throw new DelhiveryError(
      "Delhivery did not accept the shipment.",
      422,
      remark || body?.rmk || body?.error || undefined,
    );
  }

  return {
    waybill: String(pkg.waybill),
    referenceNumber: String(pkg.refnum ?? ""),
    remark: remark || null,
  };
}

/**
 * Book the parcel going out to the buyer.
 *
 * Prepaid only: the shop settles with Razorpay before anything is manifested,
 * so `payment_mode` is fixed and there is no COD amount to collect.
 */
export async function createShipment(
  config: DelhiveryConfig,
  params: {
    orderId: string;
    consignee: DelhiveryAddress;
    /** Declared value in rupees — what the parcel is insured and billed for. */
    declaredValueRupees: number;
    weightGrams: number;
    /** One line per product, used on the label and the manifest. */
    description: string;
    quantity: number;
    /** Packed box, in centimetres. Couriers re-measure and re-bill without it. */
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    /** Warehouse to ship from. Defaults to the deployment's single location. */
    pickupLocation?: string;
  },
): Promise<DelhiveryShipmentResult> {
  const payload = {
    shipments: [
      {
        name: params.consignee.name,
        add: params.consignee.address,
        city: params.consignee.city,
        state: params.consignee.state,
        country: "India",
        phone: params.consignee.phone,
        pin: params.consignee.pincode,
        order: params.orderId,
        payment_mode: "Prepaid",
        products_desc: params.description,
        cod_amount: "0",
        total_amount: String(params.declaredValueRupees),
        quantity: String(params.quantity),
        weight: String(params.weightGrams),
        shipment_length: String(params.lengthCm ?? 10),
        shipment_width: String(params.widthCm ?? 10),
        shipment_height: String(params.heightCm ?? 10),
        waybill: "",
      },
    ],
    pickup_location: { name: params.pickupLocation ?? config.pickupLocation },
  };

  const body = await request<ManifestResponse>(`${config.baseUrl}/api/cmu/create.json`, config.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: manifestBody(payload),
  });

  return readManifestResult(body);
}

/**
 * Book the parcel coming back from the buyer.
 *
 * A reverse consignment is the same call with `Pickup` mode: the buyer's
 * address becomes the origin, and the registered warehouse is the destination.
 */
export async function createReverseShipment(
  config: DelhiveryConfig,
  params: {
    /** Suffixed so the return has its own reference, distinct from the order. */
    referenceId: string;
    consignee: DelhiveryAddress;
    declaredValueRupees: number;
    weightGrams: number;
    description: string;
    quantity: number;
    /** Warehouse the return comes back to. Defaults to the single location. */
    pickupLocation?: string;
  },
): Promise<DelhiveryShipmentResult> {
  const warehouse = params.pickupLocation ?? config.pickupLocation;
  const payload = {
    shipments: [
      {
        name: params.consignee.name,
        add: params.consignee.address,
        city: params.consignee.city,
        state: params.consignee.state,
        country: "India",
        phone: params.consignee.phone,
        pin: params.consignee.pincode,
        order: params.referenceId,
        payment_mode: "Pickup",
        products_desc: params.description,
        cod_amount: "0",
        total_amount: String(params.declaredValueRupees),
        quantity: String(params.quantity),
        weight: String(params.weightGrams),
        shipment_width: "10",
        shipment_height: "10",
        waybill: "",
        return_name: warehouse,
      },
    ],
    pickup_location: { name: warehouse },
  };

  const body = await request<ManifestResponse>(`${config.baseUrl}/api/cmu/create.json`, config.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: manifestBody(payload),
  });

  return readManifestResult(body);
}

/** Where the parcel is, newest scan first. */
export async function trackShipment(
  config: DelhiveryConfig,
  waybill: string,
): Promise<DelhiveryTracking> {
  const body = await request<{
    ShipmentData?: Array<{
      Shipment?: {
        AWB?: string;
        Status?: { Status?: string; StatusType?: string; Instructions?: string; StatusLocation?: string };
        ExpectedDeliveryDate?: string | null;
        Scans?: Array<{
          ScanDetail?: {
            Scan?: string;
            ScanType?: string;
            Instructions?: string;
            ScannedLocation?: string;
            StatusDateTime?: string;
          };
        }>;
      };
    }>;
  }>(
    `${config.baseUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}`,
    config.token,
  );

  const shipment = body?.ShipmentData?.[0]?.Shipment;

  if (!shipment) {
    throw new DelhiveryError("Delhivery has no record of that waybill yet.", 404);
  }

  const scans: DelhiveryScan[] = (shipment.Scans ?? [])
    .map((entry) => entry.ScanDetail)
    .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
    .map((detail) => ({
      status: detail.Scan ?? "",
      detail: detail.Instructions ?? "",
      location: detail.ScannedLocation ?? "",
      scannedAt: detail.StatusDateTime ?? "",
    }))
    // Delhivery returns oldest first; a tracking page reads newest first.
    .reverse();

  return {
    waybill: shipment.AWB ?? waybill,
    status: shipment.Status?.Status ?? "",
    statusDetail: shipment.Status?.Instructions ?? null,
    location: shipment.Status?.StatusLocation ?? null,
    estimatedDeliveryAt: shipment.ExpectedDeliveryDate ?? null,
    scans,
  };
}

/**
 * Call a consignment off.
 *
 * Only possible while Delhivery still has it as manifested — once a parcel is
 * picked up it has to come back as an RTO instead, which is Delhivery's call,
 * not ours.
 */
export async function cancelShipment(config: DelhiveryConfig, waybill: string): Promise<void> {
  const body = await request<{ status?: boolean | string; error?: string; remark?: string }>(
    `${config.baseUrl}/api/p/edit`,
    config.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waybill, cancellation: "true" }),
    },
  );

  const ok = body?.status === true || String(body?.status).toLowerCase() === "true";
  if (!ok) {
    throw new DelhiveryError(
      "Delhivery would not cancel that shipment.",
      409,
      body?.error ?? body?.remark ?? undefined,
    );
  }
}

/** A pickup location, in the shape Delhivery's warehouse API wants. */
export type DelhiveryWarehouse = {
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactPerson?: string;
  /** Where returns land, when that differs from the pickup address. */
  returnAddress?: string;
  returnCity?: string;
  returnState?: string;
  returnPincode?: string;
};

function warehousePayload(warehouse: DelhiveryWarehouse) {
  return {
    name: warehouse.name,
    // Delhivery keeps the person and the place in one record; the contact name
    // falls back to the warehouse name so the field is never blank on a label.
    registered_name: warehouse.contactPerson ?? warehouse.name,
    phone: warehouse.phone,
    email: warehouse.email ?? "",
    address: warehouse.address,
    city: warehouse.city,
    state: warehouse.state,
    country: "India",
    pin: warehouse.pincode,
    return_address: warehouse.returnAddress ?? warehouse.address,
    return_city: warehouse.returnCity ?? warehouse.city,
    return_state: warehouse.returnState ?? warehouse.state,
    return_country: "India",
    return_pin: warehouse.returnPincode ?? warehouse.pincode,
  };
}

/**
 * Put a warehouse on Delhivery's books.
 *
 * Registering through the API rather than by hand in the panel is what keeps
 * the two names identical. A warehouse typed into both systems separately
 * eventually differs by a space, and every manifest from it is then refused.
 *
 * Delhivery treats a name it already holds as a conflict, which is reported as
 * such rather than swallowed: the caller decides whether that means "already
 * registered, carry on" or "somebody else took this name".
 */
export async function registerWarehouse(
  config: DelhiveryConfig,
  warehouse: DelhiveryWarehouse,
): Promise<void> {
  const body = await request<{ success?: boolean; error?: string[] | string; data?: unknown }>(
    `${config.baseUrl}/api/backend/clientwarehouse/create/`,
    config.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(warehousePayload(warehouse)),
    },
  );

  if (body?.success === false) {
    const detail = Array.isArray(body.error) ? body.error.join("; ") : body.error;
    throw new DelhiveryError("Delhivery would not register that warehouse.", 422, detail);
  }
}

/**
 * Change a warehouse Delhivery already holds.
 *
 * The name is the key, so it is the one field this cannot change: renaming
 * means registering a new warehouse and leaving the old one behind, which is
 * Delhivery's model, not a limitation of this client.
 */
export async function updateWarehouse(
  config: DelhiveryConfig,
  warehouse: DelhiveryWarehouse,
): Promise<void> {
  const body = await request<{ success?: boolean; error?: string[] | string }>(
    `${config.baseUrl}/api/backend/clientwarehouse/edit/`,
    config.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(warehousePayload(warehouse)),
    },
  );

  if (body?.success === false) {
    const detail = Array.isArray(body.error) ? body.error.join("; ") : body.error;
    throw new DelhiveryError("Delhivery would not update that warehouse.", 422, detail);
  }
}

/**
 * Ask for a collection from one warehouse.
 *
 * Delhivery wants the date and time separately, and counts packages rather than
 * naming waybills: the driver collects whatever is ready, and the count is how
 * they size the van.
 */
export async function requestPickup(
  config: DelhiveryConfig,
  params: {
    warehouseName: string;
    /** YYYY-MM-DD. */
    pickupDate: string;
    /** HH:MM:SS, in IST. */
    pickupTime: string;
    expectedPackageCount: number;
  },
): Promise<{ pickupId: string | null }> {
  const body = await request<{
    pickup_id?: number | string;
    pr_exist?: boolean;
    error?: string[] | string;
    success?: boolean;
  }>(`${config.baseUrl}/fm/request/new/`, config.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pickup_location: params.warehouseName,
      pickup_date: params.pickupDate,
      pickup_time: params.pickupTime,
      expected_package_count: params.expectedPackageCount,
    }),
  });

  if (body?.error) {
    const detail = Array.isArray(body.error) ? body.error.join("; ") : body.error;
    throw new DelhiveryError("Delhivery would not schedule that pickup.", 422, detail);
  }

  return { pickupId: body?.pickup_id ? String(body.pickup_id) : null };
}

/**
 * Where the label for these waybills can be fetched from.
 *
 * Returned as a URL rather than fetched here: the packing slip is a PDF meant
 * for a printer, and streaming it through the Worker would buy nothing.
 * The token has to be attached by whoever follows the link.
 */
export function packingSlipUrl(config: DelhiveryConfig, waybills: string[]) {
  const query = new URLSearchParams({ wbns: waybills.join(","), pdf: "true" });
  return `${config.baseUrl}/api/p/packing_slip?${query.toString()}`;
}

/**
 * Fetch the packing slip for these waybills.
 *
 * Delhivery answers with JSON carrying a link to the rendered PDF, which is
 * what an operator actually wants to open.
 */
export async function fetchPackingSlip(
  config: DelhiveryConfig,
  waybills: string[],
): Promise<{ pdfUrl: string | null }> {
  const body = await request<{
    packages_found?: number;
    packages?: Array<{ pdf_download_link?: string; pdf?: string }>;
  }>(packingSlipUrl(config, waybills), config.token);

  const pkg = body?.packages?.[0];
  return { pdfUrl: pkg?.pdf_download_link ?? pkg?.pdf ?? null };
}

/**
 * Translate Delhivery's status vocabulary into the shop's.
 *
 * Delhivery distinguishes far more states than a buyer needs, and words them
 * for its own operations ("UD" with an instruction of "In Transit"). The app
 * keeps a short list it can draw a timeline from; anything unrecognised stays
 * IN_TRANSIT, which is true of every scan between pickup and the last one.
 */
/**
 * Reserve waybill numbers ahead of manifesting.
 *
 * Manifestation assigns a waybill on its own — we send an empty one and
 * Delhivery fills it in — so this is not on the ordering path. It exists for
 * the cases that need the number first: printing labels ahead of a packing
 * run, or handing a courier a block of AWBs to reconcile against.
 *
 * Delhivery caps a single call at 10,000 and throttles the IP for a minute
 * past 50,000 in five, so `count` is clamped rather than passed through.
 */
export async function fetchWaybills(
  config: DelhiveryConfig,
  count = 1,
): Promise<string[]> {
  if (!config.clientName) {
    throw new DelhiveryError(
      "Delhivery client name is not configured, so waybills cannot be reserved.",
      409,
    );
  }

  const wanted = Math.min(Math.max(1, Math.trunc(count)), 10_000);

  // Two endpoints for the same idea: one waybill, or a block of them.
  const url =
    wanted === 1
      ? `${config.baseUrl}/waybill/api/fetch/json/?cl=${encodeURIComponent(config.clientName)}`
      : `${config.baseUrl}/waybill/api/bulk/json/?cl=${encodeURIComponent(config.clientName)}&count=${wanted}`;

  const body = await request<unknown>(url, config.token);

  // The single form answers with a bare quoted string, the bulk form with a
  // comma-separated list. Both are normalised to a list here so callers do not
  // have to know which one they asked for.
  const text =
    typeof body === "string"
      ? body
      : Array.isArray(body)
        ? body.join(",")
        : String((body as { waybill?: string })?.waybill ?? "");

  const waybills = text
    .replace(/["[]]/g, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (waybills.length === 0) {
    throw new DelhiveryError("Delhivery returned no waybills.", 502);
  }

  return waybills;
}

/** One scan as Delhivery pushes it, once the envelope has been unwrapped. */
export type DelhiveryTrackingPush = {
  waybill: string;
  status: string;
  statusType: string | null;
  statusDetail: string | null;
  location: string | null;
  /** Delhivery's own timestamp for the scan, not the moment we received it. */
  scannedAt: string | null;
  /** Delhivery's internal scan code, kept because their support asks for it. */
  nslCode: string | null;
  referenceNumber: string | null;
};

/**
 * Read one push delivery.
 *
 * Delhivery wraps a single scan in { Shipment: { Status: { … } } } and sends
 * nothing else — no signature, no envelope version, no batching. Anything
 * without a waybill is not a scan we can act on, and is reported as such rather
 * than guessed at: the alternative is silently dropping real deliveries.
 */
export function parseTrackingPush(body: unknown): DelhiveryTrackingPush | null {
  const shipment = (body as { Shipment?: Record<string, unknown> })?.Shipment;
  if (!shipment) return null;

  const status = (shipment.Status ?? {}) as Record<string, unknown>;
  const waybill = shipment.AWB ?? shipment.Waybill;
  if (!waybill) return null;

  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  return {
    waybill: String(waybill),
    status: text(status.Status) ?? "",
    statusType: text(status.StatusType),
    statusDetail: text(status.Instructions),
    location: text(status.StatusLocation),
    scannedAt: text(status.StatusDateTime),
    nslCode: text(shipment.NSLCode),
    referenceNumber: text(shipment.ReferenceNo),
  };
}

export function mapDelhiveryStatus(status: string, detail?: string | null): string {
  const value = `${status} ${detail ?? ""}`.toLowerCase();

  if (value.includes("rto")) return "RTO";
  if (value.includes("canceled") || value.includes("cancelled")) return "CANCELLED";
  if (value.includes("delivered")) return "DELIVERED";
  if (value.includes("out for delivery") || value.includes("dispatched")) return "OUT_FOR_DELIVERY";
  if (value.includes("manifest") || value.includes("not picked")) return "MANIFESTED";
  if (value.includes("pending") || value.includes("in transit") || value.includes("transit")) {
    return "IN_TRANSIT";
  }
  return "IN_TRANSIT";
}
