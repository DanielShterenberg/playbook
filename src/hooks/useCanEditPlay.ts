import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { canEditPlay } from "@/lib/permissions";
import { useStore } from "@/lib/store";

/** Whether the signed-in user may edit the play open in the editor. */
export function useCanEditPlay(): boolean {
  const { role } = useTeam();
  const { user } = useAuth();
  const createdBy = useStore((s) => s.currentPlay?.createdBy);
  return canEditPlay(role, createdBy === undefined ? null : { createdBy }, user?.uid);
}
