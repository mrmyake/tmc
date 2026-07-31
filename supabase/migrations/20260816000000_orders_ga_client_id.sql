-- PR C (conversiebrug, spec-analytics.md): GA4-attributie op de orderrij.
--
-- Twee nullable tekstkolommen op tmc.orders: de GA4 client_id en session_id
-- van de checkout-sessie, client-side uitgelezen op /abonnement (PayStage)
-- vlak vóór createOrderAndCheckout. Ze worden ná create_order() gezet met
-- een losse update via de service-role-client (route (b) uit de discovery):
-- analytics-metadata hoort niet door de autoritatieve prijsfunctie te lopen,
-- dus create_order() blijft ongewijzigd.
--
-- NULL is de normale toestand voor alles wat niet van de publieke site komt:
-- member-app-aankopen (/app/producten), admin-betaallinks (/betaal/<token>)
-- en consent-denied bezoekers. De Mollie-webhook slaat het Measurement
-- Protocol purchase-event over wanneer ga_client_id ontbreekt — dat is per
-- definitie geen acquisitie, geen fout.

alter table tmc.orders
  add column if not exists ga_client_id text,
  add column if not exists ga_session_id text;

comment on column tmc.orders.ga_client_id is
  'GA4 client_id van de checkout-sessie op de publieke site (gtag get / _ga-cookie). NULL voor member-app-, admin- en consent-denied-orders. Gezet door createOrderAndCheckout ná create_order(); gelezen door sendPurchaseToGa4 in de Mollie-webhook.';

comment on column tmc.orders.ga_session_id is
  'GA4 session_id behorend bij ga_client_id; gaat als event-parameter mee op het Measurement Protocol purchase-event zodat de purchase binnen de oorspronkelijke sessie valt.';
