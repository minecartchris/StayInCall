# StayInCall — prebuilt Vencord bundle

A prebuilt [Vencord](https://vencord.dev) with the
[StayInCall](https://github.com/minecartchris/StayInCall) plugin already compiled in, so you don't
need Node, pnpm, or a build toolchain.

**Built from Vencord commit `1a8c3b71`.**

## What StayInCall does

Automatically rejoins a voice channel or DM call when Discord disconnects you without you asking it
to — the inactivity kick, and the drop when you're the last person left in a call.

It does **not** rejoin when *you* click Disconnect, and it will never *start* a new DM call. If the
call you were dropped from has ended entirely it stays out, rather than ringing everyone again.

## Install (Windows)

**1. Install Vencord normally first.** Get the official installer from
<https://vencord.dev/download> and run it. This bundle replaces Vencord's built files — it does not
patch Discord itself, so Vencord has to be installed already.

**2. Fully quit Discord.** Right-click the tray icon → Quit. Closing the window isn't enough.

**3. Extract this zip and run the installer script:**

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

It backs up your current build to `%AppData%\Vencord\dist.backup-before-stayincall`, copies the new
one in, and verifies every file by SHA256 before reporting success.

**4. Start Discord**, then go to Settings → Vencord → Plugins and enable **StayInCall**. Enable
**DisableCallIdle** too — it prevents most disconnects in the first place, and StayInCall catches
whatever gets through.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Restore
```

That puts your original build back. Re-running the official Vencord installer also works.

## Important: no auto-updates

This build has Vencord's updater **compiled out**. That's deliberate — the updater would otherwise
download an official build and silently wipe StayInCall.

The tradeoff is that Vencord will not update itself. When Discord changes enough to break plugin
patches, you'll need a newer bundle. Either ask whoever gave you this for a rebuild, or switch to a
proper self-built setup, which gets you working updates *and* keeps the plugin:

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
git clone https://github.com/minecartchris/StayInCall src/userplugins/stayInCall
pnpm i && pnpm build && pnpm inject
```

## Mac / Linux

The `dist` files themselves are platform-independent (the build is `Platform: Universal`), but
`install.ps1` is Windows-only. On macOS or Linux, install Vencord officially, then copy the six
files from this bundle's `dist/` folder over the ones in your Vencord dist directory
(`~/.config/Vencord/dist` on Linux, `~/Library/Application Support/Vencord/dist` on macOS).

## Trust

This bundle contains compiled JavaScript, which you can't meaningfully read. If you'd rather not run
a binary blob from someone else's machine, don't — use the self-build route above instead. It
produces the same thing from source you can inspect:

- Plugin source: <https://github.com/minecartchris/StayInCall>
- Vencord source: <https://github.com/Vendicated/Vencord> at commit `1a8c3b71`

## Licence

GPL-3.0-or-later, matching Vencord.
