import {
  ACCESS_PIN_LENGTH,
  AKILES_OBJECT_NAMES,
  type AccessGroup,
} from "./constants";
import {
  buildClosedWeekdays,
  buildExtendedWeekdays,
  buildStaffWeekdays,
  buildStandardWeekdays,
  type ScheduleWeekday,
} from "./schedule";
import { resolveDesiredAccess, rollingWindowEnd } from "./desired-state";
import {
  isAkilesNotFound,
  type AccessConfigRow,
  type AccessCredentialsRow,
  type AccessProfile,
  type AkilesApi,
  type AkilesPermissionRule,
  type ProfileSyncResult,
  type ResolvedAccessConfig,
  type SyncAllResult,
  type SyncDeps,
} from "./types";

/**
 * Kern van de Akiles-sync, zonder server-only imports en zonder directe
 * DB- of netwerkcalls: alles loopt via SyncDeps. De echte wiring staat in
 * sync.ts; de tests in scripts/access/ draaien exact deze code met fakes.
 *
 * Invarianten:
 *  - Zonder Akiles-client (geen API-key) raakt geen enkel pad de DB.
 *  - Idempotent: een tweede run met dezelfde invoer maakt niets nieuws aan.
 *  - Per profiel foutgeisoleerd: een fout landt in last_error, de run loopt door.
 *  - PIN- en magic-link-waarden komen hier nooit voorbij, alleen hun ids.
 *  - Elk id dat Akiles teruggeeft wordt meteen naar access_credentials
 *    geschreven, zodat een latere fout in dezelfde run geen wees achterlaat.
 */

const PERMISSION_ACCESS_METHODS = {
  online: false,
  bluetooth: false,
  mobile_nfc: true,
  pin: true,
  card: false,
} as const;

export function permissionRuleFor(scheduleId: string): AkilesPermissionRule[] {
  return [{ schedule_id: scheduleId, access_methods: { ...PERMISSION_ACCESS_METHODS } }];
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Config: schedules en groepen provisionen (idempotent)
// ---------------------------------------------------------------------------

async function ensureSchedule(
  akiles: AkilesApi,
  existingId: string | null,
  name: string,
  weekdays: ScheduleWeekday[],
): Promise<string> {
  if (existingId) {
    try {
      await akiles.editSchedule(existingId, { name, weekdays });
      return existingId;
    } catch (err) {
      // In het Akiles-paneel verwijderd: opnieuw aanmaken, id vervangen.
      if (!isAkilesNotFound(err)) throw err;
    }
  }
  const created = await akiles.createSchedule({ name, weekdays });
  return created.id;
}

async function ensureGroup(
  akiles: AkilesApi,
  existingId: string | null,
  name: string,
  scheduleId: string,
): Promise<string> {
  const body = { name, permissions: permissionRuleFor(scheduleId) };
  if (existingId) {
    try {
      await akiles.editMemberGroup(existingId, body);
      return existingId;
    } catch (err) {
      if (!isAkilesNotFound(err)) throw err;
    }
  }
  const created = await akiles.createMemberGroup(body);
  return created.id;
}

/**
 * Welke schedule elke ledengroep krijgt. Bij lockdown wijzen beide
 * ledengroepen naar het gesloten schedule; staf houdt altijd toegang.
 */
export function groupScheduleIds(cfg: ResolvedAccessConfig): {
  standard: string;
  extended: string;
  staff: string;
} {
  return {
    standard: cfg.lockdown ? cfg.schedule_closed_id : cfg.schedule_standard_id,
    extended: cfg.lockdown ? cfg.schedule_closed_id : cfg.schedule_extended_id,
    staff: cfg.schedule_staff_id,
  };
}

/** Patcht de permission rules van de drie groepen naar hun huidige schedule. */
export async function applyGroupSchedules(
  akiles: AkilesApi,
  cfg: ResolvedAccessConfig,
): Promise<void> {
  const ids = groupScheduleIds(cfg);
  await akiles.editMemberGroup(cfg.group_standard_id, {
    name: AKILES_OBJECT_NAMES.groupStandard,
    permissions: permissionRuleFor(ids.standard),
  });
  await akiles.editMemberGroup(cfg.group_extended_id, {
    name: AKILES_OBJECT_NAMES.groupExtended,
    permissions: permissionRuleFor(ids.extended),
  });
  await akiles.editMemberGroup(cfg.group_staff_id, {
    name: AKILES_OBJECT_NAMES.groupStaff,
    permissions: permissionRuleFor(ids.staff),
  });
}

/**
 * Maakt schedules en groepen aan als access_config leeg is en patcht ze
 * anders bij, zodat een gewijzigde openingstijd de volgende run doorkomt.
 * Schrijft de ids terug naar access_config.
 */
export async function ensureAccessConfig(
  deps: SyncDeps,
  akiles: AkilesApi,
): Promise<ResolvedAccessConfig> {
  const cfg = await deps.db.getConfig();
  if (!cfg) {
    throw new Error("tmc.access_config ontbreekt; de migratie seedt die rij");
  }
  const hours = await deps.db.getOpeningHours();

  const scheduleStandard = await ensureSchedule(
    akiles,
    cfg.schedule_standard_id,
    AKILES_OBJECT_NAMES.scheduleStandard,
    buildStandardWeekdays(hours),
  );
  const scheduleExtended = await ensureSchedule(
    akiles,
    cfg.schedule_extended_id,
    AKILES_OBJECT_NAMES.scheduleExtended,
    buildExtendedWeekdays(),
  );
  const scheduleClosed = await ensureSchedule(
    akiles,
    cfg.schedule_closed_id,
    AKILES_OBJECT_NAMES.scheduleClosed,
    buildClosedWeekdays(),
  );
  const scheduleStaff = await ensureSchedule(
    akiles,
    cfg.schedule_staff_id,
    AKILES_OBJECT_NAMES.scheduleStaff,
    buildStaffWeekdays(),
  );

  const partial: ResolvedAccessConfig = {
    lockdown: cfg.lockdown,
    schedule_standard_id: scheduleStandard,
    schedule_extended_id: scheduleExtended,
    schedule_closed_id: scheduleClosed,
    schedule_staff_id: scheduleStaff,
    // Tijdelijk; hieronder gevuld.
    group_standard_id: cfg.group_standard_id ?? "",
    group_extended_id: cfg.group_extended_id ?? "",
    group_staff_id: cfg.group_staff_id ?? "",
  };
  const ids = groupScheduleIds(partial);

  const groupStandard = await ensureGroup(
    akiles,
    cfg.group_standard_id,
    AKILES_OBJECT_NAMES.groupStandard,
    ids.standard,
  );
  const groupExtended = await ensureGroup(
    akiles,
    cfg.group_extended_id,
    AKILES_OBJECT_NAMES.groupExtended,
    ids.extended,
  );
  const groupStaff = await ensureGroup(
    akiles,
    cfg.group_staff_id,
    AKILES_OBJECT_NAMES.groupStaff,
    ids.staff,
  );

  const resolved: ResolvedAccessConfig = {
    ...partial,
    group_standard_id: groupStandard,
    group_extended_id: groupExtended,
    group_staff_id: groupStaff,
  };

  const changed = (Object.keys(resolved) as Array<keyof ResolvedAccessConfig>).some(
    (key) => key !== "lockdown" && resolved[key] !== (cfg[key] ?? null),
  );
  if (changed) {
    const patch: Partial<AccessConfigRow> = {
      schedule_standard_id: resolved.schedule_standard_id,
      schedule_extended_id: resolved.schedule_extended_id,
      schedule_closed_id: resolved.schedule_closed_id,
      schedule_staff_id: resolved.schedule_staff_id,
      group_standard_id: resolved.group_standard_id,
      group_extended_id: resolved.group_extended_id,
      group_staff_id: resolved.group_staff_id,
    };
    await deps.db.saveConfig(patch);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Per profiel
// ---------------------------------------------------------------------------

function groupIdFor(cfg: ResolvedAccessConfig, group: AccessGroup): string {
  switch (group) {
    case "standard":
      return cfg.group_standard_id;
    case "extended":
      return cfg.group_extended_id;
    case "staff":
      return cfg.group_staff_id;
  }
}

function memberDisplayName(profile: AccessProfile): string {
  const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return name || profile.id;
}

function isCurrentlyEnabled(
  cred: AccessCredentialsRow | null,
  now: Date,
): boolean {
  if (!cred || !cred.akiles_member_id || !cred.access_ends_at) return false;
  return new Date(cred.access_ends_at) > now;
}

/** Zet de toegang uit in Akiles: ends_at in het verleden en de PIN weg. */
async function revokeInAkiles(
  deps: SyncDeps,
  akiles: AkilesApi,
  cred: AccessCredentialsRow,
  now: Date,
): Promise<string> {
  const memberId = cred.akiles_member_id as string;
  const pastEnd = new Date(now.getTime() - 60_000).toISOString();
  try {
    await akiles.editMember(memberId, { ends_at: pastEnd });
  } catch (err) {
    // Member al weg in Akiles: dan is de toegang per definitie dicht.
    if (!isAkilesNotFound(err)) throw err;
  }
  if (cred.akiles_pin_id) {
    try {
      await akiles.deletePin(memberId, cred.akiles_pin_id);
    } catch (err) {
      if (!isAkilesNotFound(err)) throw err;
    }
  }
  return pastEnd;
}

/** Zorgt dat de member precies een associatie heeft, naar de gewenste groep. */
async function reconcileGroupAssociation(
  akiles: AkilesApi,
  memberId: string,
  desiredGroupId: string,
): Promise<boolean> {
  const associations = (await akiles.listGroupAssociations(memberId)).filter(
    (a) => !a.is_deleted,
  );
  let keep: string | null = null;
  let changed = false;
  for (const assoc of associations) {
    if (assoc.member_group_id === desiredGroupId && keep === null) {
      keep = assoc.id;
      continue;
    }
    await akiles.deleteGroupAssociation(memberId, assoc.id);
    changed = true;
  }
  if (keep === null) {
    await akiles.createGroupAssociation(memberId, { member_group_id: desiredGroupId });
    changed = true;
  }
  return changed;
}

export async function syncProfileCore(
  deps: SyncDeps,
  akiles: AkilesApi,
  cfg: ResolvedAccessConfig,
  profileId: string,
): Promise<ProfileSyncResult> {
  const now = deps.now();
  const nowIso = now.toISOString();
  let cred: AccessCredentialsRow | null = null;

  try {
    const [profile, existing] = await Promise.all([
      deps.db.getProfile(profileId),
      deps.db.getCredentials(profileId),
    ]);
    cred = existing;
    const wasEnabled = isCurrentlyEnabled(cred, now);

    // Profiel verdwenen (of nog nooit in Akiles): niets om aan te zetten.
    // Bestond er wel een Akiles-member, dan dicht.
    const desired = profile
      ? resolveDesiredAccess(
          { role: profile.role, memberships: profile.memberships },
          now,
        )
      : { enabled: false, group: null, endsAt: null, reason: "profile_missing" };

    if (!desired.enabled) {
      if (!cred || !cred.akiles_member_id) {
        return { profileId, ok: true, outcome: "noop" };
      }
      if (!wasEnabled && !cred.akiles_pin_id) {
        // Al dicht en al zonder PIN: niets te doen. Alleen de timestamp.
        await deps.db.upsertCredentials({
          profile_id: profileId,
          last_synced_at: nowIso,
          last_error: null,
        });
        return { profileId, ok: true, outcome: "noop" };
      }
      const pastEnd = await revokeInAkiles(deps, akiles, cred, now);
      await deps.db.upsertCredentials({
        profile_id: profileId,
        akiles_pin_id: null,
        access_group: null,
        access_ends_at: pastEnd,
        last_synced_at: nowIso,
        last_error: null,
      });
      if (wasEnabled) {
        await deps.emit({
          type: "access.revoked",
          subjectId: profileId,
          payload: { profile_id: profileId, reason: desired.reason },
        });
      }
      return { profileId, ok: true, outcome: wasEnabled ? "revoked" : "updated" };
    }

    // Toegang aan.
    const target = profile as AccessProfile;
    const group = desired.group as AccessGroup;
    const endsAt = (desired.endsAt ?? rollingWindowEnd(now)).toISOString();
    const name = memberDisplayName(target);
    const metadata = {
      source: "tmc",
      profile_id: target.id,
      is_test: target.is_test ? "true" : "false",
    };

    let memberId = cred?.akiles_member_id ?? null;
    let pinId = cred?.akiles_pin_id ?? null;
    let magicLinkId = cred?.akiles_magic_link_id ?? null;
    let changed = false;

    if (memberId) {
      try {
        await akiles.editMember(memberId, { name, ends_at: endsAt });
      } catch (err) {
        if (!isAkilesNotFound(err)) throw err;
        // Member in Akiles verwijderd: PIN en link zijn daarmee ook weg.
        memberId = null;
        pinId = null;
        magicLinkId = null;
      }
    }
    if (!memberId) {
      const created = await akiles.createMember({
        name,
        starts_at: null,
        ends_at: endsAt,
        metadata,
      });
      memberId = created.id;
      changed = true;
      await deps.db.upsertCredentials({
        profile_id: profileId,
        akiles_member_id: memberId,
        akiles_pin_id: null,
        akiles_magic_link_id: null,
      });
    }

    if (!pinId) {
      // length: Akiles genereert en garandeert uniciteit in de organisatie.
      // De wrapper geeft alleen het id terug; de waarde blijft bij Akiles.
      const pin = await akiles.createPin(memberId, { length: ACCESS_PIN_LENGTH });
      pinId = pin.id;
      changed = true;
      await deps.db.upsertCredentials({ profile_id: profileId, akiles_pin_id: pinId });
    }

    if (!magicLinkId) {
      const link = await akiles.createMagicLink(memberId);
      magicLinkId = link.id;
      changed = true;
      await deps.db.upsertCredentials({
        profile_id: profileId,
        akiles_magic_link_id: magicLinkId,
      });
    }

    const associationChanged = await reconcileGroupAssociation(
      akiles,
      memberId,
      groupIdFor(cfg, group),
    );
    changed = changed || associationChanged;

    await deps.db.upsertCredentials({
      profile_id: profileId,
      akiles_member_id: memberId,
      akiles_pin_id: pinId,
      akiles_magic_link_id: magicLinkId,
      access_group: group,
      access_ends_at: endsAt,
      last_synced_at: nowIso,
      last_error: null,
    });

    if (!wasEnabled) {
      await deps.emit({
        type: "access.granted",
        subjectId: profileId,
        payload: {
          profile_id: profileId,
          group,
          ends_at: endsAt,
          reason: desired.reason,
        },
      });
      return { profileId, ok: true, outcome: "granted" };
    }
    const groupChanged = cred?.access_group !== group;
    return {
      profileId,
      ok: true,
      outcome: changed || groupChanged ? "updated" : "noop",
    };
  } catch (err) {
    const message = errorMessage(err);
    deps.log.error("[access-sync] profiel mislukt", { profileId, error: message });
    try {
      await deps.db.upsertCredentials({
        profile_id: profileId,
        last_error: message.slice(0, 500),
      });
    } catch (persistErr) {
      deps.log.error("[access-sync] last_error wegschrijven mislukt", {
        profileId,
        error: errorMessage(persistErr),
      });
    }
    return { profileId, ok: false, outcome: "noop", error: message };
  }
}

// ---------------------------------------------------------------------------
// Ingangen
// ---------------------------------------------------------------------------

const NOT_CONFIGURED_MESSAGE =
  "[access-sync] AKILES_API_KEY ontbreekt; sync overgeslagen (geen DB-writes)";

export async function syncOneCore(
  deps: SyncDeps,
  profileId: string,
): Promise<ProfileSyncResult> {
  if (!deps.akiles) {
    deps.log.info(NOT_CONFIGURED_MESSAGE, { profileId });
    return { profileId, ok: true, outcome: "noop" };
  }
  try {
    const cfg = await ensureAccessConfig(deps, deps.akiles);
    return await syncProfileCore(deps, deps.akiles, cfg, profileId);
  } catch (err) {
    const message = errorMessage(err);
    deps.log.error("[access-sync] config-provisioning mislukt", { error: message });
    return { profileId, ok: false, outcome: "noop", error: message };
  }
}

export async function syncAllCore(deps: SyncDeps): Promise<SyncAllResult> {
  if (!deps.akiles) {
    // Een keer per run, daarna stil.
    deps.log.info(NOT_CONFIGURED_MESSAGE);
    return { ok: true, skipped: true, processed: 0, failed: 0, failures: [] };
  }

  let cfg: ResolvedAccessConfig;
  try {
    cfg = await ensureAccessConfig(deps, deps.akiles);
  } catch (err) {
    const message = errorMessage(err);
    deps.log.error("[access-sync] config-provisioning mislukt", { error: message });
    return {
      ok: false,
      skipped: false,
      processed: 0,
      failed: 0,
      failures: [],
      error: message,
    };
  }

  const profileIds = await deps.db.listSyncCandidateProfileIds();
  let processed = 0;
  const failures: Array<{ profileId: string; error: string }> = [];
  for (const profileId of profileIds) {
    const result = await syncProfileCore(deps, deps.akiles, cfg, profileId);
    if (result.ok) {
      processed++;
    } else {
      failures.push({ profileId, error: result.error ?? "onbekend" });
    }
  }
  return {
    ok: true,
    skipped: false,
    processed,
    failed: failures.length,
    failures,
  };
}
