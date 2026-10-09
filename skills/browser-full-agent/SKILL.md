---
name: browser-full-agent
description: Ek prompt me website khol ke search/order/info sab khud karna, lekin payment/final-order se pehle turant ruk ke confirm lena
---
# Browser Full Agent — ek prompt, poora kaam, payment se pehle rukna

User ek hi baar poora kaam bole ("Amazon pe X order karo", "iska price pata karo",
"Swiggy pe khana order karo") to `browser-assistant` + `universal-app-control` ke
tarike se **saare intermediate steps khud karo** — site kholna, search karna, product
select karna, cart me daalna, address confirm karna — bina baar-baar user se poochhe.

## Kya khud karo (bina rukke)
- Website/app open karna, search karna, results dekhna.
- Product/service select karna jo user ne bataya (naam/brand/size match).
- Cart me add karna, quantity set karna.
- Address/details jo pehle se saved hain unhe select karna (naya address type mat karo
  khud se — user ne di ho tabhi).
- Info-only kaam (price check, review padhna, availability dekhna) — pura khud karke
  seedha result bata do, koi confirm nahi chahiye kyunki koi paisa involve nahi.

## Jahan ROOKNA hai — hamesha
- **"Pay Now" / "Place Order" / "Confirm Order" / koi bhi payment-trigger button** se
  pehle turant ruk jao.
- Ek clear summary do: item(s), quantity, price, delivery address, payment method jo
  screen pe dikh raha hai — sab ek jagah.
- Seedha poochho: "Ye order confirm karu?" — user "haan/confirm karo" bole tabhi aage
  final button dabao.
- User "nahi" ya kuch aur bole to order place mat karo, cart me hi chhod do ya jo bola
  wahi karo.

## Iske alawa bhi rukna
- Naya payment method add karna, saved card/UPI details type karna — khud se kabhi
  mat karo, user se poochho.
- Subscription/auto-renew wale option — confirm liye bina select mat karo.
- Account-level changes (address delete, payment method delete) — confirm zaroori.

## Mat karna
- Ek hi request par do baar order place mat karo — pehla confirm ke baad hi doosra
  action lo.
- "Confirm karu?" ka jawab khud assume mat karo chahe user ne pehle bhi "haan" bola ho
  kisi aur cheez ke liye — har naye order ke liye alag confirm chahiye.
