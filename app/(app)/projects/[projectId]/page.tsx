/**
 * app/(app)/projects/[projectId]/page.tsx
 * Redirect: /projects/[projectId] → /projects/[projectId]/searches
 */

import { redirect } from "next/navigation";

export default function ProjectPage({ params }: { params: { projectId: string } }) {
  redirect(`/projects/${params.projectId}/searches`);
}
