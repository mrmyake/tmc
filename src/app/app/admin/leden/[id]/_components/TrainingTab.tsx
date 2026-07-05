import { listProgramsForMember } from "@/lib/admin/training-programs-query";
import { ProgramListClient } from "./ProgramListClient";

interface Props {
  profileId: string;
}

/**
 * Tab "Schema" op de member-detailpagina: versie-historie van de
 * trainingsschema's van deze klant. Async server component; haalt zijn
 * eigen data op i.p.v. MemberDetail uit te breiden.
 */
export async function TrainingTab({ profileId }: Props) {
  const programs = await listProgramsForMember(profileId);
  return <ProgramListClient profileId={profileId} programs={programs} />;
}
