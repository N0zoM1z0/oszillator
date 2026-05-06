import {
  computePlayfieldTransform,
  screenToPlayfield,
  vec2,
  type GameplayButton,
  type GameplayInputEvent,
  type PlayfieldTransform,
  type ScreenRect
} from '@oszillator/core';

export type InputManagerOptions = {
  target: HTMLElement;
  getScreenRect: () => ScreenRect;
  getGameTimeMs: () => number;
  onInput: (event: GameplayInputEvent) => void;
};

const keyboardMap = new Map<string, GameplayButton>([
  ['KeyZ', 'K1'],
  ['KeyX', 'K2']
]);

let inputId = 0;

export class InputManager {
  private transform: PlayfieldTransform;

  private lastPointer = {
    screenPosition: vec2(0, 0),
    playfieldPosition: vec2(256, 192)
  };

  constructor(private readonly options: InputManagerOptions) {
    this.transform = computePlayfieldTransform(options.getScreenRect());
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    options.target.addEventListener('pointermove', this.handlePointerMove);
    options.target.addEventListener('pointerdown', this.handlePointerDown);
    options.target.addEventListener('pointerup', this.handlePointerUp);
    options.target.addEventListener('contextmenu', this.handleContextMenu);
  }

  updateSize(): void {
    this.transform = computePlayfieldTransform(this.options.getScreenRect());
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.options.target.removeEventListener('pointermove', this.handlePointerMove);
    this.options.target.removeEventListener('pointerdown', this.handlePointerDown);
    this.options.target.removeEventListener('pointerup', this.handlePointerUp);
    this.options.target.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private readonly emit = (event: Omit<GameplayInputEvent, 'id' | 'browserTimestampMs' | 'gameTimestampMs'>): void => {
    this.options.onInput({
      ...event,
      id: `input-${inputId++}`,
      browserTimestampMs: performance.now(),
      gameTimestampMs: this.options.getGameTimeMs()
    });
  };

  private readonly pointerPosition = (event: PointerEvent) => {
    const rect = this.options.target.getBoundingClientRect();
    const screenPosition = vec2(event.clientX - rect.left, event.clientY - rect.top);
    this.lastPointer = {
      screenPosition,
      playfieldPosition: screenToPlayfield(this.transform, screenPosition)
    };
    return this.lastPointer;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = keyboardMap.get(event.code);
    if (event.repeat) {
      return;
    }
    if (key) {
      event.preventDefault();
      this.emit({ kind: 'press', source: 'keyboard', key, ...this.lastPointer });
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const key = keyboardMap.get(event.code);
    if (key) {
      event.preventDefault();
      this.emit({ kind: 'release', source: 'keyboard', key, ...this.lastPointer });
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.emit({ kind: 'move', source: 'pointer', ...this.pointerPosition(event) });
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.options.target.setPointerCapture(event.pointerId);
    this.emit({ kind: 'press', source: 'pointer', key: event.button === 2 ? 'M2' : 'M1', ...this.pointerPosition(event) });
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.options.target.hasPointerCapture(event.pointerId)) {
      this.options.target.releasePointerCapture(event.pointerId);
    }
    this.emit({ kind: 'release', source: 'pointer', key: event.button === 2 ? 'M2' : 'M1', ...this.pointerPosition(event) });
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
