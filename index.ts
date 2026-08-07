/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { AuthenticationStore, CallStore, ChannelStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");

const logger = new Logger("StayInCall");

/** Channel types that represent a DM or group DM call rather than a guild voice channel. */
const DM = 1;
const GROUP_DM = 3;

interface VoiceStateChangeEvent {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    sessionId: string;
}

const settings = definePluginSettings({
    scope: {
        type: OptionType.SELECT,
        description: "Which kinds of calls to rejoin",
        options: [
            { label: "DM & group calls and guild voice channels", value: "all", default: true },
            { label: "DM & group calls only", value: "dm" },
            { label: "Guild voice channels only", value: "guild" }
        ]
    },
    rejoinDelay: {
        type: OptionType.SLIDER,
        description: "Seconds to wait before rejoining",
        markers: [1, 2, 3, 5, 10, 15, 30],
        default: 3,
        stickToMarkers: false
    },
    maxRejoins: {
        type: OptionType.SLIDER,
        description: "Give up after this many consecutive rejoins (resets once you stay connected)",
        markers: [1, 3, 5, 10, 25],
        default: 5,
        stickToMarkers: true
    },
    notify: {
        type: OptionType.BOOLEAN,
        description: "Show a toast when rejoining",
        default: true
    }
});

/** The voice channel we believe we are connected to. */
let currentChannelId: string | null = null;
/** Timestamp of the last locally-initiated leave, used to tell "I hung up" from "I was dropped". */
let manualLeaveAt = 0;
/** Consecutive rejoins since we last stayed connected, capped by the maxRejoins setting. */
let rejoinCount = 0;
let pendingRejoin: ReturnType<typeof setTimeout> | null = null;

/** Grace period after a local leave during which a disconnect is attributed to the user, not to Discord. */
const MANUAL_LEAVE_GRACE_MS = 2000;
/** How long we must stay connected before the rejoin counter is considered "recovered". */
const STABLE_CONNECTION_MS = 60_000;

function cancelPendingRejoin() {
    if (pendingRejoin != null) {
        clearTimeout(pendingRejoin);
        pendingRejoin = null;
    }
}

function isInScope(channelId: string) {
    const { scope } = settings.store;
    if (scope === "all") return true;

    const channel = ChannelStore.getChannel(channelId);
    if (channel == null) return false;

    const isPrivate = channel.type === DM || channel.type === GROUP_DM;
    return scope === "dm" ? isPrivate : !isPrivate;
}

/**
 * Whether rejoining this channel would join an existing call rather than start a new one.
 *
 * This matters for DMs: selectVoiceChannel on a DM with no active call *starts* a call and rings
 * the other people, which is not something we should ever do behind the user's back. Guild voice
 * channels have no such side effect, so joining an empty one is fine.
 */
function canSafelyRejoin(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (channel == null) return false;

    if (channel.type !== DM && channel.type !== GROUP_DM) return true;

    return CallStore.isCallActive(channelId);
}

function rejoin(channelId: string) {
    pendingRejoin = null;

    // We may have already been reconnected (manually or by Discord) while the timer was running.
    if (VoiceStateStore.isCurrentClientInVoiceChannel()) {
        rejoinCount = 0;
        return;
    }

    if (!canSafelyRejoin(channelId)) {
        logger.info(`Not rejoining ${channelId}: the call is no longer active`);
        rejoinCount = 0;
        return;
    }

    rejoinCount++;
    logger.info(`Rejoining ${channelId} (attempt ${rejoinCount}/${settings.store.maxRejoins})`);
    selectVoiceChannel(channelId);

    if (settings.store.notify) {
        const channel = ChannelStore.getChannel(channelId);
        const name = channel?.name || "the call";
        showToast(`Rejoined ${name}`, Toasts.Type.SUCCESS);
    }

    setTimeout(() => {
        if (VoiceStateStore.isCurrentClientInVoiceChannel()) rejoinCount = 0;
    }, STABLE_CONNECTION_MS);
}

function handleDisconnect(channelId: string) {
    if (Date.now() - manualLeaveAt < MANUAL_LEAVE_GRACE_MS) {
        logger.debug("Ignoring disconnect: you left the call yourself");
        rejoinCount = 0;
        return;
    }

    if (!isInScope(channelId)) return;

    if (rejoinCount >= settings.store.maxRejoins) {
        logger.warn(`Giving up after ${rejoinCount} rejoins`);
        if (settings.store.notify) {
            showToast("StayInCall gave up rejoining", Toasts.Type.FAILURE);
        }
        return;
    }

    cancelPendingRejoin();
    pendingRejoin = setTimeout(() => rejoin(channelId), settings.store.rejoinDelay * 1000);
}

export default definePlugin({
    name: "StayInCall",
    description: "Automatically rejoins a voice channel or DM call when Discord disconnects you without you asking it to.",
    tags: ["Voice", "Utility"],
    authors: [{ name: "minecartchris", id: 0n }],

    settings,

    start() {
        currentChannelId = null;
        manualLeaveAt = 0;
        rejoinCount = 0;
    },

    stop() {
        cancelPendingRejoin();
    },

    flux: {
        // Dispatched by the client when *you* pick or leave a voice channel. A null channelId here
        // means the leave originated locally (you clicked disconnect), so it is not one to undo.
        VOICE_CHANNEL_SELECT({ channelId }: { channelId: string | null; }) {
            if (channelId == null) {
                manualLeaveAt = Date.now();
                cancelPendingRejoin();
                currentChannelId = null;
            } else {
                currentChannelId = channelId;
                rejoinCount = 0;
            }
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceStateChangeEvent[]; }) {
            const myId = UserStore.getCurrentUser()?.id;
            if (myId == null) return;

            const mySessionId = AuthenticationStore.getSessionId();

            for (const state of voiceStates) {
                if (state.userId !== myId) continue;
                // Other sessions (phone, another client) have their own voice state; ignore them.
                if (state.sessionId !== mySessionId) continue;

                const { channelId, oldChannelId } = state;

                if (channelId != null) {
                    // Connected or moved. A move is the server relocating us (e.g. to an AFK
                    // channel); undoing that would just fight the server, so we only track it.
                    currentChannelId = channelId;
                    continue;
                }

                const leftChannel = oldChannelId ?? currentChannelId;
                currentChannelId = null;
                if (leftChannel == null) continue;

                handleDisconnect(leftChannel);
            }
        }
    }
});
