"use client";

/**
 * SharedPlayViewPage — public read-only play viewer (issue #78).
 *
 * URL: /view/[shareToken]. No sign-in needed: the snapshot in
 * sharedPlays/{shareToken} is publicly readable in the Firestore rules.
 */

import PlayViewer from "@/components/viewer/PlayViewer";
import { loadSharedPlay } from "@/lib/team";

export default function SharedPlayViewPage({ params }: { params: { shareToken: string } }) {
  const { shareToken } = params;
  return <PlayViewer loadKey={shareToken} load={() => loadSharedPlay(shareToken)} />;
}
