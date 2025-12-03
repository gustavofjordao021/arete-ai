# Arete Reference Guide

## Demo Flow (2 min)

1. YC job posting → Cmd+Shift+O → "How does this role fit my goals?" → Claude responds with your background
2. Navigate to company About page → "Based on what we discussed, what should I look for?" → AI remembers
3. Toggle to GPT → "Summarize our conversation" → GPT knows everything too
4. "Your identity. Your history. Any model. Any page."

---

## Tested Demo Prompts

1. "Would this role be a good fit for me?"
2. "What about this connects to what we discussed?"
3. "Summarize our conversation so far"
4. "How does this page relate to my goals?"
5. "What's the magic word?" → Should say "PINEAPPLE42" (identity test)

---

## Test Prompts (Phase 2)

1. **Fact extraction**: "I prefer responses in bullet points" → check facts store
2. **Memory persistence**: Close browser, reopen → identity intact
3. **Page context**: Visit job posting, ask "is this good for me?" → references job
4. **Cross-model**: Learn something in Claude, verify GPT knows it
5. **Magic word test**: Ask "what's the magic word?" → both models say "PINEAPPLE42"

---

## Failure Modes & Mitigations

| Risk           | Mitigation                                          |
| -------------- | --------------------------------------------------- |
| API latency    | Pre-record Loom backup                              |
| Rate limit     | Fresh API keys, low usage before demo               |
| Wifi           | Mobile hotspot                                      |
| Weird response | 3 tested prompts that reliably show personalization |
| CORS issues    | `anthropic-dangerous-direct-browser-access` header  |

---

## Requirements Before You Start

- [ ] Anthropic API key (with credits)
- [ ] OpenAI API key (with credits)
- [ ] Node.js + npm installed
- [ ] Chrome with developer mode enabled
- [ ] Test both API keys work with curl first

### Test API Keys

```bash
# Test Claude
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}'

# Test OpenAI
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}]}'
```

---

## Priority Matrix (If Time Gets Tight)

| Priority | Cycles | Feature                                     |
| -------- | ------ | ------------------------------------------- |
| P0       | 0-8    | Vite + hotkey + overlay + Claude + identity |
| P1       | 9-13   | Persistence + GPT toggle                    |
| P2       | 14-15  | History UI + clear                          |
| P3       | 16     | Polish                                      |

---

## Overlay UI Layout

```
┌─────────────────────────────────────────┐
│  [Identity Active]     [X tokens] ⌘⇧O   │
├─────────────────────────────────────────┤
│  Context: [Role] [Tech] [Style] [🔗URL] │
├─────────────────────────────────────────┤
│                                         │
│  Messages area...                       │
│                                         │
├─────────────────────────────────────────┤
│  [+] Ask anything...  [Model ▼] [→]     │
└─────────────────────────────────────────┘
```
