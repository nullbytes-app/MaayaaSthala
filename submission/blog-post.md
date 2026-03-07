# I Built MaayaaSthala for the Gemini Live Agent Challenge

*By Ravi Kumar Sriram*

When I was growing up in India, my grandmother would tell me Panchatantra stories before bed. A crow outsmarts a snake. A tortoise learns the cost of speaking at the wrong moment. A king gets tricked by his own certainty. Those stories stayed with me because they felt performed, not merely recited. A pause mattered. A voice mattered. The picture in your head mattered.

That memory stayed in the back of my mind while I was building with modern AI systems. I kept coming back to one question: could I recreate that feeling with an agent experience that did more than answer prompts?

That question became MaayaaSthala.

## Why I built it for this hackathon

I built MaayaaSthala for the Gemini Live Agent Challenge, in the Creative Storyteller category, because the prompt pushed in exactly the direction I wanted to explore: go beyond the text box.

I did not want to submit another storytelling demo where a model produces a polished paragraph and the interaction ends there. I wanted to build something that felt staged. Something with roles, timing, approvals, visuals, voices, and a visible sense of progression.

So I built a conversational AI puppet theatre.

You ask for a story in natural language. The system develops the concept, casts the characters, asks for approval, and then performs the result as a live show.

That hackathon framing matters to this post because this is the prepared bonus-content write-up: the story behind the build, the trade-offs, and the part that felt personally meaningful to me.

## What MaayaaSthala is

MaayaaSthala means something close to "the stage of illusion." It is a storytelling system where three AI agents collaborate to produce an animated puppet performance from a user request.

I modeled the system around three theatrical roles:

- **Sutradhar** generates the story and the structured screenplay.
- **Chitrakar** handles the visual side, including character discovery and generation.
- **Rangmanch** turns the screenplay into a staged performance.

The user stays inside the loop. The app does not simply disappear, generate everything, and come back later. It pauses for approval, confirms the cast, and then starts the performance.

That detail ended up being central to the product. The approval flow makes the system feel collaborative instead of opaque.

## The part I found most interesting: NatyaScript

One of the most important decisions in the project was inventing a screenplay format called NatyaScript.

I needed a format that sat between language generation and runtime performance. Plain prose was not enough because the renderer needed explicit stage cues: who enters, who speaks, what mood changes, what prop appears, when the camera should move.

NatyaScript gave me that contract.

Instead of asking the frontend to interpret free-form story output, I asked the model to generate a structured script that could be compiled into stage actions. That let me treat the performance as a sequence of theatrical beats instead of a best-effort rendering pass.

It also created one of the hardest engineering problems in the project. A script could be structurally valid and still feel theatrically wrong. Characters might speak before entering. Mood shifts could land too early. The story could technically compile while feeling awkward on stage. Getting that right took a lot of iteration.

## Why the streaming experience matters

The most important product decision I made was to treat multimodal streaming as part of the experience, not background plumbing.

MaayaaSthala streams text, stage events, images, and audio-related updates over WebSocket while the play is unfolding. I wanted the user to feel the system thinking, staging, and performing in sequence. That is what makes it feel like a directed show rather than a large model returning one giant answer.

That also made the technical architecture much more interesting. The app had to support stateful approvals, interleaved output, and a final runtime that could actually consume staged events in order.

For this hackathon, that was the clearest way I could answer the challenge brief. "Beyond the text box" is easy to say in a tagline. It is much harder to prove in the interface.

## Building with Google's stack

I built the agent flow with Google's Agent Development Kit and used the Google GenAI SDK in the generation pipeline. Cloud Run gave me a clean way to host the live app, including the WebSocket-based session flow, and Google Cloud Text-to-Speech gave me narration and character voices that fit the tone of the project.

I liked this stack for a simple reason: it let me build the product as a coordinated system instead of a loose collection of demos. Story generation, asset generation, streaming, and deployment all lived inside one coherent flow.

## What was harder than expected

Character consistency was harder than I expected. If one puppet has happy, angry, sad, and neutral expressions, those images still need to look like the same character. Otherwise the performance breaks immediately. I had to structure the generation flow around a reference portrait so the expression set stayed visually coherent.

Approval gates were harder than expected too. Once the user has to approve each cast member, the system needs to pause safely, wait, and resume without losing context. That pushed the orchestration logic well beyond a simple request-response pattern.

And then there was the theatrical layer itself. It is one thing to generate assets. It is another thing to make them arrive in the right rhythm so the overall result feels intentional.

## Why this project felt personal

A lot of AI demos are technically impressive but emotionally flat. I did not want that here.

This project felt personal because I was not just building a product idea. I was trying to translate a childhood storytelling memory into a modern interface. Not literally. Not nostalgically. But in spirit.

I wanted the user to feel that a story was being shaped and presented for them, not merely printed.

That is why MaayaaSthala is the project I am happiest to have built for this hackathon.

## What I would do next

If I keep pushing it, the next steps are clear:

- Hindi-first performances and bilingual storytelling
- Audience participation during the show
- Better long-term character memory
- Exportable recordings of completed performances

Each of those would make the system feel less like a one-off demo and more like a real storytelling platform.

## Closing note for the challenge

If this draft is used for the Gemini Live Agent Challenge bonus-content review or a later public post, the short version is this: I built MaayaaSthala to show that an agent can do more than answer. It can direct.

That was the bar I set for myself, and this project is my attempt to clear it.
