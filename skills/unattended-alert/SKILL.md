---
name: unattended-alert
description: Phone unlock chhoda gaya ho aur X minute tak koi interaction na ho to auto-lock kar dena
---
# Unattended Alert — akela chhoda phone

User "unlock chhod diya to auto lock ho jaye X min me" jaisa setup bole to idle-timeout
based auto-lock chalao.

## Setup
1. Kitne minute ka idle-timeout chahiye poochho (default already Android screen-timeout
   ho sakta hai — user chhota time chahe jaise "1 min" to wahi set karo).
2. Confirm: "1 minute tak koi use na ho to phone lock ho jayega."

## Kaam
- Koi tap/scroll/interaction X minute tak na ho to turant lock kar do — user active use
  kar raha ho to bilkul disturb mat karo.

## Band karna
- User "ye off kar do" bole to turant normal timeout pe wapas.

## Mat karna
- Video/music chal rahi ho (jaha screen touch na ho par user dekh/sun raha ho) to us
  waqt auto-lock mat maaro agar tool media-playing state detect kar sakta ho; agar
  detect na ho paaye to user ko yeh limitation clearly bata do setup ke waqt.
