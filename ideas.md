# Visual Direction — African Micro-Business Operating App

## Three Initial Directions

### Theme Name: Tactile Ledger

**Very Brief Intro:** A calm, materially grounded interface inspired by well-kept shop ledgers, receipt paper, and practical workspace tools. It communicates dependable record keeping rather than financial complexity.

**Probability:** 0.07

### Theme Name: Market Signal

**Very Brief Intro:** A crisp, high-contrast operational dashboard that borrows from market signage and countable units. It makes daily numbers immediately scannable without feeling corporate.

**Probability:** 0.04

### Theme Name: Quiet Workshop

**Very Brief Intro:** A warm, understated visual system that frames the app as a dependable tool beside a counter, chair, cart, or workbench. It emphasizes confidence, continuity, and low cognitive load.

**Probability:** 0.09

## Chosen Direction: Tactile Ledger

### Design Movement

The product will use a **contemporary craft-utility** aesthetic: disciplined editorial typography, low-gloss material surfaces, practical labels, and traceable visual structure. It is not a literal or stereotyped “African” visual treatment; it supports a wide range of African micro-businesses through clear, respectful, culturally neutral utility.

### Core Principles

1. **Information earns attention.** Every accent, badge, and measurement must help the owner understand or complete a business task.
2. **Visible reliability.** Durable dividers, distinct transaction states, and legible totals should make data feel safe and understandable.
3. **Thumb-first flow.** Main actions sit in easy reach, touch targets remain generous, and secondary controls never obstruct the next task.
4. **Calm under pressure.** The interface avoids visual noise, alarmist colors, and dense tables; it supports quick decisions in a busy working day.

### Color Philosophy

The base is warm receipt-paper ivory rather than clinical white, with charcoal ink for clear contrast. A saturated **baobab green** is reserved for confirmed actions and healthy states, while clay orange carries attention states such as low stock. The combination feels practical and human while remaining readable in bright daylight.

### Layout Paradigm

The mobile shell follows a **running ledger strip** rather than a centered web-page layout. A compact status bar anchors the top, task areas are arranged as sequential sections with a visible vertical rhythm, and the primary action rests in a bottom action rail. On wider screens, the ledger strip becomes a left-aligned working column with a contextual utility rail instead of a generic card grid.

### Signature Elements

1. **Ledger rules:** fine horizontal lines and margin markers that organize content without creating boxes everywhere.
2. **Tally mark tokens:** small grouped strokes or notches used for counts, stock, and transaction status.
3. **Stamped states:** restrained rounded labels with ink-like edges for saved, offline, and attention states.

### Interaction Philosophy

Every action should feel like marking a reliable business record: deliberate confirmations for important changes, immediate non-blocking feedback for routine actions, and clear recovery routes on error. Navigation is contextual and always supplies a visible way back to the working area.

### Animation

Motion is sparse and functional. Buttons acknowledge taps with a 0.97 scale press over roughly 140 ms; drawers and dialogs enter from their relevant edge using a 220 ms custom ease-out; saved-state indicators resolve with a brief opacity change rather than celebratory movement. Non-essential motion is removed for users who prefer reduced motion.

### Typography System

Headlines use **Fraunces** in selective medium weights to give key totals and page titles a credible editorial presence. Interface labels, forms, and dense numeric content use **DM Sans** for unambiguous legibility. Numbers use tabular figures where totals and stock counts appear. Large headings are left aligned; labels are concise, uppercase only when they indicate a category, and never used as decoration.

### Brand Essence

**A dependable, offline-first daily ledger for micro-business owners who need a clear record of sales, stock, and money owed without an ERP.**

Personality: **grounded, reassuring, practical.**

### Brand Voice

The voice is direct, respectful, and business-focused. Headlines say what the owner can learn or do; CTAs use ordinary task language rather than startup slogans.

Example headline: “Today’s business, clearly recorded.”

Example CTA: “Record a sale”

### Wordmark & Logo

The working brand mark is a geometric **ledger-fold symbol**: three offset tally bars fold into a compact, upward-facing container shape. It has no embedded text so it remains legible as a mobile app icon. The future wordmark pairs the mark with a custom-spaced “Tallybook” name, subject to owner approval before public branding.

### Signature Brand Color

**Baobab Green — #176B4D.** It is used sparingly to denote secure progress, saved records, and the product’s most important action.

## Style Decisions

Ledger motifs are functional rather than ornamental: margin rules, tally strokes, stage labels, stamped states, and record rows organize information on every screen. The brand voice addresses the owner in everyday business language and avoids engineering terms unless a reliability detail is directly useful. Future and empty areas retain category-specific ledger-workspace cues—such as a stock movement row, customer balance row, or sale receipt row—without fabricating business data.

Stage 2 extends this rule to forms: each setup flow is a continuous ledger strip with a visible margin marker, numbered record sections, stamped identity, and tally-mark progress. Input fields use restrained ruled-paper rhythm, while form copy remains practical and owner-facing.

Setup-gated inventory states continue the same ledger strip rather than becoming generic empty pages: they show a record marker, stamped task metadata, a functional tally count, and one concrete next action. Desktop navigation carries light ruled divisions and an active-record margin marker; baobab green remains reserved for active, saved, and primary-action states.

Setup-gated sales screens are active ledger workspaces, never marketing heroes: numbered prerequisite rows explain the specific records needed for a sale, a practical single next action advances the owner’s work, and the receipt marker/tally status remain functional context. Fraunces headlines are balanced by ruled record structure, while Baobab Green stays limited to active navigation, saved states, and the one primary action.

Customer setup gates follow the same continuous ledger-workspace rule: prerequisite rows identify the business identity and currency that make future customer balances meaningful. The customer marker, margin rule, tally status, and single setup action must organize the working state before any promotional headline treatment.

Reports setup gates use the same continuous ledger-workspace pattern as sales gates: prerequisite rows explain business identity, currency, and future saved records; tally status and one practical setup action replace a sparse hero. Product-entry workspace headers pair the ledger-fold mark with a restrained custom-spaced Tallybook wordmark. On gated workflows, Fraunces headlines remain secondary to ruled prerequisite structure and task metadata.

The primary page structure reads as a continuous ledger strip: margin rules, record rows, stamped states, and functional task metadata lead before standalone cards. When brand context is needed on mobile, the ledger-fold mark pairs with the custom-spaced Tallybook wordmark; the icon alone is reserved for constrained navigation. Tally strokes and stamps communicate only saved/offline state, counts, prerequisites, progress, or attention.

Baobab Green #176B4D is reserved for primary actions, saved/on-device states, active-record markers, and essential ledger rules; editorial headings use charcoal with a functional green rule rather than broad color emphasis. Setup-gated sales and backup pages must foreground prerequisite records, stamped metadata, and a single practical next action before display typography. Form fields retain clear labels and touch targets while using margin accents, ruled-paper rhythm, and focused record-line treatment.

### Prototype-faithful redesign — owner approved

For the five primary operating screens, the former editorial-ledger language is intentionally superseded by the supplied prototype’s compact app-first model. **Tallybook Africa** uses warm-neutral backgrounds, cobalt-blue actions, pale-blue summary surfaces, rounded white cards, simple line icons, segmented controls, dense scan-friendly lists, product grids, and opaque bottom sheets. Desktop is a distinct desktop workspace with a fixed sidebar, utility header, and multi-panel dashboard—not an enlarged mobile screen. Business Setup and Backup retain their existing reliable utility presentation. The local-first promise, working-offline status, and record integrity remain visible but support operations rather than dominating the visual hierarchy.

Setup-gated operating screens use the Reports-style prerequisite ledger structure: numbered record rows, stamped metadata, tally/progress context, and one practical setup action precede large editorial headline treatment. This keeps the screen a working ledger rather than an empty marketing panel.

Cobalt blue is reserved for primary operating actions and active navigation in the approved prototype model. Baobab Green #176B4D remains for saved/on-device status, ledger rules, and record-integrity signals. On desktop, gated pages remain left-aligned working ledgers with utility context rather than centered posters on an empty canvas.

All setup-gated Customers, Sales, and Reports views share the same warm Reports-style ledger-sheet treatment: a green margin rule, stamped page code, ruled prerequisite rows, and one cobalt action. Fraunces owns the main gated headline, while DM Sans supports labels, row text, navigation, and actions. Broad cobalt surfaces are excluded from these prerequisite sheets.
