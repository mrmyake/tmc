# Spec: vrij trainen op /app/rooster

Leden vonden vrij trainen niet: `/app/rooster` filterde de pijler weg en niets linkte naar `/app/vrij-trainen`. Vrij trainen is nu een weergave van het rooster, afhankelijk van wat de memberships dekken.

## Beslissingen

- **Gedekte pijlers** komen uit `loadCoveredPillars` (`src/lib/member/covered-pillars.ts`): de vereniging van `covered_pillars` over alle memberships van het lid met status `active`, `cancellation_requested` of `paused`. `pt_package` telt niet mee, rittenkaarten (`ten_ride_card`) wel. De helper levert ook of alle rijen die `vrij_trainen` dekken gepauzeerd zijn, en de weekcap van de nieuwste zo'n rij voor de check-in-weergave. Hij bepaalt alleen de weergave; `canBook` en de membership-selectie in `rooster/page.tsx` zijn niet aangepast.
- **Alleen vrij trainen gedekt:** `/app/rooster` toont direct de slotkiezer, titel "Vrij trainen", subregel "Boek je tijd. Maximaal {vrij_trainen_max_concurrent} mensen tegelijk." Geen schakelaar.
- **Vrij trainen plus minstens een lessenpijler:** segmented control "Lessen | Vrij trainen" (`WeergaveSwitch`), standaard Lessen. De keuze staat in `?weergave=vrij` (afwezig is lessen). De dag-parameter blijft behouden bij wisselen. `from` en `pijler` horen bij de lessen-weergave en gaan niet mee.
- **Geen vrij trainen gedekt, of staf zonder membership:** rooster zoals voorheen, geen schakelaar, geen kaartje. `?weergave=vrij` wordt dan genegeerd.
- **Boekmodus uit** (`booking_settings.vrij_trainen_booking_enabled = false`): de vrij-trainen-weergave toont de check-in-weergave, logica ongewijzigd ten opzichte van de oude pagina. Het kaartje in de lessen-weergave verschijnt dan niet.
- **Kaartje "Liever vrij trainen?"** onder (op desktop naast) de lessen van de gekozen dag, met "Nog X van Y plekken vrij om HH:MM". `nextFreeStart` (`src/lib/member/vrij-trainen-slots.ts`) probeert eerst een start waar `DEFAULT_SLOT_DURATION` (60 min) past, dan 30 min; geen van beide betekent geen kaartje. De data komt uit `loadVrijTrainenPicker`, er is geen tweede berekening.
- **Twee dagstrips** (rooster en slotkiezer) op dezelfde plek met dezelfde opmaak. Staat `dag` buiten het zevendagenvenster van vrij trainen, dan snapt de kiezer naar de eerste dag met een sessie.
- **Slotkiezer:** starttijden per uur gegroepeerd: een kopregel over de volle rasterbreedte met het uur en rechts "Marlon aanwezig" als dat uur binnen de vensters van `tmc.trainer_presence_windows` valt (sinds de proefcodes PR 2; was `PRESENCE_MARLON`) valt (`trainerPresentInHour`, zelfde bron en logica als voorheen), daaronder de kwartieren in een raster van 3 kolommen onder 768px, 4 tot 1024px en 6 vanaf 1024px. Op desktop een sticky zijpaneel van 320px met dag en openingstijd, duurkeuze, "Jouw tijd" en de boekknop; op mobiel en tablet de vaste voet met een boekknop over volle breedte. Boek- en annuleeracties, `quarterCells` en `nextFreeStart` zijn ongewijzigd.
- **`/app/vrij-trainen`** redirect naar `/app/rooster?weergave=vrij` met `dag`. De componenten staan in `src/app/app/rooster/_components/vrij-trainen/`. `revalidatePath("/app/vrij-trainen")` is vervallen, `/app/rooster` werd al ververst.
- **Copy** is overal gemarkeerd met `COPY: confirm met Marlon`. Stijl volgt de bestaande tokens en fonts van de codebase.
- **Meting:** geen. Navigatie in de ledenomgeving valt buiten de meetgrens.

## Ledger

- **PR #264 (2026-09-30, merge `f8319e1`, feat/rooster-vrij-trainen, geen migratie):** vrij trainen is een weergave van `/app/rooster` op basis van de gedekte pijlers (`loadCoveredPillars`, schakelaar, kaartje met `nextFreeStart`, slotkiezer als raster met sticky zijpaneel op desktop), `/app/vrij-trainen` redirect, `_components` verhuisd en verwijzingen en commentaar bijgewerkt. Bewust niet aangeraakt: `canBook` en de membership-selectie van het rooster, de boek- en annuleeracties, de check-in-logica, `booking_settings` en alle migraties, prijzen, de dagstrips zelf (twee aparte componenten), `SessionRow` (op 390px breken lange lesnamen al in de bestaande lijst) en `NotEligibleView` (vervallen, niet meer bereikbaar). Productiedeploy van `f8319e1` geslaagd.
