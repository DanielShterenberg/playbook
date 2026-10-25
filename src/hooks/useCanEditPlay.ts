import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { canEditPlay } from "@/lib/permissions";
import { useStore } from "@/lib/store";

/**
 * Whether the signed-in user may edit the play open in the editor. Until the
 * play in the URL is the one in the store, the play counts as unknown, so a
 * viewer does not keep the previous play's edit tools while the next loads.
 */
export function useCanEditPlay(): boolean {
  const { role } = useTeam();
  const { user } = useAuth();
  const params = useParams<{ id?: string }>();
  const play = useStore((s) => s.currentPlay);
  const loaded = play && (!params?.id || play.id === params.id) ? play : null;
  return canEditPlay(role, loaded, user?.uid);
}
