---
name: maxkb-knowledge-base
description: MaxKB Enterprise Knowledge Base and RAG Document Q&A Skill
triggers:
  - maxkb
  - knowledge base
  - নলেজ বেস
  - নলেজবেস
  - তথ্যভাণ্ডার
  - ডকুমেন্ট সার্চ
  - কোম্পানি ডাটা
---

# MaxKB Enterprise Knowledge Base Playbook

## Overview
Connects Jarvis AI to the MaxKB Enterprise Knowledge Base platform (https://github.com/1Panel-dev/MaxKB). Allows indexing, searching, and chatting with private enterprise documents, datasets, PDFs, and internal SOPs.

## Execution Rules
1. When user asks a question about indexed documents, manuals, policies, or internal data, query the MaxKB endpoint.
2. Formulate concise, accurate Bangla or English answers based on the retrieved context.
3. If MaxKB is offline or unreachable, seamlessly fall back to local AI models or device search.
4. Keep spoken responses clear, polite, and free of markdown syntax.
