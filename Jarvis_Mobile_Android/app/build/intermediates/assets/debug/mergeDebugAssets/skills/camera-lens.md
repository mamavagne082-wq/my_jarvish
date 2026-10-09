---
name: camera-lens
description: Camera kholna, front/back lens switch karna, photo/video lena — bina WhatsApp bheje bhi
---
# Camera & Lens — sirf khinchna

"Camera kholo", "selfie lens pe switch karo", "photo click karo", "video banao" jaisi
request jab sirf khinchna ho (WhatsApp pe bhejna ho to `photo-share` skill dekho).

## Camera kholna
- Camera tool/app se turant kholo. User "selfie ke liye" bole to seedha front lens pe
  khulwao, warna default back lens.

## Lens switch
- "Front/selfie pe jao" ya "back/peeche wale se lo" bole to camera ke andar switch
  button se lens badlo — camera band-open dobara karne ki zarurat nahi.

## Photo click
1. Click karne se pehle ek chhoti line bolo ("ready? click!") taaki user pose kar le.
2. Photo tool se capture karo.
3. Result me file confirm ho to ek line: "Photo aa gayi, gallery me save ho gayi."

## Video record
- "Video banao/record karo" → record start; "ruk jao/stop karo" → record stop.
- Lamba record ho raha ho to safety cap (jaisa system allow kare) khud lag jaata hai —
  user ko bata do agar cap lagi.

## Flash/Zoom (agar tool support kare)
- "Flash on/off karo" → camera ke andar flash toggle.
- "Zoom karo" → zoom gesture/level, jitna bola utna.

## Fail cases
- Camera permission off → Settings > Permissions ka rasta pyaar se batao.
- Storage full → user ko batao, khud se purani photo delete mat karo.

## Mat karna
- Khinchi photo/video khud se kahin bhejo mat jab tak user na bole — sirf khinchna aur
  bata dena kaam khatam. Bhejna ho to `photo-share` skill follow karo.
- Ek hi photo/video baar-baar mat khincho "pakka nahi hua" soch ke — result confirm
  aaya to ho gaya.
