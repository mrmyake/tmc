// Gedeelde meldingen van de proefcode-flow (server en client). Bestaat-niet,
// ingetrokken, op en verlopen krijgen bewust dezelfde tekst: de bezoeker mag
// niet kunnen afleiden welke codes bestaan.

// COPY: confirm met Marlon
export const CODE_INVALID_MESSAGE = "Deze proefcode is niet geldig.";
// COPY: confirm met Marlon
export const CODE_RATE_LIMITED_MESSAGE = "Te veel pogingen. Probeer het later opnieuw.";
// COPY: confirm met Marlon
export const CODE_NOT_AVAILABLE_MESSAGE =
  "Deze code is nog niet te gebruiken via de website. Neem contact met ons op.";
// Code met "alleen nieuwe klanten": al lid of klant, of al een proefles gehad
// of gepland (tmc.redeem_trial_code, reason already_customer).
// COPY: confirm met Marlon
export const CODE_ALREADY_CUSTOMER_MESSAGE =
  "Deze code is alleen voor nieuwe leden. Je bent al bij ons bekend, of je hebt al een proefles gehad of gepland. Boek je proefles tegen het drop-in-tarief, of neem contact met ons op.";
// Code met "een keer per persoon": dit e-mailadres of nummer heeft deze code
// al gebruikt (reason already_used_code).
// COPY: confirm met Marlon
export const CODE_ALREADY_USED_MESSAGE =
  "Deze code is al gebruikt met dit e-mailadres of telefoonnummer. Een code geldt een keer per persoon.";
// COPY: confirm met Marlon
export const CODE_INVALID_PHONE_MESSAGE =
  "Dit telefoonnummer herkennen we niet. Gebruik je landcode, bijvoorbeeld +31 6 12345678.";
// COPY: confirm met Marlon
export const CODE_INVALID_EMAIL_MESSAGE = "Dit e-mailadres herkennen we niet.";
