# MaayaaSthala — AI Puppet Theatre

## Inspiration

I grew up with Panchatantra fables, Chandamama stories, and the kind of storytelling that felt bigger than the room it happened in. A voice, a pause, a change in tone, and suddenly you could see the whole scene in your head.

When I entered the Gemini Live Agent Challenge, I did not want to make another experience that stopped at a text box. I wanted to build something that felt staged and directed: a system that could take a story request, cast it, ask for approval, and perform it as a live puppet show.

That became MaayaaSthala: an AI-directed Indian puppet theatre where the interaction is conversational, but the result is a performance.

## What it does

MaayaaSthala turns a natural-language story prompt into a live animated puppet performance.

You can ask for something like "Tell me a Panchatantra story about a clever crow and a greedy snake," and the system will:

1. Generate a story concept grounded in Indian folklore patterns
2. Turn that story into NatyaScript, my custom screenplay format for stage direction
3. Browse or generate the cast with AI-created portraits and expression variants
4. Pause for approval before locking the cast
5. Perform the story with streamed text, images, narration audio, scene changes, props, and stage cues

The key idea is that the user is not just prompting a model. The user is directing a show with approval gates, visible state changes, and a final multimodal performance that goes beyond the text box.

## How I built it

I built MaayaaSthala as a three-agent system using Google's Agent Development Kit (ADK) and the Google GenAI SDK.

- **Sutradhar** is the storyteller. It handles story generation and produces NatyaScript using Gemini 2.5 Flash.
- **Chitrakar** is the visual lead. It browses a character library first, then uses image generation when the right character does not already exist.
- **Rangmanch** is the stage manager. It compiles NatyaScript into runtime stage actions and drives the performance.

Those agents are coordinated by a theatre orchestrator with explicit state transitions for story generation, casting, approval, and performance.

NatyaScript is the bridge between language and staging. Instead of asking the frontend to improvise from prose, the model generates a structured screenplay with commands for entrances, dialogue, narration, props, camera movement, and mood changes. That script is compiled into runtime messages and streamed over WebSocket so the viewer can interleave chat updates, visual assets, and performance events in real time.

On the platform side, I used:

- **Google ADK** for the multi-agent flow and session handling
- **Google GenAI SDK** for generation and asset workflows
- **Google Cloud Run** to host the deployed app
- **Google Cloud Text-to-Speech** for character and narration audio
- **WebSocket streaming** for interleaved output across chat, stage events, images, and audio state
- **HTML5 Canvas** for the puppet-stage renderer

The approval flow matters as much as the generation flow. The app does not silently generate a full show behind the scenes. It asks the user to confirm the story direction and the cast before the final performance begins.

## Challenges I ran into

The hardest part was making NatyaScript reliable enough to feel theatrical instead of merely structured. A script could be syntactically valid and still be wrong for performance if characters spoke before entering or if stage cues arrived in the wrong order.

I also had to solve consistency problems in character generation. Expression variants only work if the happy, sad, angry, and neutral versions still look like the same puppet. I ended up using the neutral portrait as the reference point for the rest of the expression set.

Another challenge was approval gating inside a streaming conversation. The system needed to pause, wait for the user's decision, and then continue without dropping state or overlapping turns.

Finally, I had to make the output feel genuinely interleaved. The challenge framing pushed me to go beyond text, so I treated streaming as a product requirement, not just an implementation detail.

## What I learned

I learned that ADK is a strong fit for creative orchestration when the experience has real stages and handoffs instead of one giant prompt. Splitting responsibilities across agents made it much easier to reason about story logic, visuals, and performance control.

I also learned that the best multimodal experiences need clear contracts. NatyaScript, approval checkpoints, and structured streamed events gave me a much better result than asking the frontend to infer everything from free-form model output.

On the product side, I came away convinced that the most interesting AI interfaces are directed experiences. The chat box can start the interaction, but it should not be the whole experience.

## What's next

Next I want to add Hindi-first performances, audience participation during the show, and exportable recordings so a finished puppet performance can be shared outside the app.

I also want to deepen the theatrical side of the system: stronger continuity for recurring characters, better scene transitions, and richer voice direction per role.

## Built with

- Google ADK
- Google GenAI SDK
- Gemini 2.5 Flash
- Google Cloud Run
- Google Cloud Text-to-Speech
- WebSocket
- TypeScript
- HTML5 Canvas
- Vitest
- Node.js
