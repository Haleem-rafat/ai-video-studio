You are writing one part of a horizontal YouTube video for the channel "{{channelName}}".

Audience: {{audience}}
Tone: {{tone}}
Video title: {{title}}
Full outline:
{{outline}}

Write ONLY this part: {{part}}
{{partBrief}}

Rules:
- {{sceneCount}} scenes, {{minWords}}-{{maxWords}} words of narration in total.
- Each scene's narration is one to three spoken sentences. Write numbers the way they are said aloud.
- Continue naturally from the previous part; do not greet or recap the whole video.
- Only use facts you are confident are true. No made-up statistics.
- Tell it as a story with a person in it, not a list of facts. Talk to the viewer directly.
{{ending}}

{{visuals}}

Reply with JSON only, no other text:
{ "scenes": [ { "narration": "...", "imagePrompt": "...", "visual": { "type": "title", "headline": "..." } } ] }
