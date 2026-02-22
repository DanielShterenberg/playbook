// TypeScript types and interfaces for the Basketball Playbook app.
// Full definitions will be implemented in issue #47.

export type Role = "admin" | "editor" | "viewer";

export type CourtType = "half" | "full";

export type Category =
  | "offense"
  | "defense"
  | "inbound"
  | "press-break"
  | "fast-break"
  | "oob"
  | "special";

export type AnnotationType = "movement" | "dribble" | "pass" | "screen" | "cut";

export interface Point {
  x: number;
  y: number;
}

export interface PlayerState {
  position: number;
  x: number;
  y: number;
  visible: boolean;
}

export interface BallState {
  x: number;
  y: number;
  attachedTo: { side: "offense" | "defense"; position: number } | null;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  from: Point;
  to: Point;
  fromPlayer: { side: string; position: number } | null;
  toPlayer: { side: string; position: number } | null;
  controlPoints: Point[];
}

export interface TimingGroup {
  step: number;
  duration: number;
  annotations: Annotation[];
}

export interface Scene {
  id: string;
  order: number;
  duration: number;
  note: string;
  players: {
    offense: PlayerState[];
    defense: PlayerState[];
  };
  ball: BallState;
  timingGroups: TimingGroup[];
}

export interface RosterPlayer {
  position: number;
  name: string;
  abbreviation?: string;
}

export interface TeamMember {
  userId: string;
  role: Role;
}

export interface Team {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  roster: {
    offense: RosterPlayer[];
    defense: RosterPlayer[];
  };
  members: TeamMember[];
  inviteCode: string;
}

export interface PlayColors {
  /** Fill color for offensive player tokens (defaults to "#E07B39"). */
  offense: string;
  /** Stroke/X color for defensive player tokens (defaults to "#1E3A5F"). */
  defense: string;
}

export interface Play {
  id: string;
  teamId: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  courtType: CourtType;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  scenes: Scene[];
  /** Optional custom colors for offensive and defensive player tokens. */
  colors?: PlayColors;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  teamId: string | null;
}
