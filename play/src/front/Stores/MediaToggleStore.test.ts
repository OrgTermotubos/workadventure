import { AvailabilityStatus } from "@workadventure/messages";
import { get, writable } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    trackAdminEvent: vi.fn(),
}));

vi.mock("../Administration/AnalyticsClient", () => ({
    analyticsClient: { trackAdminEvent: mocks.trackAdminEvent },
}));

vi.mock("./MediaStore", () => {
    const requestedCameraState = Object.assign(writable(false), {
        enableWebcam: vi.fn(),
        disableWebcam: vi.fn(),
    });
    const requestedMicrophoneState = Object.assign(writable(false), {
        enableMicrophone: vi.fn(),
        disableMicrophone: vi.fn(),
    });
    return {
        availabilityStatusStore: writable(AvailabilityStatus.ONLINE),
        silentStore: writable(false),
        cameraListStore: writable<MediaDeviceInfo[] | undefined>(undefined),
        microphoneListStore: writable<MediaDeviceInfo[] | undefined>(undefined),
        requestedCameraState,
        requestedMicrophoneState,
    };
});

import {
    availabilityStatusStore,
    cameraListStore,
    microphoneListStore,
    requestedCameraState,
    requestedMicrophoneState,
    silentStore,
} from "./MediaStore";
import { createMediaToggleAvailableStore, isMediaToggleAvailable, toggleMedia } from "./MediaToggleStore";

const device = {} as MediaDeviceInfo;

describe("MediaToggleStore", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        availabilityStatusStore.set(AvailabilityStatus.ONLINE);
        silentStore.set(false);
        cameraListStore.set(undefined);
        microphoneListStore.set(undefined);
        requestedCameraState.set(false);
        requestedMicrophoneState.set(false);
    });

    it("allows toggling while the device list is still unknown or has a device", () => {
        expect(isMediaToggleAvailable("camera")).toBe(true);
        cameraListStore.set([device]);
        expect(isMediaToggleAvailable("camera")).toBe(true);
    });

    it("blocks toggling when no device is available, only for that media", () => {
        cameraListStore.set([]);
        expect(isMediaToggleAvailable("camera")).toBe(false);
        expect(isMediaToggleAvailable("microphone")).toBe(true);
    });

    it("blocks toggling in a silent zone", () => {
        silentStore.set(true);
        expect(isMediaToggleAvailable("microphone")).toBe(false);
    });

    it.each([
        AvailabilityStatus.BUSY,
        AvailabilityStatus.AWAY,
        AvailabilityStatus.BACK_IN_A_MOMENT,
        AvailabilityStatus.SOUND_BLOCKED,
        AvailabilityStatus.DO_NOT_DISTURB,
    ])("blocks toggling with the status %s", (status) => {
        availabilityStatusStore.set(status);
        expect(isMediaToggleAvailable("camera")).toBe(false);
    });

    it("keeps the store in sync with the synchronous check", () => {
        const available = createMediaToggleAvailableStore("microphone");
        expect(get(available)).toBe(true);
        microphoneListStore.set([]);
        expect(get(available)).toBe(false);
    });

    it("turns the camera on, then off, and tracks each toggle", () => {
        toggleMedia("camera");
        expect(requestedCameraState.enableWebcam).toHaveBeenCalledOnce();
        requestedCameraState.set(true);
        toggleMedia("camera");
        expect(requestedCameraState.disableWebcam).toHaveBeenCalledOnce();
        expect(mocks.trackAdminEvent).toHaveBeenCalledTimes(2);
        expect(mocks.trackAdminEvent).toHaveBeenCalledWith("media.camera.toggled");
    });

    it("turns the microphone on, then off", () => {
        toggleMedia("microphone");
        expect(requestedMicrophoneState.enableMicrophone).toHaveBeenCalledOnce();
        requestedMicrophoneState.set(true);
        toggleMedia("microphone");
        expect(requestedMicrophoneState.disableMicrophone).toHaveBeenCalledOnce();
    });

    it("does nothing and tracks nothing when toggling is blocked", () => {
        silentStore.set(true);
        toggleMedia("microphone");
        expect(requestedMicrophoneState.enableMicrophone).not.toHaveBeenCalled();
        expect(mocks.trackAdminEvent).not.toHaveBeenCalled();
    });
});
