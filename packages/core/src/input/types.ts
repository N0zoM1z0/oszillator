import type { Vec2 } from '../math/vec2';

export type GameplayButton = 'K1' | 'K2' | 'M1' | 'M2';

export type GameplayInputEvent = {
  id: string;
  kind: 'press' | 'release' | 'move';
  source: 'keyboard' | 'mouse' | 'touch' | 'pointer';
  key?: GameplayButton;
  screenPosition?: Vec2;
  playfieldPosition?: Vec2;
  browserTimestampMs: number;
  gameTimestampMs: number;
};
