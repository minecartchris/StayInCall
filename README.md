# StayInCall

A [Vencord](https://github.com/Vendicated/Vencord) userplugin that automatically rejoins a voice
channel or DM call when Discord disconnects you without you asking it to.

Covers the two common cases:

- Discord drops you from a DM/group call after a period of inactivity
- Discord drops you when you are the last person left in a call

It does **not** rejoin when *you* click Disconnect, and it will never *start* a new DM call — if the
call you were dropped from has ended entirely, it stays out rather than ringing everyone again.
Guild voice channels have no such side effect, so an empty one is rejoined normally.

## Install

Requires a [self-built Vencord](https://docs.vencord.dev/installing/) — userplugins do not work on
the normal installer build.

From the root of your Vencord repo:

```bash
git clone https://github.com/minecartchris/StayInCall src/userplugins/stayInCall
```

Then rebuild and reinject:

```bash
pnpm build && pnpm inject
```

Restart Discord fully (not Ctrl+R — the patcher runs in the main process) and enable **StayInCall**
in Vencord settings.

## Pairs with DisableCallIdle

This plugin reacts *after* a disconnect. Vencord's built-in **DisableCallIdle** prevents the
client-side idle disconnect and the AFK-channel move in the first place. Enable both: DisableCallIdle
stops most disconnects, StayInCall catches the rest.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Scope | DM & guild | Restrict rejoining to DM/group calls or guild voice channels only |
| Rejoin delay | 3s | How long to wait before rejoining |
| Max rejoins | 5 | Gives up after this many consecutive rejoins; resets after 60s connected |
| Notify | on | Toast on each rejoin |

## How it works

Runtime-only — no webpack patches, so it cannot break on a Discord update and cannot conflict with
DisableCallIdle's patches. It distinguishes a deliberate leave from a forced one by treating a
`VOICE_CHANNEL_SELECT` with a null channel as locally initiated, then ignoring the
`VOICE_STATE_UPDATES` disconnect that follows within 2 seconds.

## Status

Newly written. It typechecks, lints, and builds cleanly against current Vencord, but the
manual-vs-forced disconnect heuristic above is the part that depends on Discord's dispatch ordering
and has had limited real-world testing. If it drags you back after you hang up deliberately, raise
`MANUAL_LEAVE_GRACE_MS` near the top of `index.ts`; the plugin logs which branch it took to the
console under `StayInCall`.

## Licence

GPL-3.0-or-later, matching Vencord.
