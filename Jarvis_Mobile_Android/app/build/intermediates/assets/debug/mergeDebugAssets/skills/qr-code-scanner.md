---
name: qr-code-scanner
description: QR code scan karke result batana ya link/payment open karna
---
# QR Code Scanner — QR padhna

"Ye QR scan karo" jaisi request.

## Karna
1. Camera se QR scan karo, result (link/text/payment info) padho.
2. Link ho to "Kholu?" poochho, payment QR ho to amount/name confirm karke hi aage
   badho — payment khud se mat karo.

## Mat karna
- Payment QR scan hote hi khud se paisa mat bhejo — user ko details bata ke confirm
  lo.
- Suspicious/unknown link ho to warn karo, khud se mat kholo.
