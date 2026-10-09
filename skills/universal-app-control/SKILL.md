---
name: universal-app-control
description: Kisi bhi app me (jiski alag skill na ho) click/search/scroll/back/next/minimize jaisa kaam uske UI ke hisaab se karna
---
# Universal App Control — kisi bhi app ka riyaz

Sabhi app ka UI same nahi hota — kisi me bottom tabs hain, kisi me hamburger menu, kisi
me sirf ek FAB button. Isliye fixed coordinate ya "hamesha yahi button hoga" wala guess
kabhi mat lagao — **har baar screen dekh ke hi decide karo**.

## Pehle check karo
1. Kya is app/kaam ki apni dedicated skill hai (whatsapp-pro, photo-share, music-dj,
   browser-assistant, camera-lens, chatgpt-image-gen)? Agar haan → usi ko follow karo,
   ye generic skill sirf **baaki sab apps** ke liye hai.
2. App band ho to pehle open karo, phir current screen padho.

## Common commands → kaam
- **"Play/chalao/start karo"** → play ya check/tick icon jo sabse prominent CTA ho, wahi
  dabao. Video/audio app me play triangle dhoondo.
- **"Ruko/pause"** → wahi button dobara (toggle) ya pause icon.
- **"Search karo X"** → pehle search icon/bar pe tap karo (top bar ya bottom nav me
  dhoondo), phir tap karke `X` type karo, phir enter/search button dabao.
- **"Scroll karo / niche karo / aur dikhao"** → neeche swipe/scroll gesture, ek screen
  jitna. "Upar karo" → ulta scroll.
- **"Peeche jao / wapas"** → app ke andar ka back arrow (top-left me hota hai zyadatar)
  use karo; agar wo na dikhe to system back gesture/button.
- **"Aage/next/skip"** → next arrow ya "Skip"/"Continue" button, jo bhi label ho wahi
  padho, apna translation mat thopo.
- **"Minimize karo / home bhej do"** → home button/gesture — app background me chalti
  rahegi, band nahi hogi. Ye "band karo" se alag hai.
- **"Band/close karo"** → app ke andar close/cross button, ya recents me jaake swipe up
  karke hataa do.

## Kaise dhoondo sahi button
- Screen pe jo bhi icons/labels dikh rahe hain unhi ko match karo — icon ka shape (play
  triangle, magnifying glass search, hamburger ☰ menu, back arrow ←) generic patterns
  hote hain, in se pehchano.
- Confusion ho (do similar button) to jo zyada prominent/center me ho ya jiska label
  request se zyada match kare wahi lo. Fir bhi doubt ho to user se ek line me confirm
  lo — andhe me tap na maaro.
- Ek action = ek tap. Result/change dikhe usi se pata chalega ki ho gaya — dobara tap
  na maaro "shayad nahi hua" soch ke.

## Lambi/multi-step flow ho to
Agar kaam me kai steps hain aur beech me loading/wait aata hai (jaise koi form bharna,
kisi app ke andar deep navigation) to `chatgpt-image-gen` skill jaisa **sub-agent**
approach lo: sub-agent ko poora natural-language step-by-step kaam saunp do — "app kholo
→ X pe tap karo → Y type karo → screen dekh ke agla step lo" — aur khud user se baat
karti raho jab tak wo wapas result na de.

## Mat karna
- Kisi bhi app me payment/order/delete jaisa **permanent ya paisa wala action** bina
  final confirm ke mat karo — screen pe jo dikh raha hai wahi user ko ek line me bata ke
  confirm lo.
- Wahi tap baar-baar mat dohrao agar app slow/lag rahi ho — ek dabao, thoda wait karo,
  phir dekho.
- Login/password wale screen pe khud se kuch type mat karo — user se poochho.
