# 003 — Level and Peek Options

**Draft for discussion**

Temblor should offer five combat levels and a sixth setting for exploring the arena. Level 3 is the default and plays exactly like the current release. Level 4 is the main tuning target. A player with Quake duel experience should have to fight for the fifth frag.

## What each level should feel like

| Level | Name | Intended experience |
| --- | --- | --- |
| 0 | Explore | The bot moves around and can collect items. It never fires or uses the gauntlet, even if attacked. The human can look around, move, collect items and try every weapon. |
| 1 | Rookie | A first-time player has time to turn, find the bot and return fire. It acquires targets slowly, loses track during a dodge and leaves long gaps between attacks. |
| 2 | Easy | A casual shooter player gets a forgiving duel. The bot can punish someone standing in the open, but a sideways dodge or a quick retreat behind cover usually buys time. |
| 3 | Standard | Today's bot, including its aim, reaction delay, movement, weapon choices and pickup decisions. This is the reference for every tuning comparison. |
| 4 | Veteran | A tough duel for an experienced Quake player. The bot leads rockets against a steady strafe, varies its own dodge and contests useful weapons and armor. Changing direction after a rocket launches or catching it on the way to a pickup should still pay off. |
| 5 | Expert | The strongest opponent. It recovers aim faster after a dodge, switches weapons more effectively as distance changes and pressures the player between major pickups. A skilled player can still force a miss, deny armor and win. |

All combat levels use the same movement physics, weapon damage, ammunition, health, armor and pickup timers as the human. Tune the bot through its decisions and execution. At levels 4 and 5, projectile prediction uses the movement the bot observes while it has sight of the player.

## Choosing a level in the control panel

Put **Bot level** at the top of the Controls panel, with a persistent label and the current number and name visible even when the selector is closed. Players can choose any level from **0 · Explore** through **5 · Expert** with the mouse or keyboard. A fresh visit starts at **3 · Standard**.

Keep the lobby selector beside Play and make it available on pause and at the end of a match. All instances show the same selection. A change on pause takes effect on Resume and keeps the score. Rematches and local map imports inherit the selection for the session.

Explore uses the normal arena and player controls. The bot holds fire for as long as level 0 is selected. Someone who wants target practice can still score frags and trigger the usual first-to-five finish.

## Peek map window

Show **Peek** in the Controls panel with a visible **P** shortcut. Once an arena is loaded, selecting Peek or pressing **P** during play opens an in-game window showing the current map at any bot level. Pressing **P** again closes the window. Opening Peek during play pauses the match so the player can study a route. Closing it returns to the same position and first-person view. Opening Peek from paused Controls returns there on close.

Draw the loaded arena as a three-dimensional wireframe with lightly shaded, semi-transparent faces. Give floors, walls and ramps distinct shading and keep doorways and other openings clear. A player should be able to follow a corridor around a solid wall and see where stairs or a ramp connect two floors. Fade distant edges and intervening surfaces enough to keep overlapping floors legible.

Mark the two positions at their actual elevations. Label the player **You** with an arrow pointing in their facing direction. Label the opponent **Bot** with a distinct shape and color. Keep both markers readable through the geometry. Each time Peek opens, frame both positions in an angled view and refresh them from the match.

Let the player drag to orbit and scroll to zoom. Show a short guide in the window for both the map and the arena, including **Drag to orbit**, **Scroll to zoom**, **P to close** and **WASD to move after closing**. Map inspection must leave the player's aim and position intact.

## Checking the controls and map

- Open Controls from the lobby, find the current bot level and select **0 · Explore** using only the keyboard. Confirm the lobby shows that choice. Change it to **4 · Veteran** while paused and confirm it carries into the rematch.
- Open Peek with **P**, identify both actors and trace a walkable route from the player's arrow through a doorway or between floors. Orbit to check what lies behind a wall. Close with **P**, walk part of that route and reopen Peek. The arrow should match the new position, elevation and facing.
- Exercise the same toggle on a supported local map import. Check that Peek shows the imported geometry, opens from the Controls panel and returns to the panel on close. Check that holding **P** produces a single toggle per press.

## How to judge the tuning

- **Preserve level 3.** Record seeded replays against the current build before changing behavior. Replay the same input on the same map at level 3 and compare movement, pickups, shots, damage and final scores.
- **Verify Explore.** Enter level 0 from the lobby, stay in sight of the bot and attack it at close range. Repeat after respawn and after switching from a combat level on pause. The bot must issue zero attacks while level 0 is active, and the human must still be able to move and fire.
- **Check the progression.** Repeat the same encounters at levels 1–5, including crossing a corridor, breaking sight behind a pillar and contesting the rocket launcher. Compare time to first shot, hits on a moving player and who takes the pickup. Also test Rookie and Easy with people learning the map.
- **Playtest Veteran and Expert.** Give experienced Quake players a warm-up on *Trial by Error*, then alternate the order of first-to-five matches at levels 3, 4 and 5. Keep one difficulty for each measured match. Record each final score and ask which mistakes the bot punished. As a proposed tuning target, Veteran should win roughly 40–60% of matches against this group, with close finishes common. Expert should win more often than Veteran against the same players. These are playtest targets. Human results are still open. [Existing playtest evidence](../evidence/README.md#human-playtest-and-original-data-procedure)
