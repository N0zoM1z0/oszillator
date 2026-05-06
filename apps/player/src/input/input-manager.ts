import {
  PLAYFIELD_CENTER,
  computePlayfieldTransform,
  playfieldToScreen,
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
  onSmokeActive?: (active: boolean) => void;
};

const keyboardMap = new Map<string, GameplayButton>([
  ['KeyZ', 'K1'],
  ['KeyX', 'K2']
]);

let inputId = 0;

type PointerSnapshot = {
  screenPosition: ReturnType<typeof vec2>;
  playfieldPosition: ReturnType<typeof vec2>;
};

export class InputManager {
  private transform: PlayfieldTransform;

  private lastPointer: PointerSnapshot;

  constructor(private readonly options: InputManagerOptions) {
    this.transform = computePlayfieldTransform(options.getScreenRect());
    this.lastPointer = this.pointerSnapshotForScreen(playfieldToScreen(this.transform, PLAYFIELD_CENTER));
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

  private readonly pointerSnapshotForScreen = (screenPosition: ReturnType<typeof vec2>): PointerSnapshot => ({
    screenPosition,
    playfieldPosition: screenToPlayfield(this.transform, screenPosition)
  });

  private readonly refreshLastPointer = (): PointerSnapshot => {
    this.updateSize();
    this.lastPointer = this.pointerSnapshotForScreen(this.lastPointer.screenPosition);
    return this.lastPointer;
  };

  private readonly pointerPosition = (event: PointerEvent) => {
    this.updateSize();
    const rect = this.options.target.getBoundingClientRect();
    const screenPosition = vec2(event.clientX - rect.left, event.clientY - rect.top);
    this.lastPointer = this.pointerSnapshotForScreen(screenPosition);
    return this.lastPointer;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyC') {
      if (!event.repeat) {
        event.preventDefault();
        this.options.onSmokeActive?.(true);
      }
      return;
    }

    const key = keyboardMap.get(event.code);
    if (event.repeat) {
      return;
    }
    if (key) {
      event.preventDefault();
      this.emit({ kind: 'press', source: 'keyboard', key, ...this.refreshLastPointer() });
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyC') {
      event.preventDefault();
      this.options.onSmokeActive?.(false);
      return;
    }

    const key = keyboardMap.get(event.code);
    if (key) {
      event.preventDefault();
      this.emit({ kind: 'release', source: 'keyboard', key, ...this.refreshLastPointer() });
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
