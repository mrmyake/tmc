/**
 * Rolhulp zonder Supabase-import. Trainers en admins zijn staf: zij krijgen
 * nooit een health-intake-scherm of intake-drempel (besluit Ilja,
 * fix/profiles-self-update-lockdown). De intake is een ledenstap; de
 * deelnemerslijst blijft health_notes alleen bij has_health_access tonen
 * (loadParticipants), dat staat hier los van.
 */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === "trainer" || role === "admin";
}
