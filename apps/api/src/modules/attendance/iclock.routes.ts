/**
 * Documentation: The endpoints an RFID attendance machine talks to.
 *
 * - Mounted outside every other route group and behind no middleware. These requests carry no session and no bearer token — a wall-mounted device has no way to hold either — so `authenticate` must never see them. What stands in for it is the serial number resolving to a registered device.
 * - Every response is `text/plain`. The firmware parses bodies literally and treats anything it does not recognise as a failure, which means an unfamiliar answer does not fail once, it fails in a loop: the device re-sends the same batch until something it understands comes back.
 * - Unknown serials get `OK` rather than an error, deliberately. A 401 makes the device retry forever and fill the log; `OK` makes it move on quietly while nothing is recorded. The gym sees the device missing from its list, which is the honest signal — not a 401 storm nobody is reading.
 * - Primary exports: iclockRoutes.
 */
import { Hono } from "hono";
import { iclockService, parseAttendanceLog } from "./iclock.service";
import { provisioningService } from "./provisioning.service";
import type { AppBindings } from "../../types/app-context";

export const iclockRoutes = new Hono<AppBindings>();

/** The only content type these devices accept. */
const TEXT = { "Content-Type": "text/plain; charset=utf-8" } as const;

const ok = (body = "OK") => new Response(body, { headers: TEXT });

/**
 * Handshake. The device asks who it is talking to and how to behave.
 *
 * Answered before any registration check so an unregistered device still comes
 * up and reports its serial in the log — which is how somebody reads the number
 * off a machine already on the wall instead of unscrewing it.
 */
iclockRoutes.get("/cdata", async (c) => {
  const serial = c.req.query("SN") ?? "";

  const device = await iclockService.findDevice(serial);
  if (device?.isActive) {
    await iclockService.touch(device.id);
  } else {
    console.info("[iclock] handshake from an unregistered device", { serial });
  }

  return ok(iclockService.configFor(serial));
});

/**
 * A batch of punches.
 *
 * `table=ATTLOG` is attendance. The device also uploads operation logs and,
 * on some models, photographs; those are acknowledged and dropped, because
 * refusing them makes the device retry rather than move on.
 */
iclockRoutes.post("/cdata", async (c) => {
  const serial = c.req.query("SN") ?? "";
  const table = (c.req.query("table") ?? "").toUpperCase();
  const body = await c.req.text();

  const device = await iclockService.findDevice(serial);
  if (!device || !device.isActive) {
    console.warn("[iclock] upload from an unregistered device", { serial, table });
    return ok();
  }

  if (table !== "ATTLOG") {
    await iclockService.touch(device.id);
    return ok();
  }

  const punches = parseAttendanceLog(body);
  const result = await iclockService.recordPunches(device, punches);

  // Worth a line in the log: a device that is punching but mapping to nobody is
  // the most likely way this is misconfigured, and it is invisible otherwise.
  if (result.unmapped > 0 || result.unreadable > 0) {
    console.warn("[iclock] punches not recorded", {
      serial,
      device: device.name,
      ...result,
    });
  }

  // The firmware wants the count it sent, not the count we kept.
  return ok(`OK: ${result.received}`);
});

/**
 * The command poll, and the only chance to give a device work.
 *
 * These machines cannot be pushed to: enrolments wait in a queue until the
 * device next asks, which is here. Each line is prefixed `C:<id>:` — the
 * firmware echoes that id back to `/devicecmd` so a result can be matched to
 * the command that caused it.
 *
 * `OK` means no work. It has to be that exact word; an empty body is read as a
 * fault and makes the device back off.
 */
iclockRoutes.get("/getrequest", async (c) => {
  const serial = c.req.query("SN") ?? "";

  const device = await iclockService.findDevice(serial);
  if (!device || !device.isActive) return ok();

  await iclockService.touch(device.id);

  const commands = await provisioningService.takePending(device.id);
  if (commands.length === 0) return ok();

  return ok(
    commands.map((command) => `C:${command.id}:${command.command}`).join("\n"),
  );
});

/**
 * How a pushed command went.
 *
 * The body is form-encoded and may carry several results at once, one per line:
 * `ID=<commandId>&Return=<code>&CMD=DATA`. `Return=0` is success; anything
 * else is kept as the device said it, because the codes are vendor-specific and
 * guessing at their meaning would lose the only diagnosis available.
 */
iclockRoutes.post("/devicecmd", async (c) => {
  const serial = c.req.query("SN") ?? "";
  const device = await iclockService.findDevice(serial);
  if (!device || !device.isActive) return ok();

  await iclockService.touch(device.id);

  const body = await c.req.text();
  for (const line of body.split(/\r?\n/)) {
    const fields = new URLSearchParams(line.trim());
    const commandId = fields.get("ID");
    if (!commandId) continue;

    await provisioningService.completeCommand(commandId, fields.get("Return"));
  }

  return ok();
});

/**
 * Some firmware asks for this before uploading, to check the server is alive.
 * It wants the literal word, not JSON and not an empty body.
 */
iclockRoutes.get("/ping", () => ok());
