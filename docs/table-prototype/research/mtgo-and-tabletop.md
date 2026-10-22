# Digital MTG board layouts: web research (2026-10-22)

Method: WebSearch/WebFetch only. Every claim has a URL. "UNVERIFIED" means no source found. Many pages (Cockatrice, XMage, Moxfield, Archidekt, Untap.in wiki) had no usable layout text; those gaps are stated, not filled from memory. No screenshots were viewed (tools return text only).

## 1. MTGO (Magic Online)

Source for most facts: official guides https://www.mtgo.com/getting-started/getting-started-multiplayer and https://www.mtgo.com/getting-started/getting-started-gameplay

Multiplayer scene (3+ players)
- Your battlefield sits where it does in the 2-player view; opponents are "split across the top half of the screen". (multiplayer guide)
- Turn order and priority run clockwise: up to the left, across the top, back down to you. (multiplayer guide)
- Battlefield highlight follows the player with priority, NOT the player whose turn it is (differs from the duel scene). (multiplayer guide)
- Permanents are auto-resized/shrunk so everything stays visible; guide recommends Hover Zoom to read opponents' boards. (multiplayer guide)
- Zones do not pop out in multiplayer; they toggle open/closed. Your graveyard is duplicated at left above your avatar. Settings/chat sit bottom-right beside the hand. (multiplayer guide)
- Each opponent section has a +/- button (bottom-right) that hides that opponent and enlarges the others. You can also resize the window. (multiplayer guide)
- Commander damage: right-click the shield icon in your avatar to see sources. Command zone: preset where the commander goes (hand/command zone instead of graveyard/library/exile) via right-click, must be done while holding priority. (multiplayer guide)
- Not described by the page: life-total display, stack display in multiplayer. UNVERIFIED.

Duel scene (2 players)
- Prompt Box (guidance, greys out when not your turn, blue + timer when you must act); avatar below it; library/hand size and match timer above avatar; opponent stats above Prompt Box. (gameplay guide)
- Graveyard (headstone icon), Exile (X icon), Revealed (eye icon), Effects (shield icon: replacement effects, emblems). Zones under the avatar can pop out; hover zooms a card. Cards exiled by a battlefield ability are shown under the permanent that exiled them. (gameplay guide)
- Floating mana in the lower-left of the battlefield. Stack: a spell moves to a temporary window on the battlefield. (gameplay guide)
- Phase Bar: your stops along the bottom, opponent's across the top; stops must be enabled before the phase or they are skipped. (gameplay guide)
- Game log/chat on the right. Grid splitter lets players drag boundaries between battlefield, hand, logs, prompt box; zones pop out; layout can be exported/imported. Gear icon sets card size. (gameplay guide)
- Attack: click creatures into the "Red Zone"; right-click empty battlefield to attack with all. Block: click blocker then attacker. Targets: left-click object or player avatar. (gameplay guide)
- Not covered: battlefield row organisation, tapped rendering, stacking duplicates, auto-sort, targeting arrows. UNVERIFIED from official docs.

Complaints
- Draftsim: in-game play streamlined but "user interface is kind of terrible" in menus and game search. https://draftsim.com/how-to-play-commander-online/
- Reddit complaints about tiny multiplayer cards: searched, NOT found. UNVERIFIED. (The official hide-opponent button and shrink-to-fit behaviour imply a space problem, but that is inference.)

## 2. Forge (best-documented multiplayer layout options)

Source: https://github.com/Card-Forge/forge/wiki/User-Guide
- Match screen = draggable, resizable cells holding tabbed panels (battlefield, hand, log, stack, card detail); layouts saved as XML.
- 3+ players: Layout > View > Sort Multiplayer Fields arranges opponents in turn order. Multiplayer Field Layout: **Grid** spreads opponents across top and bottom rows; **Rows** stacks them above the player. Field Panels: **Tabbed** (one panel, fields as tabs) or **Split** (one panel each). Two-player games unaffected. Each opponent field shows "(N new)" for changes since last viewed.
- Default (unsorted) puts extra players as tabs, which a user found annoying for Commander: https://slightlymagic.net/forum/viewtopic.php?f=26&t=29967 (thread is about 6 years old, one reply only).
- Battlefield: by default identical creatures show individually, while lands, tokens, artifacts, enchantments stack with a fan-out. Options: Stack Creatures, Group Creatures/Tokens, Group All Permanents; max stack depth default 4; "Tokens in Separate Row"; "Separate Combatants from Stacks". Piles split by name, P/T, counters, abilities, tapped state, damage, attachments. Tapped is a grouping factor. Page does not describe distinct land/creature rows beyond the token row.
- Group count badge: click selects the whole group; right-click prompts for how many to attack/block/target.
- Stack: its own tab; hovering a stack item draws targeting arrows (red opposing, blue allied). Phase bar: click a pip to toggle a stop, right-click to yield; long-press works on mobile.
- Zone buttons (hand, library, graveyard, exile, flashback, command, sideboard) with live counts; click opens, right-click picks floating window vs docked tab; separate prefs for own and opponents' zones.
- Avatar: left-click targets the player; hover shows commander damage (and estimated bracket when a cap is active).
- Zoom: mouse wheel forward / middle-hold / both buttons; wheel back, click or Esc closes; split cards rotate; Shift previews other face.
- Mobile: Android build and Adventure/Mobile UI exist; long-tap replaces right-click; little detail on touch zoom. 4-player vs AI Commander in "Neo Forge" fork (itch.io, UNVERIFIED details): https://dokkodolabs.itch.io/neo-forge

## 3. XMage
- Supports free-for-all up to 10 players and Commander up to 10: https://ossblog.org/xmage-play-magic and https://www.linuxlinks.com/xmage-play-magic/
- Official Swing client multiplayer arrangement, row sorting, stacking: NOT found. UNVERIFIED.
- Wiki release notes mention commander info added to commander tooltip: https://github.com/magefree/mage/wiki/Older-Releases
- A community fork client (xmage-nexus) offers four board layouts: Standard, Pod, Arena, Table. "Table" always renders the "arena board (up to 4 players)" with portraits per seat (opponents centred in their zone, own battlefield between portrait / last-actions box / combat ledger / phase dial / action button), seat-coloured arrows, a commander damage matrix (rows victims, columns commander owners), and an Arena-style stack column where the newest entry shows in full and hover lifts an entry. Fork, not official XMage. https://github.com/Adamychen/xmage-nexus/pull/17
- Draftsim: "very friendly to use", automation weaker than MTGO, actions harder to undo than Cockatrice. https://draftsim.com/how-to-play-commander-online/

## 4. Cockatrice
- Table is "split into four areas": Stack (left side), Battlefield (centre, cards snap to an invisible grid), Land (separate area, any card allowed), Hand. Double-click taps/untaps. Per-player info block: avatar, name, life, seven coloured counters, library/hand count, graveyard and exile with counts. Vertical phase bar on the far left with 11 steps. Info bar shows close-up of hovered card. https://github.com/Cockatrice/Cockatrice/wiki/Getting-Started (wiki says it is outdated and partly broken.)
- Multiplayer arrangement: the wiki does not describe it. Issue #2491 (6-player, two-column board): turn order follows the player list, the board columns are not aligned or rotated to match, so seat order looks scrambled. Open since 2017, "Low Priority" since 2020. https://github.com/Cockatrice/Cockatrice/issues/2491
- Complaints (2011 MTG Salvation thread, old): phase buttons huge, player info panel takes too much battlefield, small top-right preview not clickable, chat box small. Praise: multiplayer support, stability. https://www.mtgsalvation.com/forums/the-game/commander-edh/197684-cockatrice-a-free-mtg-client-with-multiplayer?page=6
- Praise "mimics playing paper Magic"; nothing automated. https://draftsim.com/how-to-play-commander-online/
- Cockatrice 3.0.0 reportedly adds arbitrary game zones; secondary mirror only, UNVERIFIED: search result linked to https://redlib.scsimedia.duckdns.org/r/Cockatrice

## 5. SpellTable (Wizards, webcam)
- Up to 4 players; all four boards at once or individually; life trackers; click a card in the focused stream to send it to a right-hand drawer with the official image. Physical cards over webcam, so no digital board model. https://spelltable.wizards.com/faq and https://draftsim.com/how-to-play-commander-online/
- Complaints (Draftsim): needs camera/mic, choppy voice, no text chat.

## 6. Untap.in
- Runs in browser on desktop, tablet and phone, installable as app; no rules enforcement; public lobby with spectators. https://untap.in
- Draftsim: uses the same generic interface as its other card games, so no turn-step tracker; tokens/emblems must be added manually; voice chat built in. https://draftsim.com/how-to-play-commander-online/
- Seat layout, battlefield rows, zoom: NOT found (wiki "Game Interface" guide is an empty placeholder: https://wiki.untap.in/books/game-interface). UNVERIFIED.

## 7. Tabletop Simulator MTG mods
- Hand zones double as seats and hide cards; seat via colour pick. https://kb.tabletopsimulator.com/host-guides/player-hands/
- "MTG Deluxe Table [Scripted]": 2-4 players, command zone trays, hand counters, life counters (summary of Steam Workshop comments via search; some 4-player life counters reported overlapping). Search results page only, individual comment URLs: https://steamcommunity.com/sharedfiles/filedetails/comments/1864499726
- Competitor claim (Playgroup, treat with caution): TTS board "gets crowded at 4 players", constant camera adjustments, cards float, honour-system hidden info. https://playgroup.gg/playgroup-live/vs-tabletop-simulator
- Draftsim calls TTS the "worst option" for Commander. https://draftsim.com/how-to-play-commander-online/

## 8. Playgroup Live and Table Commander (newer browser tools, useful as mobile references)
- Playgroup Live: 2 to 6 players; zones hand/battlefield/graveyard/exile/library/command/stack; attachments sit on a shelf beside the host creature; marquee select; target arrows visible to whole table; server-enforced hidden zones; **phone = landscape board showing one player at a time with a seat switcher; tablet/laptop = whole table**; card size slider; per-HUD turn highlight. https://playgroup.gg/playgroup-live and https://playgroup.gg/playgroup-live/features and https://playgroup.gg/playgroup-live/vs-tabletop-simulator (first-party marketing).
- Table Commander: shared central battlefield, hand fanned along seat, command zone always visible with auto tax, commander damage tracked per attacker/defender with 21 highlight, no stack modelled; freeform drop with optional Snap to Grid; hover enlarged preview; token bar and board stats desktop-only; double-click or T to tap. https://tablecommander.com/mtg-commander-simulator and https://beta.tablecommander.com/docs/gameplay/controls (marketing/beta docs).

## 9. Moxfield / Archidekt playtest
- Moxfield playtester is solo goldfishing, "easy to read board", keyboard shortcuts, no mulligans (Draftsim review, Dec 2024): https://draftsim.com/?p=130465
- Archidekt playtester: only a forum anecdote that it can feel sluggish. Layout details NOT found. UNVERIFIED.

## 10. Arena (multiplayer facts only)
- Brawl on Arena is 1v1 only; four-player Commander is "being worked on", no date, Arena built for two players (Wizards' Dave Finseth, via interview write-up). No official layout statement. https://blog.dynasage.com/2026/09/mtg-arena-commander-is-being-worked-on.html and https://mtgrocks.com/mtg-arena-multiplayer-delayed/
- Alchemy is being sunset, not made multiplayer (search summary, secondary): https://www.tabletopgaming.co.uk/news/rip-alchemy-as-magic-the-gathering-arena-sunsets-the-format-following-reality-fracture-set-release/

## Patterns that recur (sourced above)
1. You are always at the bottom with a big board; opponents are compressed into the upper area (MTGO, Forge Rows/Grid, xmage-nexus Table).
2. Opponents can be collapsed/hidden or tabbed to give other boards room (MTGO +/- button, Forge tabs, Cockatrice hide-player dialog).
3. Auto-shrink permanents plus hover/wheel zoom as the readability fix (MTGO, Forge, Table Commander).
4. Zones are buttons/icons with counts that open a pop-out or docked list, not always-visible piles (MTGO, Forge, Cockatrice counts).
5. Highlighting the active seat; MTGO's multiplayer highlight tracks priority, not turn owner.
6. Stack as its own panel/column with newest on top and hover-to-reveal (Forge tab with arrows, xmage-nexus column, MTGO temporary window, Playgroup zone, Cockatrice left column).
7. Group identical permanents with a count badge and split piles by differing state (Forge; Playgroup claims readability under load).
8. Commander damage is per-victim x per-commander-owner, surfaced by hover/right-click or a matrix (MTGO, Forge, xmage-nexus, Table Commander).
9. Phone solution seen in the wild: one player at a time + seat switcher (Playgroup Live).

## Patterns that fail (sourced above)
1. Seat order on screen not matching turn order (Cockatrice #2491; Forge needed an opt-in "Sort Multiplayer Fields").
2. Tabs as the default for opponents (Forge): players cannot see all boards, they asked for side-by-side.
3. Big fixed chrome stealing board space (Cockatrice phase buttons, player info panel, 2011 thread).
4. Freeform physics tables get crowded at 4 players and need camera work (TTS, per competitor).
5. Overlapping scripted counters at 4 seats (TTS Workshop comments).
6. Generic multi-game UI with no turn tracker (Untap.in per Draftsim).
7. Preview that cannot be clicked/enlarged (Cockatrice, 2011).

## 2 / 3 / 4-player seat layouts (what is documented)
- 2 players: opponent across the top, you bottom; all clients assumed (MTGO duel scene: opponent stats above the Prompt Box; Forge two-player unaffected by sort options).
- 3 players: no client documents a dedicated 3-seat layout. MTGO: opponents "split across the top half". Forge: Grid/Rows applies to all 3+ . Dedicated 3-player geometry UNVERIFIED anywhere.
- 4 players: MTGO = you bottom, 3 opponents in the top half, clockwise order up-left, across, down (https://www.mtgo.com/getting-started/getting-started-multiplayer). Forge Grid = opponents across top and bottom rows; Rows = stacked above you; Tabbed alternative (https://github.com/Card-Forge/forge/wiki/User-Guide). xmage-nexus Table = arena-style board for up to 4, own battlefield bottom, opponent portraits centred in their zones (https://github.com/Adamychen/xmage-nexus/pull/17). Cockatrice = two-column grid whose order can disagree with turn order (issue #2491). SpellTable = grid of 4 webcam streams or one focused stream. Playgroup phone = one seat at a time.
- No documented client uses a rotated "around the table" ring with cards facing each seat; physical-table sims (TTS) do, via seat positions (https://kb.tabletopsimulator.com/host-guides/player-hands/), but they are reported crowded at 4. Cockatrice's per-player background option appears in 2.7.5 notes (https://github.com/Cockatrice/Cockatrice/releases/tag/2020-08-23-Release-2.7.5), details UNVERIFIED.

## Gaps to close by looking at the apps directly
MTGO battlefield rows and tapped rendering, XMage Swing layout, Cockatrice multiplayer geometry, Untap.in table, Archidekt/Moxfield playtest layout, any MTGO/Reddit complaints (search engine returned none). Screenshots are needed; text tools cannot supply them.
