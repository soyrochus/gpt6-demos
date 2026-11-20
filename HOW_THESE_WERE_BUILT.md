# How these demos were built

Case studies in building software with OpenAI models

> **Draft for author review — updated 18 November 2026.** This account draws on the repository's specifications, architecture guides, implementation records, and verification reports. It reports their recorded results; the checks were not rerun for this document. Author notes identify missing development history to add before publication.

## What this collection is exploring

The applications in this repository explore how far AI-assisted development can go across different kinds of software: interactive simulations, native desktop applications, creative tools, and applications that call models themselves.

The finished applications are one part of that story. Another is the work needed to make them useful: defining behavior, connecting subsystems, checking results, refining interactions, and dealing with failures. A convincing demonstration should make enough of that process visible for another builder to learn from it.

Each project tests a different part of software development.

| Case study | Engineering focus | AI use while running the application |
| --- | --- | --- |
| Dipper | Transforming real astronomical catalogues and checking the view against independent ephemerides | Runs locally in the browser |
| Fuel Left | Translating a photographed table and written rules into an original 3D pinball game | Runs locally in the browser |
| Elfspace | Building an interactive 3D scene and a responsive score in 15 minutes | Runs locally in the browser |
| Digital Logic Laboratory | Keeping an assembler, simulated computer, circuit hierarchy, and debugger consistent | None required |
| NotAVirus | Native desktop behavior, reusable animation packs, and platform-specific integration | None required; generated artwork is bundled |
| Assemblavatar | Generating executable modelling code, inspecting rendered results, and managing refinement | GPT-6 Astra generates and evaluates models; handwritten examples and manual source builds work without an API key |

The repository presents these applications as demonstrations of GPT6-assisted software development. Exact development-model attribution, original prompts, elapsed effort, and the division of human and agent work still need to be supplied for Digital Logic Laboratory, NotAVirus, and Assemblavatar. Assemblavatar's documented runtime model is a separate fact from the models used to build the application.

## Dipper

Dipper packs a pinned HYG catalogue into a local binary asset. A single observer and UTC clock drive the GPU star field and planetary ephemerides. The mathematical tests compare positions against stored Astropy and NASA Horizons observations, and browser tests exercise the rendered scene. [Source and controls](./dipper/README.md) · [Accuracy checks](./dipper/docs/ACCURACY.md)

## Fuel Left

The playfield photograph guided the cabinet layout. Three.js draws original geometry and a procedurally illustrated playfield. A fixed-step simulator owns the ball, while a separate mission reducer handles target selection, ordered objectives, fuel and rank. Bun runs the headless physics and scoring tests, including cradling a dropped ball and handing a multiplayer game from one player to the next. [Project and controls](./fuel-left/README.md) · [Specification](./fuel-left/spec-fuel-left.md)

## Elfspace in 15 minutes with GPT-6.2 Astra

The author reports **15 minutes of total development time** for Elfspace with GPT-6.2 Astra. The result is a single HTML file containing a Three.js cavern, twelve animated figures, flight controls, and a synthesized score. Its bundled runtime lets a reader open the same file offline. [Source and launch instructions](./dmt-experience/README.md)

One interaction shows what that time bought. Turn on the sound, fly toward a figure, and stop. After six seconds of stillness the figures begin to approach. Their changing distance affects the score, and their masks change expression as you watch. [As-built specification](./dmt-experience/spec-dmt-experience.md)

## Digital Logic Laboratory: making the layers agree

### The brief

[Digital Logic Laboratory](digital-logic-laboratory/README.md) lets someone build circuits, assemble programs, and inspect a running 16-bit computer. Its defining requirement is that a user can follow execution down through the abstraction layers: from an instruction, through registers and the arithmetic unit, to the underlying logic network.

That requirement gives the project a concrete test of correctness. When the interface displays a calculation, its circuit inspection must show the computation actually responsible for the result.

### The engineering work

The application combines a circuit library, graph compiler, simulator, assembler, machine controller, debugger, and spatial interface. Each layer has to agree about signals, instructions, state, and timing.

The [H16 architecture](digital-logic-laboratory/docs/H16.md) describes the implementation boundary precisely. Arithmetic and bitwise results come from the simulated NAND network of the ALU. Registers use simulated edge-triggered bit cells. Instruction decoding, CPU control, and memory are behavioral components. The project therefore makes a specific, inspectable claim about its circuit-backed datapath without claiming a complete transistor-level computer.

This is a useful example of the demands placed on generated software as a project grows: individually plausible components must also form a coherent system.

### A recorded iteration

The [browser review from 9 September](digital-logic-laboratory/docs/browser-qa.md) records changes that made execution understandable. Feedback moved from an off-screen footer into a prominent panel. Short programs retained their results. Breakpoints and faults gained explicit explanations, and active hardware became highlighted.

The review also caught behavioral problems. Typed circuit inputs could lose a change on blur. Editing a circuit into an incomplete state needed to invalidate the previous simulator. Development-worker caching needed adjustment so reloads exercised the current implementation.

These fixes show why the development loop needs actual interaction with the application. A correct arithmetic result alone does not establish that a learner can follow it or trust the state shown by the interface.

### What the evidence supports

The documented tests compare adders and the ALU against independent arithmetic expectations, exercise instructions and sequential behavior, and run complete programs. Browser checks followed an addition through execution and writeback: the result becomes 58, with the register changing at the correct phase. Pong executes on the simulated machine and writes its framebuffer through machine instructions.

The browser record covers Chrome and several viewport sizes. It leaves physical touch interaction and some end-to-end input and import/export checks open.

**Lesson:** define the relationships that must remain true across the system, then test them at multiple levels. For this application, following the same calculation from source to signals provides stronger evidence than inspecting a screenshot.

> **Author note:** Add the original development request, models/tools used, and one representative intervention that helped the agent keep the machine and its visualization consistent. The repository records the specification and subsequent fixes, but not a complete account of who directed each decision.

## NotAVirus: carrying an idea onto a real desktop

### The brief

[NotAVirus](not-a-virus/README.md) is a small desktop companion that follows the pointer, rests, and sleeps. Its apparent simplicity hides several requirements: transparency, click-through behavior, animation timing, display coordinates, pack management, resource use, and clean startup and shutdown.

It runs through AppKit on macOS and a GNOME Shell 50 extension with a Rust helper on Ubuntu Wayland. Its behavior and animation run locally without model calls.

### The engineering work

The implementation separates reusable behavior and pack loading from the desktop integration. Character packs contain images and declarative animation data. Shared Rust code handles movement, behavioral states, and clip playback; each platform supplies the connection to its desktop.

That separation gave the Ubuntu implementation a reusable core while leaving platform-specific rendering, menus, coordinates, and lifecycle handling to the GNOME integration.

The artwork has its own documented production process. The [gatita artwork record](not-a-virus/art/gatita/README.md) links the supplied reference, generation prompts, generated source, and rebuilding instructions. The generated poses needed extraction, consistent scaling, transparency handling, and registration before becoming runtime animation frames. Image generation was one stage in producing a usable asset.

### Recorded iterations

The [Ubuntu implementation record](not-a-virus/IMPLEMENTATION_PLAN_UBUNTU.md) describes native API problems found through compositor tests, including an incorrect graphics-context accessor. Those issues required checking the actual platform behavior.

It also records a performance investigation. Initial idle CPU measurements exceeded the specification's target. Avoiding redundant rendering updates helped, but did not resolve the gap. Further measurements pointed toward scheduling and helper round trips. A bounded rest hint then reduced requests while preserving prompt responses to pointer and control changes.

The final repeated headless measurements still exceeded the original 1% idle CPU target. The author explicitly accepted that tradeoff for the current implementation; the record preserves the failed target and subsequent measurements.

### What the evidence supports

The Ubuntu record reports 432 compositor-rendered frame, size, and facing comparisons, plus tests of pack-switch failures, helper recovery, and repeated enable/disable cycles. The macOS record separately documents native rendering, controls, import checks, and outstanding acceptance work.

Those records also distinguish isolated automated checks from physical desktop acceptance. Actual click and drag behavior across applications, mixed-display configurations, and hardware lifecycle checks remain separate tasks where marked untested.

**Lesson:** a portable core and a native application require different kinds of evidence. Platform tests, asset inspection, and performance measurements make the development process concrete. Keeping missed targets visible also makes an accepted tradeoff understandable.

> **Author note:** Add the initial concept and development prompt, coding-model attribution for each platform, and a short account of your art direction. The artwork prompts and implementation logs provide unusually useful source material; explain how you selected and corrected the results.

Sources: [macOS implementation record](not-a-virus/IMPLEMENTATION_PLAN_MACOS.md), [Ubuntu implementation record](not-a-virus/IMPLEMENTATION_PLAN_UBUNTU.md), and [pack authoring guide](not-a-virus/PACK_AUTHORING.md).

## Assemblavatar: closing the loop around generated code

### The brief

[Assemblavatar](assemblavatar/README.md) asks a model to produce editable procedural 3D geometry from a description and optional reference images. The application builds the generated code, renders several views, and sends those views back for evaluation and bounded refinement.

This makes it both a software-development case study and a demonstration of AI operating inside the finished product.

### The engineering work

The [architecture guide](assemblavatar/docs/architecture.md) describes the loop:

1. Supply the modelling contract and request to GPT-6 Astra.
2. Validate the generated TypeScript and execute it in an isolated QuickJS worker with resource limits.
3. Pass scene data to the trusted renderer and produce seven views.
4. Save and display the draft, then request evaluation and any permitted refinement.
5. Preserve the resulting artifacts and distinguish drafts from accepted revisions.

This structure lets the application check different questions separately: whether source is valid, whether geometry can be built and exported, and whether the result meets the visual brief. The evaluator's acceptance is one source of feedback; it does not establish human satisfaction or realistic likeness.

### Recorded iterations

The [implementation record](assemblavatar/implementation-state.md) describes a successful live house generation and a subsequent refinement that changed its roof color using a labelled synthetic reference. These are bounded examples of successful generation and visual feedback.

A photo-guided likeness attempt exposed a more difficult sequence. Requests timed out, recovery encountered exhausted API credits, and later work changed request handling to background creation and polling. After credits were replenished, the recorded run completed generation and refinement, but evaluation still rejected the anatomy and recognizable likeness.

The record reports roughly 470 seconds for that particular runtime attempt. That is a generation-run measurement, not the time required to develop the application.

A subsequent user instruction changed how incomplete results appeared: every rendered draft should be visible before evaluation. The application now retains those drafts across later refinement, cancellation, and errors. A quality shortfall can end as **Needs review**, with something the user can inspect, edit, or export.

### What the evidence supports

The recorded tests cover validation, execution budgets, rendering, export and reload, and the handling of drafts and revisions. Live evidence supports the documented house generation and refinement. The realistic-likeness attempt remains evidence of a limitation, even though the surrounding execution and recovery mechanisms worked.

Some detailed reports and generated assets referenced by the implementation log are local ignored data. The checked-in narrative is available to readers; those underlying artifacts are not all supplied as reproducible public fixtures.

**Lesson:** make intermediate work visible and preserve it. Treat execution success, automated quality evaluation, and the user's judgment as distinct outcomes. A useful application needs a path forward when generation produces an imperfect result.

> **Author note:** Add the original application-building prompt, development-model attribution, and your reasoning behind the visible-drafts requirement. Before publishing example outputs or request logs, select material suitable for sharing and include enough context to distinguish handwritten fixtures, synthetic references, and live generations.

## A workflow readers can take from these examples

The records suggest a repeatable approach. This is a synthesis of the documented work, rather than a claim that every project followed an identical sequence.

1. **Define observable behavior.** Describe what a person should be able to do and what must remain true. An inspectable calculation, a click-through companion, and a recoverable model draft are concrete targets.
2. **Make component boundaries explicit.** Specify the state and contracts shared by the simulator and debugger, the behavior engine and desktop shell, or the generator and modelling runtime.
3. **Exercise a complete path early.** Follow an instruction to its result, render a character on the target desktop, or generate and export one object.
4. **Use checks that can reveal a wrong implementation.** Independent arithmetic expectations, native pixel comparisons, and geometry-preserving export checks test more than whether code completes without an error.
5. **Review the experience.** Watch where results disappear, state becomes confusing, or long-running work leaves the user without feedback.
6. **Retain failure evidence and name the remaining limits.** Record what failed, what changed, what subsequently passed, and what still needs human or hardware verification.

## Development history to add before publication

The most valuable next addition is the author's account of directing the work. For each case study, fill in:

| Missing detail | What would make it useful |
| --- | --- |
| Starting point | The original prompt or brief, plus the code, assets, and specifications already available to the agent |
| Models and tools | Which models handled coding, review, and asset generation; dates and relevant settings where recorded |
| Human contribution | Product decisions, supplied references, manual edits, testing, and significant corrections or changes of direction |
| Development sequence | A few representative prompts and responses that explain how the implementation changed |
| Effort and cost | Recorded active human time, elapsed agent work, and attributable costs; mark estimates or unavailable data explicitly |
| Shareable evidence | Selected intermediate and final outputs, with links to relevant commits or public fixtures |

Commit dates establish checkpoints, but do not establish hours worked or how much intervention was required. Unrecorded details should stay identified as such. The finished case studies should let a reader understand both the software that resulted and the decisions that helped produce it.
