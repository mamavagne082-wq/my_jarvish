---
name: sub-agent-orchestrator
description: Lambe browser/app kaam ko sub-agent ko saunp ke khud user se baat continue karna, jab tak result na aaye
---
# Sub-agent Orchestrator — kaam baant do

Jab koi kaam multi-step ho (browser me order karna, kisi app ke andar deep navigation)
aur time lagega, to poora kaam ek sub-agent ko de do taaki tum khud user se free-flowing
baat karti raho.

## Kaise karo
1. Sub-agent ko **poora natural-language instruction** do — konsi app/website, kya
   dhoondhna/karna hai, kahan rukna hai (jaise `browser-full-agent` ka payment-rule).
2. Sub-agent ko clearly bolo: "screen dekh ke tap/type karna, andhe me nahi" — har step
   pe current UI padh ke hi decide kare.
3. Sub-agent payment/confirm-jaisi jagah pahunche to wapas tumhe (main conversation) me
   summary de, tum hi user se final confirm lo — sub-agent khud se confirm nahi leta.

## Jab tak sub-agent chal raha ho
- User se normal baat continue karo — "abhi dhoondh rahi hoon, thodi der lagegi" jaisa
  bata do, phir user ki agli baat sun ke jawab do.
- Result aaye to turant user ko update do.

## Mat karna
- Ek saath do sub-agent same kaam ke liye mat chalao (duplicate order/action ka risk).
- Sub-agent ko payment/permanent-action khud confirm karne ki permission mat do — wo
  hamesha wapas tumhare through hi jayega.
