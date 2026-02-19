import { redirect } from "next/navigation";

/**
 * Landing page — immediately redirects to the playbook grid view.
 * The playbook page (issue #69) is the real home screen.
 */
export default function Home() {
  redirect("/playbook");
}
