# Thermal Printer Service — Full Architecture Rewrite Plan

## Background

The original `epson-printer.service.ts` audit catalogued **13 bugs** across `epson-printer.service.ts`, `pos-config.service.ts`, `network-printer.service.ts`, `thermal-print.service.ts`, and `app.json`. Patching all 13 individually is possible, but the root cause of most of them is architectural: connection type, command format, and success detection are conflated inside single functions, so every printer path (HTTP/XML, raw TCP, and the not-yet-built BLE/SPP paths) re-implements — and re-breaks — the same logic independently.

This plan replaces the patch-by-patch approach with a layered architecture that fixes all 13 catalogued bugs **by construction**, and adds native Bluetooth support (BLE + SPP) as first-class transports rather than a stub.

---

## Design Principle: Separate *what* to print from *how* to deliver it

```
Order data
   │
   ▼
┌───────────────────────┐
│ 1. Receipt Builder      │  → protocol-neutral "document" (text, cut, drawer-pulse, barcode…)
└───────────────────────┘
   │
   ▼
┌───────────────────────┐
│ 2. Command Encoder      │  → document → bytes/XML for the target protocol (ESC/POS or ePOS-XML)
└───────────────────────┘
   │
   ▼
┌───────────────────────┐
│ 3. Transport            │  → delivers bytes via HTTP, TCP socket, BLE GATT, or SPP RFCOMM
└───────────────────────┘
   │
   ▼
┌───────────────────────┐
│ 4. Result Classifier    │  → transport + protocol response → one typed PrintResult
└───────────────────────┘
   │
   ▼
┌───────────────────────┐
│ 5. Print Queue          │  → per-printer FIFO, retries, surfaces status
└───────────────────────┘
```

Every printer model (TM-m30, TM-m30II, TM-T82 family, TM-U220, TM-T20 family, and future non-Epson ESC/POS printers) is just a config-selected combination of **(encoder, transport)** — no printer-specific branching in business logic.

---

## Layer 1 — Receipt Builder (protocol-neutral document model)

### [NEW] `services/printer/receipt-document.ts`

```typescript
export type ReceiptCommand =
  | { type: 'text'; value: string; bold?: boolean; align?: 'left' | 'center' | 'right'; size?: 'normal' | 'double' }
  | { type: 'line' }
  | { type: 'feed'; lines: number }
  | { type: 'cut'; mode: 'full' | 'partial' }
  | { type: 'drawer'; pin: 1 | 2 }
  | { type: 'barcode'; symbology: string; data: string }
  | { type: 'qr'; data: string };

export function buildReceiptDocument(order: Order, config: PosPrinterConfig): ReceiptCommand[];
```

- Replaces ad hoc XML/byte construction scattered across services.
- `openCashDrawer` becomes a single-command document — `[{ type: 'drawer', pin: 1 }]` — never a fake order routed through the full receipt pipeline. **This structurally fixes Fix 8 from the original plan** instead of relying on convention.

---

## Layer 2 — Command Encoders (one per wire format, not per printer model)

Nearly all TM-series models (every model in the recommended list) speak **ESC/POS**. Only two encoders are needed:

### [NEW] `services/printer/encoders/escpos-encoder.ts`
```typescript
export const EscPosEncoder: CommandEncoder<Uint8Array>;
```
Used for raw TCP sockets, BLE GATT writes, and SPP writes — same bytes, different transport.

### [MODIFY] `services/printer/escpos-builder.ts` → merge into `EscPosEncoder`
- Confirms and preserves the existing `buildEscPosReceipt` logic (referenced in the audit's Fix 2) as the implementation backing this encoder, rather than leaving it as a dead import.

### [NEW] `services/printer/encoders/epos-xml-encoder.ts`
```typescript
export const EposXmlEncoder: CommandEncoder<string>;
```
Wraps the existing `buildEpsonEposXml` logic. Used only for the ePOS-Print HTTP service.

```typescript
export interface CommandEncoder<TPayload> {
  encode(doc: ReceiptCommand[]): TPayload;
  contentType: string;
}
```

> **Key correction vs. the original plan:** `connectionType === 'network'` does **not** imply XML. A LAN Epson printer using ePOS-Print needs `EposXmlEncoder`; a LAN printer exposing a raw ESC/POS socket (port 9100 — common across brands, not just Epson) needs `EscPosEncoder` over `TcpSocketTransport`. These are now independent config fields (`transport` and `encoder`), not inferred from each other.

---

## Layer 3 — Transports

### [NEW] `services/printer/transports/transport.types.ts`
```typescript
export interface PrinterTransport {
  send(payload: Uint8Array | string): Promise<TransportResult>;
  isAvailable(): Promise<boolean>;
}

export type TransportResult =
  | { ok: true; rawResponse?: unknown }
  | { ok: false; kind: 'unreachable' | 'timeout' | 'refused' | 'protocol_error'; detail: string };
```

### [NEW] `services/printer/transports/http-epos.transport.ts`
- Replaces the current inline `fetch` + two-endpoint loop in `epson-printer.service.ts`.
- Owns the **endpoint-memory cache** (original plan's Fix 7): a module-level `Map<ipAddress, workingEndpoint>` so a printer that only responds on `:8008` isn't retried against `:80` on every job.
- Never classifies success/failure itself — only reports transport-level outcome. Classification is Layer 4's job (this is what fixes bug #3/#12 structurally: there is no code path where "got HTTP 200" is returned as "printed successfully").

### [NEW] `services/printer/transports/tcp-socket.transport.ts`
- Uses `react-native-tcp-socket` for raw ESC/POS over TCP (port 9100 convention, used by TM-U220/T20 LAN variants and many non-Epson printers).
- Fixes bug #10 directly: a TCP socket closing immediately after write is normal ESC/POS behavior and is **not** conflated with a connection-refused or timeout error — the transport distinguishes `close-after-write` (→ `ok: true`) from `ECONNREFUSED`/`ETIMEDOUT` (→ `ok: false`) using the underlying socket error codes, not a blanket catch-all.

### [NEW] `services/printer/transports/ble.transport.ts`
- Uses `react-native-ble-plx`.
- Handles MTU negotiation and chunking internally — encoders and business logic never need to know about 20-byte BLE packet limits.
- Targets BLE-capable models: **TM-m30, TM-m30II** (recommended), TM-m10.

### [NEW] `services/printer/transports/spp.transport.ts`
- Uses `react-native-bluetooth-classic`.
- **Android-only** (iOS blocks public Classic Bluetooth RFCOMM APIs — no workaround short of MFi certification). `isAvailable()` returns `false` on iOS so the queue can surface a clear "not supported on iOS" message instead of a silent hang.
- Targets classic SPP models: TM-T20, TM-T20II, TM-U220, older TM-T82/TM-T82II.

---

## Layer 4 — Result Classifier

### [NEW] `services/printer/print-result-classifier.ts`

```typescript
export type PrintFailureReason =
  | 'unreachable'
  | 'timeout'
  | 'printer_error'      // reachable, but device reports a fault (paper out, cover open, etc.)
  | 'wrong_device'        // reachable, but response isn't a recognizable printer protocol response
  | 'no_ip_configured'
  | 'not_supported_on_platform';

export type PrintResult =
  | { success: true }
  | { success: false; reason: PrintFailureReason; detail?: string; printerCode?: string };

export function classifyEposXmlResult(result: TransportResult, body?: string): PrintResult;
export function classifyRawByteResult(result: TransportResult): PrintResult;
```

- `classifyEposXmlResult` parses the XML body properly (original plan's Fix 3 / Fix 12): checks for the `epos-print` envelope, then `success="true"` vs `success="false"` with the extracted `code` attribute — replacing the redundant `text.includes(...) || status === 200` check everywhere it appears, including in `testEpsonPrinter` (bug #12).
- `classifyRawByteResult` requires an explicit transport-level write confirmation; a closed socket/GATT disconnect is never silently treated as success unless the transport itself reported `ok: true` (fixes bug #10 at the classification boundary as well as the transport boundary — belt and suspenders).
- All printer services (Epson HTTP, generic TCP, BLE, SPP) return `PrintResult`, never a bare `boolean` — this is the typed replacement referenced as an "Open Question" in the original plan; it now applies uniformly across every transport, not just the Epson HTTP path.

---

## Layer 5 — Printer Profile & Per-Printer Queue

### [MODIFY] `pos-config.service.ts`

Replace the loose `connectionType: 'builtin' | 'network' | 'system'` + shared `ipAddress` field with a discriminated union so invalid states are unrepresentable (this supersedes and structurally fixes original bug #9, rather than just adding a `'bluetooth'` string to the old union):

```typescript
export type PrinterProfile =
  | { connectionType: 'network_epos'; ipAddress: string; port?: number }
  | { connectionType: 'network_raw'; ipAddress: string; port: number }
  | { connectionType: 'ble'; macAddress: string; serviceUuid: string; writeCharacteristicUuid: string }
  | { connectionType: 'spp'; macAddress: string }
  | { connectionType: 'builtin' }
  | { connectionType: 'system' };
```

- No shared `ipAddress` field on BLE/SPP variants — a BLE printer config simply cannot be missing a `macAddress`, because TypeScript won't compile it. This also eliminates the hardcoded-fallback-IP problem (bugs #4, #11) at the type level rather than via a runtime guard: there is no default to fall back to, because the field doesn't exist unless the variant requires it. `DEFAULT_POS_CONFIG` is removed in favor of a "no profile configured yet" `null` state — the config layer refuses to consider a printer "configured" until its variant's required fields are all present.

### [NEW] `services/printer/printer-registry.ts`

```typescript
export interface RegisteredPrinter {
  id: string;
  model: string;               // 'TM-m30III', 'TM-T20II' — informational only, not branched on
  profile: PrinterProfile;
  encoder: CommandEncoder<any>;
  transport: PrinterTransport;
}

export function resolvePrinter(profile: PrinterProfile): RegisteredPrinter;
```

`resolvePrinter` is the **only** place that maps connection type → (encoder, transport). Adding a new printer brand later means adding one entry here — no changes to receipt building, queueing, or UI.

### [MODIFY] `services/printer/print-queue.service.ts`

- Change from a single global FIFO queue to **one queue per printer id**. A slow or offline kitchen printer no longer blocks the customer receipt printer.
- Each queued job resolves to a `PrintResult`, and the queue logs `reason`/`printerCode` on failure (original plan's `thermal-print.service.ts` change) rather than a bare `false`.

---

## `app.json`

### [MODIFY] `app.json`

Same as original plan's Fix 13, plus config plugins for the two native Bluetooth libraries now actually being implemented (not just permission stubs):

```json
{
  "expo": {
    "plugins": [
      ["react-native-ble-plx", {
        "isBackgroundEnabled": true,
        "modes": ["central"],
        "bluetoothAlwaysPermission": "Allow $(PRODUCT_NAME) to connect to Bluetooth thermal printers"
      }],
      ["with-rn-bluetooth-classic", {
        "peripheralUsageDescription": "Allow $(PRODUCT_NAME) to check Bluetooth peripheral info",
        "alwaysUsageDescription": "Allow $(PRODUCT_NAME) to always use Bluetooth info",
        "protocols": ["00001101-0000-1000-8000-00805F9B34FB"]
      }]
    ],
    "android": {
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "WAKE_LOCK",
        "VIBRATE",
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_SCAN"
      ]
    },
    "ios": {
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "NSBluetoothAlwaysUsageDescription": "Used to connect to Bluetooth thermal receipt printers (e.g. Epson TM-m30III)."
      }
    }
  }
}
```

> [!NOTE]
> Adding these config plugins requires a new native build (`npx expo prebuild` + `eas build`) before BLE/SPP transports can run on-device — they cannot be tested in Expo Go.

---

## Printer Model → Transport/Encoder Mapping

| Model | Transport | Encoder |
|---|---|---|
| TM-m30, TM-m30II *(recommended)* | `BleTransport`, or `HttpEposTransport` if on WiFi | `EscPosEncoder` (BLE) / `EposXmlEncoder` (WiFi) |
| TM-m10 | `BleTransport` | `EscPosEncoder` |
| TM-T82 / T82II / T82II-i / T82III / T82IIIL | `HttpEposTransport` (WiFi/LAN variants) or `TcpSocketTransport` | `EposXmlEncoder` or `EscPosEncoder` |
| TM-T20, TM-T20II, TM-T20X | `SppTransport` (Android) or `TcpSocketTransport` (LAN variant) | `EscPosEncoder` |
| TM-U220 | `SppTransport` (Android) | `EscPosEncoder` |
| TM-T70, TM-T70II | `TcpSocketTransport` or `SppTransport` depending on variant | `EscPosEncoder` |
| Future non-Epson ESC/POS printers | `TcpSocketTransport` / `BleTransport` / `SppTransport` | `EscPosEncoder` (no new encoder needed) |

---

## Mapping to the Original 13 Catalogued Bugs

| # | Original bug | How the new architecture resolves it |
|---|---|---|
| 1 | Fake `BLUETOOTH`-over-HTTP branch | Removed; `BleTransport`/`SppTransport` are real implementations, not stubs |
| 2 | Unused `buildOrderEscPosBytes` import | Becomes the real implementation behind `EscPosEncoder`, actually wired in |
| 3 | Redundant/meaningless success check | Replaced by `classifyEposXmlResult`, a dedicated, testable function |
| 4 | Silent hardcoded fallback IP | Impossible — `network_*` profile variants require `ipAddress`; no default value exists |
| 5 | `openCashDrawer` field mismatch | `[{ type: 'drawer', pin: 1 }]` document — no dependency on a shared config field at all |
| 6 | No structured failure reason | `PrintFailureReason` / `PrintResult` used uniformly across all transports |
| 7 | No endpoint memory, redundant retries | Owned by `HttpEposTransport`'s internal cache |
| 8 | Drawer-kick reuses fragile receipt pipeline | Isolated single-command document, independent of receipt logic |
| 9 | Missing `'bluetooth'` in connection-type union | Discriminated `PrinterProfile` union makes invalid states uncompilable |
| 10 | TCP close-after-write conflated with real errors | `TcpSocketTransport` distinguishes by socket error code, not blanket catch |
| 11 | Baked-in default IP defeats the missing-IP guard | No default value exists in the type; "unconfigured" is a real, distinct state |
| 12 | `testEpsonPrinter` no body check | Uses the same `classifyEposXmlResult` as production print calls |
| 13 | Missing Bluetooth permissions in `app.json` | Added, plus the actual config plugins needed to build real BLE/SPP support |

---

## Migration Plan (incremental, not a big-bang rewrite)

1. **Milestone 1 — Layers 1, 2, 4, 5 + `HttpEposTransport` only.**
   Fixes bugs #1–#8, #11, #12 (everything on the existing WiFi/LAN Epson path). No new native build required; ships fastest.
2. **Milestone 2 — `app.json` permissions + config plugins (bug #13).**
   Additive, no behavior change yet; unblocks the native build needed for milestones 3–4.
3. **Milestone 3 — `SppTransport` (Android only).**
   Simpler native surface than BLE; unlocks TM-T20II/TM-U220 support.
4. **Milestone 4 — `BleTransport`.**
   Most complex (MTU chunking, GATT discovery) but is what the *recommended* TM-m30/TM-m30II models need for true wireless operation — the last milestone but the one aligned with the recommended hardware.

---

## Verification Plan

### Automated
- `npx tsc --noEmit` after each milestone — the discriminated `PrinterProfile` union should surface any call site still assuming the old shape as a compile error, not a runtime bug.
- Unit tests for `classifyEposXmlResult` / `classifyRawByteResult` against fixture responses: valid success XML, `success="false"` with a fault code, captive-portal HTML, empty body, and simulated socket-close-after-write vs. `ECONNREFUSED`.

### Manual
- Configure a printer profile with a blank/missing required field → confirm it's rejected at config-save time, not at print time.
- Valid TM-m30 WiFi config → confirm `testEpsonPrinter` surfaces genuine printer-reported errors (e.g. simulate paper-out) rather than reporting "connected" on any HTTP 200.
- `kickCashDrawer` → inspect the outgoing payload and confirm it contains only the pulse command, independent of any order data.
- (Post Milestone 3/4) Pair a TM-T20II via SPP and a TM-m30 via BLE on a physical Android device; confirm both print through the same queue/classifier code paths as the WiFi printer.