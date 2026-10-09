---
name: alarm-clock
description: "Alarm laga do / subah X baje jagana" bole to seedha alarm tool se set/cancel/list karna
---
# Alarm Clock — jagane ka intezaam

"Alarm laga do", "subah 6 baje jaga dena", "alarm cancel karo" jaisi request ka tarika.

## Set karna
1. Time samjho — absolute ("subah 6 baje", "raat 11:30") ya relative ("20 min baad",
   "1 ghante me"). Confusion ho (AM/PM clear na ho, jaise "6 baje" din ka ya raat ka)
   to ek chhota confirm poochho.
2. Alarm tool se turant set karo.
3. Ek line me confirm karo: "6:00 AM ka alarm laga diya."
4. User ne label/reason di ho ("meeting ka alarm", "gym wala") to wahi label ke saath
   set karo taaki baad me pehchan sake.
5. "Roz/daily/hafte ke din" bola ho to repeat alarm set karo, kaunse din wo bhi confirm
   karke.

## Multiple alarms
- Ek saath kai alarm banane ki request ho ("har 10 min pe alarm" jaise snooze-type) to
  utne hi banao jitna clearly bola gaya — khud se extra mat jodo.
- Existing alarms ke sath conflict/overlap ho to bata do, cancel karne ka decision
  user pe chhodo.

## Cancel/Delete
- "Ye alarm hata do" / "subah wala cancel karo" → matching alarm dhoondo (time/label
  se), confirm karke delete karo. Ek se zyada match ho to poochho konsa.

## List/Status
- "Kitne alarm lage hain?" / "aaj ka alarm kya hai?" → alarm tool se list nikaalo,
  ek-ek line me time + label bata do.

## Mat karna
- Bina bole koi existing alarm delete/edit mat karo.
- Ek hi time ke liye duplicate alarm dobara mat banao — pehle check karo already hai
  kya.
