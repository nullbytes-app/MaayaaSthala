# Beyond the Text Box

Target duration: 3:15-3:45

## Hook

Most AI storytelling demos stop at a text box. You type a prompt, you get back a response, and the experience is basically over. What I wanted was something calmer and more directed. I wanted it to feel more like a director guiding a performance. MaayaaSthala takes a story request, casts the characters, asks for approval at the right moments, and then performs the result as a live puppet show.

## User Value

For the user, the value is simple. Instead of just reading a generated story, they can shape it and then watch it turn into a performance with voices, visuals, and stage direction. The experience stays interactive all the way through, so they are not just consuming output. They are steering it.

## Story and Cast Approvals

I kept the approval gates on purpose. The app first shows the story concept and asks, "Shall I bring this to life?" I like that moment because it makes the system feel collaborative instead of automatic. It gives the user a chance to say, yes, this is the direction I want.

Then it pauses again for the cast. That second approval matters too. This project is not just about generating text. It is about turning that story into a staged performance. So before anything starts moving on the screen, people get to confirm the characters that will actually carry the scene.

That is an important product choice for me. I did not want the app to disappear for a minute and come back with a fully baked answer. I wanted the user to stay part of the storytelling process.

## Interleaved Output Proof

Once the approvals are done, I use the "let's perform" prompt to start the show. From that point on the system is no longer preparing a response. It is actually running a performance.

And this is the part that matters most to me. The system is not returning one big block of output at the end. It is streaming the story beat by beat, so the chat keeps updating while the stage picks up portraits, dialogue, scene changes, props, expressions, and narration.

For me, that interleaving is where it starts to feel different. You can watch the story assemble itself in real time. A character appears, the chat advances, the scene shifts, and the narration keeps everything moving. That is what makes it feel like a live puppet theatre instead of a text response with decoration added afterward.

It also shows the core idea behind the project. Gemini is not just writing a story here. It is helping drive an experience that unfolds across text, visuals, audio, and stage action together.

## Google Stack Proof

I kept the stack on Google tools because that made the whole flow easier to build and easier to host. I built the multi-agent flow with Google ADK. I used the Google GenAI SDK for generation, Google Cloud Text-to-Speech for voices, and Cloud Run for deployment.

That matters because the demo is not just presenting a concept. It is showing a working hosted system with a real multi-agent flow, real generation, real voice output, and a live session that can carry the performance from prompt to playback. The important part is that all of it is working together in one hosted experience.

## Closing

So to me, MaayaaSthala goes beyond the text box by letting the user guide a story and then watch it become a live puppet theatre. Instead of ending with generated text, it turns the story into something performed.
