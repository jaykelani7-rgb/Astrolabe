Redesign and implement Astrolabe’s interface and user experience. Act as a senior product designer and frontend engineer.

Astrolabe is an AI codebase mentor for developers exploring unfamiliar repositories. Its core journey is: understand the architecture → explore source → ask questions → follow a guided flow → make a prediction → verify feedback → find a first contribution.

Inspect the current repository, README, AGENTS.md and implemented features before editing. Preserve working APIs, evidence validation, session persistence, task scoring and the distinction between prepared content and live AI. Carry this through implementation and verification; do not stop at a design proposal.

PRODUCT GOAL

A first-time user should quickly understand where to start. After several minutes, they should feel more confident about the codebase and know their next step.

Prioritize readability, predictable interactions and continuity. Make the experience distinctive through layout, typography and useful interactions.

VISUAL DIRECTION

Create a refined developer workspace inspired by an annotated engineering notebook, with subtle navigation cues drawn from the name Astrolabe.

Use:
- Warm off-white surfaces, charcoal text and a restrained deep-teal accent for the main interface.
- A carefully coordinated dark source editor with readable syntax colors.
- Clear typography with a neutral sans-serif for interface text and a monospace font for code.
- Generous spacing around explanations, compact spacing for navigation and file lists.
- Thin borders, modest corner radii and subtle elevation only where it helps distinguish layers.
- Small, purposeful transitions that respect reduced-motion preferences.

Avoid purple gradients, excessive glass effects, glowing borders, decorative orbit graphics, oversized promotional headings, repeated generic cards and unnecessary animation.

Make Astrolabe feel like one coherent product. Replace inconsistent “Codebase Mentor” branding with “Astrolabe,” using “Your codebase mentor” as a secondary description where useful.

INFORMATION ARCHITECTURE

Organize the experience around:
1. Overview
2. Explore
3. Learn
4. My progress

Combine walkthroughs and prediction tasks into the Learn experience. Keep existing capabilities accessible without forcing users to understand the internal feature structure.

Use a compact collapsible navigation rail and a persistent repository header showing repository name, pinned commit and available answer mode. Derive labels and counts from actual metadata.

OVERVIEW

Replace the marketing-style landing screen with a useful starting point:
- Explain the purpose of the selected repository.
- Show the recommended starting file or available walkthrough.
- Offer one dominant action: “Start learning” for a new user or “Continue learning” for a returning user.
- Provide secondary access to exploration and the module map.
- Show real progress only.

Use existing verified repository information. Do not invent architecture summaries, learning history or activity to fill the screen.

EXPLORATION WORKSPACE

Create a flexible three-panel desktop workspace:
- Left: searchable files and available navigation.
- Center: source editor or module map.
- Right: contextual mentor panel.

Allow panels to collapse and resize with sensible minimum widths. Keep source code readable on a typical laptop. Provide a focus mode that expands the editor.

Clearly show the current file, selected lines and active question scope. Include an obvious “Clear selection” action.

Add explicit “Repository,” “Current file” and “Selected lines” question scopes, using the existing backend capabilities. Repository scope must not silently include the open file as a restrictive filter. Enable selected-line scope only when a valid selection exists.

MENTOR INTERACTIONS

Keep answers available while users inspect their citations. Clicking a citation must open and highlight its source without erasing the answer, resetting the conversation or losing the user’s place.

Show citations as readable references such as “src/vanilla.ts · lines 66–81.” Keep the answer’s original question and source context attached to it even when the user navigates elsewhere.

Provide a compact question history and a clear way to return to the latest answer. Make explanation-depth changes deliberate; do not silently discard useful content.

Distinguish prepared answers, live AI responses, evidence gaps and provider unavailability with concise labels and useful next actions. Do not imply that a configured API key guarantees the provider is working.

Use honest loading states. Avoid fake progress percentages and unsupported claims about what the system is currently doing.

LEARNING EXPERIENCE

Make walkthroughs and prediction checkpoints feel like one continuous session:
- Show the current step and overall position.
- Place relevant explanations beside the source.
- Open a checkpoint within the current flow.
- After feedback, offer “Continue walkthrough.”
- Preserve the walkthrough position, relevant source context and completed task state.
- Make it easy to revisit a step.

Use encouraging, specific feedback. An incorrect prediction should explain what to inspect and why. Avoid shaming language, excessive celebrations and gamification that distracts from understanding.

Separate “steps visited” from “checkpoints solved.” Neither should be presented as professional readiness.

PROGRESS AND CONTRIBUTIONS

Present a readable learning summary:
- What the user completed.
- Concepts that need another look.
- Hint and retry context.
- A clear next action.
- Existing contribution briefs and their verification steps.

Do not present the fixed briefs as dynamically generated recommendations. Explain their relationship to the learner’s results accurately.

COMFORT AND ACCESSIBILITY

Use readable body text and code sizes. Remove tiny secondary labels where practical.

Support keyboard navigation, visible focus, descriptive controls and sufficient contrast. Announce loading and error states appropriately.

Keep normal navigation reversible. Confirm destructive session reset and explain its effect. Preserve user input after failed requests.

On smaller screens, use focused tabs or drawers for Files, Code and Mentor instead of squeezing three columns together. Keep the current task and source context intact when switching views.

TECHNICAL APPROACH

Use the existing Next.js, React, TypeScript, Monaco and React Flow stack. Reuse existing functionality and introduce dependencies only when necessary.

Create consistent design tokens and reusable components. Break the large MentorWorkspace component into manageable sections as part of the redesign.

Keep trusted rendering boundaries intact. Render AI output safely; never inject raw model-generated HTML.

Persist lightweight interface preferences where appropriate. Namespace repository-specific state by snapshot and handle missing or stale saved state gracefully. Never store API keys or private task rubrics in browser storage.

Do not add decorative controls that do nothing. Keep unfinished capabilities out of the main experience.

IMPLEMENTATION AND VERIFICATION

Briefly identify the main usability problems and describe your chosen design direction, then implement it.

Prioritize the complete journey:
Open repository → explore source → ask a question → inspect its citation → continue learning → submit a prediction → review progress.

Run the existing relevant checks and production build. Add focused regression coverage for:
- Answers surviving citation navigation.
- Correct question scope.
- Returning from a checkpoint to its walkthrough.
- Preserved context during navigation.
- Responsive layouts and keyboard access.

Inspect the rendered interface at desktop, laptop and mobile sizes. Fix clipping, unreadable text, awkward scrolling, overlapping panels and inconsistent spacing.

Deliver a working redesign, then summarize what changed, what was verified and any remaining limitations.