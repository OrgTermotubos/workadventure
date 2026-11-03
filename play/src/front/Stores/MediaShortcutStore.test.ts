import { beforeEach, describe, expect, it } from "vitest";
import {
    findMediaShortcutAction,
    getMediaShortcut,
    loadMediaShortcuts,
    mediaShortcutMatches,
    mediaShortcutRebindingStore,
    mediaShortcutsStore,
    setMediaShortcut,
} from "./MediaShortcutStore";

const noModifier = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

function keyFrom(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
    let received: KeyboardEvent | undefined;
    const listener = (event: Event) => {
        received = event as KeyboardEvent;
    };
    window.addEventListener("keydown", listener);
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
    window.removeEventListener("keydown", listener);
    if (!received) throw new Error("The key event did not reach the window");
    return received;
}

describe("MediaShortcutStore", () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = "";
        mediaShortcutsStore.set(loadMediaShortcuts());
        mediaShortcutRebindingStore.set(false);
    });

    it("uses O and P without modifiers by default", () => {
        expect(getMediaShortcut("microphone")).toEqual({ ...noModifier, key: "KeyO" });
        expect(getMediaShortcut("camera")).toEqual({ ...noModifier, key: "KeyP" });
    });

    it("falls back to the defaults when the saved value is not valid JSON", () => {
        localStorage.setItem("mediaShortcuts", "{not json");
        expect(loadMediaShortcuts().microphone.key).toBe("KeyO");
    });

    it("keeps the default of an action that was never saved, or whose saved key is now reserved", () => {
        localStorage.setItem(
            "mediaShortcuts",
            JSON.stringify({
                camera: { ...noModifier, key: "KeyK", ctrlKey: true },
                microphone: { ...noModifier, key: "Tab" },
            }),
        );
        const shortcuts = loadMediaShortcuts();
        expect(shortcuts.camera).toEqual({ ...noModifier, key: "KeyK", ctrlKey: true });
        expect(shortcuts.microphone.key).toBe("KeyO");
    });

    it("uses a new shortcut right away and persists it", () => {
        expect(setMediaShortcut("microphone", { ...noModifier, key: "KeyM", altKey: true })).toBe(true);
        expect(getMediaShortcut("microphone")).toEqual({ ...noModifier, key: "KeyM", altKey: true });
        expect(loadMediaShortcuts().microphone).toEqual({ ...noModifier, key: "KeyM", altKey: true });
        expect(findMediaShortcutAction(keyFrom(document.body, { code: "KeyM", altKey: true }))).toBe("microphone");
    });

    it("swaps bindings when rebinding to a shortcut already used by the other action", () => {
        const microphone = getMediaShortcut("microphone");
        const camera = getMediaShortcut("camera");

        setMediaShortcut("microphone", camera);

        expect(getMediaShortcut("microphone")).toEqual(camera);
        expect(getMediaShortcut("camera")).toEqual(microphone);
    });

    it.each(["KeyC", "KeyW", "Space", "Digit3", "F2", "Backquote", "Tab"])("rejects the reserved key %s", (key) => {
        const microphone = getMediaShortcut("microphone");

        expect(setMediaShortcut("microphone", { ...microphone, key, ctrlKey: true })).toBe(false);
        expect(getMediaShortcut("microphone")).toEqual(microphone);
        expect(localStorage.getItem("mediaShortcuts")).toBeNull();
    });

    it("matches the physical key and the exact modifiers, and ignores key repeat", () => {
        const shortcut = getMediaShortcut("microphone");
        expect(mediaShortcutMatches(new KeyboardEvent("keydown", { code: "KeyO" }), shortcut)).toBe(true);
        expect(mediaShortcutMatches(new KeyboardEvent("keydown", { code: "KeyO", ctrlKey: true }), shortcut)).toBe(
            false,
        );
        expect(mediaShortcutMatches(new KeyboardEvent("keydown", { code: "KeyO", repeat: true }), shortcut)).toBe(
            false,
        );
        expect(mediaShortcutMatches(new KeyboardEvent("keydown", { code: "KeyP" }), shortcut)).toBe(false);
    });

    it("finds the action of a key pressed on the page or on a button", () => {
        document.body.innerHTML = "<button></button>";
        const button = document.querySelector("button");
        if (!button) throw new Error("missing button");
        expect(findMediaShortcutAction(keyFrom(document.body, { code: "KeyO" }))).toBe("microphone");
        expect(findMediaShortcutAction(keyFrom(button, { code: "KeyP" }))).toBe("camera");
        expect(findMediaShortcutAction(keyFrom(document.body, { code: "KeyK" }))).toBeUndefined();
    });

    it("ignores keys typed in a text field", () => {
        document.body.innerHTML =
            '<input /><textarea></textarea><select></select><div contenteditable="true"><p>text</p></div>';
        for (const selector of ["input", "textarea", "select", "p"]) {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`missing ${selector}`);
            expect(findMediaShortcutAction(keyFrom(element, { code: "KeyO" }))).toBeUndefined();
        }
    });

    it("ignores keys while a shortcut is being recorded", () => {
        mediaShortcutRebindingStore.set(true);
        expect(findMediaShortcutAction(keyFrom(document.body, { code: "KeyO" }))).toBeUndefined();
    });
});
