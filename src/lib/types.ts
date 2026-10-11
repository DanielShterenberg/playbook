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

export type AnnotationType = "movement" | "dribble" | "pass" | "screen" | "cut" | "guard" | "handoff";

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
  /**
   * Optional intermediate waypoints for multi-leg paths (issue #129).
   * When present, the path is: from → waypoints[0] → ... → waypoints[n-1] → to.
   * Each element is a normalised [0-1] court coordinate.
   */
  waypoints?: Point[];
}

export interface TimingGroup {
  step: number;
  duration: number;
  annotations: Annotation[];
}

/**
 * Longest scene note that counts as the scene's name. A one-line note up to
 * this length is shown as "Scene 2 of 4 · Flare"; anything longer is a
 * description. The editor's Rename field stops here.
 */
export const SCENE_NAME_MAX = 28;

/** The scene's name (a short one-line note), or "" when it has none. */
export function sceneName(scene: { note?: string | null } | null | undefined): string {
  const note = (scene?.note ?? "").trim();
  return note.length <= SCENE_NAME_MAX && !note.includes("\n") ? note : "";
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
  /** undefined/null = inherit play.flipped; boolean = override for this scene only */
  flipped?: boolean | null;
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
  /** Fill color for offensive player tokens. A stored default means "none" — see customTeamColor. */
  offense: string;
  /** Fill color for defensive player tokens. A stored default means "none" — see customTeamColor. */
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
  /** When true, basket is at the top (north) instead of the default south. */
  flipped?: boolean;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  teamId: string | null;
}

export interface CommentReply {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Date;
}

export interface Comment {
  id: string;
  playId: string;
  sceneId: string | null;
  stepId: number | null;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Date;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  replies: CommentReply[];
}
