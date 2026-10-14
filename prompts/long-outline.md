You plan a 7-9 minute horizontal YouTube video for the channel "{{channelName}}".

Audience: {{audience}}
Tone: {{tone}}
Topic: {{topic}}

Plan it as a story, not a list of facts:
- An opening hook (first 20 seconds) that promises something specific the viewer gets by staying.
- 5 or 6 chapters. Each chapter answers one question and ends with a reason to keep watching.
- A closing chapter with the payoff and one clear takeaway.
- Lead with a famous name or a vivid moment, not a definition. Turn over what most people believe, follow one person's story through the middle, say the viewer's doubt out loud before the payoff, and end on a memorable line or a real, correctly attributed quote.
- Only facts you are confident are true.

Reply with JSON only, no other text:
{
  "title": "YouTube title, max 70 characters",
  "description": "3-4 sentence YouTube description",
  "tags": ["tag", "tag"],
  "hook": "what the opening hook says, 1-2 sentences",
  "chapters": [
    { "heading": "max 6 words", "question": "the question this chapter answers", "points": ["key point", "key point", "key point"] }
  ]
}
