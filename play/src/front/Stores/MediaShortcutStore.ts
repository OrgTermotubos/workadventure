import { get, writable } from "svelte/store";

export type MediaShortcutAction = "microphone" | "camera";
export type MediaShortcut = { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean };

const storageKey = "mediaShortcuts";
const defaults: Record<MediaShortcutAction, MediaShortcut> = {
    microphone: { key: "KeyO", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
    camera: { key: "KeyP", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
};

// Elements where a key press is text being typed, not a shortcut
const TYPING_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export const mediaShortcutRebindingStore = writable(false);

// Keys with fixed bindings in GameSceneUserInputHandler / UserInputManager / EmojiSubMenu, whatever the modifiers.
const reservedKeys = new Set([
    ...["KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyQ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
    ...["Space", "Enter", "Escape", "KeyE", "KeyR", "KeyC", "KeyU", "KeyF"],
    // Closes the map editor / moves the focus
    ...["Backquote", "Tab"],
    ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`Digit${n}`, `F${n}`]),
]);
export function isReservedShortcut(shortcut: MediaShortcut): boolean {
    return reservedKeys.has(shortcut.key);
}

// A saved shortcut that has since become reserved falls back to the default.
export function loadMediaShortcuts(): Record<MediaShortcutAction, MediaShortcut> {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<
            Record<MediaShortcutAction, MediaShortcut>
        > | null;
        const saved = Object.entries(value ?? {}).filter(([, shortcut]) => !isReservedShortcut(shortcut));
        return { ...defaults, ...Object.fromEntries(saved) };
    } catch {
        return { ...defaults };
    }
}

export const mediaShortcutsStore = writable(loadMediaShortcuts());
export function getMediaShortcut(action: MediaShortcutAction): MediaShortcut {
    return get(mediaShortcutsStore)[action];
}
const sameShortcut = (a: MediaShortcut, b: MediaShortcut) =>
    a.key === b.key &&
    a.ctrlKey === b.ctrlKey &&
    a.altKey === b.altKey &&
    a.shiftKey === b.shiftKey &&
    a.metaKey === b.metaKey;

// Rebinding to a shortcut owned by another action swaps them, so no shortcut is ever bound twice.
// Returns false (and changes nothing) when the shortcut is reserved by a fixed binding.
export function setMediaShortcut(action: MediaShortcutAction, shortcut: MediaShortcut): boolean {
    if (isReservedShortcut(shortcut)) return false;
    const shortcuts = get(mediaShortcutsStore);
    const owner = (Object.keys(shortcuts) as MediaShortcutAction[]).find(
        (other) => other !== action && sameShortcut(shortcuts[other], shortcut),
    );
    const updated = { ...shortcuts, ...(owner ? { [owner]: shortcuts[action] } : {}), [action]: shortcut };
    mediaShortcutsStore.set(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return true;
}
export function mediaShortcutMatches(event: KeyboardEvent, shortcut: MediaShortcut): boolean {
    return (
        !event.repeat &&
        event.code === shortcut.key &&
        event.ctrlKey === shortcut.ctrlKey &&
        event.altKey === shortcut.altKey &&
        event.shiftKey === shortcut.shiftKey &&
        event.metaKey === shortcut.metaKey
    );
}

/**
 * The media action bound to this key press, or undefined when the key is typed in a text field
 * or while a shortcut is being recorded.
 */
export function findMediaShortcutAction(event: KeyboardEvent): MediaShortcutAction | undefined {
    if (get(mediaShortcutRebindingStore)) return undefined;
    if (event.target instanceof Element && event.target.closest(TYPING_SELECTOR) !== null) return undefined;
    const shortcuts = get(mediaShortcutsStore);
    return (Object.keys(shortcuts) as MediaShortcutAction[]).find((action) =>
        mediaShortcutMatches(event, shortcuts[action]),
    );
}
