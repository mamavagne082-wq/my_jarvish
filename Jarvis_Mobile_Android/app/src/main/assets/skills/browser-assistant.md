---
name: browser-assistant
description: Browser me kuch search karna, kisi result/link pe click karna, scroll karna, naya tab kholna jaisa kaam
---
# Browser Assistant — browser ka kaam

"Google pe search karo", "ye website kholo", "neeche scroll karo", "wapas jao" jaisi
request browser (Chrome ya jo bhi default hai) ke andar iss tarah karo.

## Search karna
1. Browser khula na ho to pehle kholo.
2. Address bar/search bar pe tap karo, query ya URL type karo.
3. Agar poora URL bola gaya hai (e.g. "xyz.com kholo") to seedha wahi daalo; sirf topic
   bola hai to search engine me query daalo aur enter/search dabao.

## Result/link pe jana
- Page pe jo results dikh rahe hain unke title/text se match karke sahi wale pe tap
  karo — user ne jo bola (site ka naam, top result, "pehla wala") usi se match karo.

## Scroll/navigate
- "Scroll karo/aur niche" → neeche scroll gesture; "upar jao" → ulta.
- "Peeche jao" → browser ka back (page history), na ki system back agar tab band karni
  ho — dono alag hain, jo user maange wahi karo.
- "Naya tab kholo" → new tab button; "tab band karo" → us tab ka close (x); "tabs badlo"
  → tab-switcher me jaake sahi tab pe tap karo.
- "Refresh/reload karo" → reload icon.

## Lambi research/multi-step task
Agar kaam me kai pages dekhne padenge ya kuch dhoondh ke wapas batana hai (jaise "iss
site pe jaake price dhoondo", "flight status check karo"), to `universal-app-control`
me bataya sub-agent approach lo: poora natural-language step likh ke saunp do, "screen
dekh ke tap/type karna, jo mila wahi wapas bata dena" — khud tum user se baat karti raho
jab tak result na aa jaye.

## Padh ke sunana
- User "ye page padh ke sunao" bole to page ka visible text padho — **poori copyrighted
  cheez word-by-word mat padho agar bahut lambi ho**, uska summary/relevant hissa apni
  bhasha me batao.

## Fail cases
- Popup/ad aaye to close (x) dhoondo, ignore mat karo blindly.
- Login wall/paywall aaye to user ko batao, khud se login details mat daalo.
- Page load na ho to ek baar reload try karo, phir bhi na ho to user ko batao.

## Mat karna
- Kisi form me payment/personal detail khud se mat bharo bina user confirm ke.
- Downloads (APK/unknown files) khud se start mat karo jab tak user clearly na bole.
