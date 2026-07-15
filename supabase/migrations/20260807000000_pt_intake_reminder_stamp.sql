-- PT-agenda PR K: reminder-stempel voor intakes.
--
-- De send-reminders-cron dedupet op een reminder_sent_at-kolom
-- (stamp-eerst, mail daarna): tmc.bookings voor groepslessen en
-- tmc.pt_bookings voor PT-boekingen. Een intake is een pt_session met
-- kind='intake' en prospect-velden, ZONDER pt_booking (account-loos),
-- en had dus geen plek voor de stempel; daardoor kreeg een intake nooit
-- een reminder (E2-audit, PR #112). De stempel komt op pt_sessions
-- zelf: dat is waar de intake leeft, en het spiegelt exact het
-- bestaande dedupe-patroon.
--
-- De check houdt het schema strak: bookable sessies stempelen op hun
-- pt_bookings-rij, een block heeft geen mens om te herinneren; alleen
-- een intake mag deze kolom vullen. Wil een later sessie-soort ook een
-- sessie-niveau-stempel, dan versoepelt een migratie de check bewust.
--
-- Schema strak op tmc; public en tvmuur onaangeroerd; 20260503_gallery
-- onaangeroerd.

alter table tmc.pt_sessions
  add column reminder_sent_at timestamptz;

alter table tmc.pt_sessions
  add constraint pt_sessions_reminder_only_intake
  check (reminder_sent_at is null or kind = 'intake');

comment on column tmc.pt_sessions.reminder_sent_at is
  'Reminder-dedupe-stempel, uitsluitend voor kind=intake (account-loos, geen pt_bookings-rij om op te stempelen). Zelfde stamp-eerst-patroon als bookings.reminder_sent_at en pt_bookings.reminder_sent_at.';
