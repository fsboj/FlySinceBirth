# Event ticket checkout setup

The public site can use an external ticket URL or on-site checkout. On-site tickets use one USD price per event and an optional capacity limit. Existing events remain in external-link mode after the migration.

## Supabase function secrets

Set secrets under **Project Settings → Edge Functions → Secrets**. Never put these values in this repository or in browser JavaScript.

- Stripe: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and optionally `PAYPAL_ENV=live`. Without `PAYPAL_ENV=live`, the function uses PayPal Sandbox.

The Supabase Edge Functions built-in `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are used for database access.

## Stripe webhook

Add an endpoint in Stripe for:

`https://ccvhvxugoebdqwxxankl.supabase.co/functions/v1/event-ticket-stripe-webhook`

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. Save the endpoint's signing secret as `STRIPE_WEBHOOK_SECRET` in Supabase. Stripe appears as an available checkout provider only when both Stripe secrets exist.

## PayPal

Create a PayPal REST app and add its client ID and secret to Supabase. The checkout starts an order and captures it after PayPal returns the buyer to the event page. PayPal is Sandbox unless `PAYPAL_ENV` is set to `live`.

## Buyer ticket receipt

After a successful return, the event page displays a ticket code and order quantity. The current workflow does not email tickets or provide an admin check-in scanner; buyers should save the displayed ticket code.

