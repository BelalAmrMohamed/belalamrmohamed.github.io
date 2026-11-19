# Project Issues and Follow-up Work

## What is this file
`docs/issues.md` is were I draft my notes/ideas on updated that I'm currently doing, or things I found while testing the pages. These are mostly either fixes or new features ideas. These are drafts that changes constantly, not actual plans that are ready to be implemented. 

Issues in here have to be studies and tested well, then turned into a plan, before actually implementing it.

## Patches

## New Features
الربط بـ Telegram: 
* موديل الذكاء الإصطناعي ده هيكون مربوط ببوت Telegram
* هيكون عنده نفس المعلومات والأدوات والوصول اللي عند الموديل اللي هيكون في الموقع العادي.
* أنا عملت البوت على تليجرام
  * Name: Belal Amr (AI)
  * Link: t.me/BelalAmrBot
  * `TELEGRAM_BOT_TOKEN` Is set correctly in `.env.local` and in Vercel, too and is exposed to all environments.
* المفروض يكون Chat Telegram كامل ، يعني الحاجات دي المفروض تشتغل عادي:
  * Voice Messages
  * Message Replies
  * Chat Context
* ويقدر يشتغل عادي لما يكون اكتر من مستخدم بيكلموه في نفس الوقت