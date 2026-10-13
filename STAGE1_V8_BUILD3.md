# Stage 1 — V8 Build 3: camera scanning and touchscreen checkout

- Added optional local camera barcode recognition via browser BarcodeDetector + getUserMedia. Camera frames remain on-device.
- Camera tracks and animation loops are released on close, unmount, and successful detection, including delayed permissions.
- Permission denial, insecure context, unsupported browsers and camera failures retain working manual SKU/barcode entry.
- Detection uses the existing SKU/barcode lookup and stock checks; no direct ledger write occurs.
- Enlarged cart quantity buttons and scanner actions to a minimum 44px touch target.

## Remaining release gates

- Run complete TypeScript checking, Vitest, browser/device validation, camera permission flows, cash/credit/partial payment and receipt testing.
- Test Chrome/Android camera recognition and browsers without BarcodeDetector (e.g. many iOS browser versions).
- Camera scanning is only supported where BarcodeDetector exists; no third-party library is bundled.
- Thermal printer adapters and comprehensive offline tests remain outstanding.
