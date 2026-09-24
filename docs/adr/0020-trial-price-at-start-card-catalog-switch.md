# Trial Price is chosen at start; card-upfront is a catalog switch

Trial no longer uses a monthly stand-in plus Interval pick. The catalog names a Trial Plan per currency and, when Trial does not require a card, a default Price on that Product — Kernel creates Trial at Organization create and convert bills that Price. When Trial requires a card, there is no access until Checkout: default Price skips the Plan page; otherwise the Owner picks a Price id (interval) on the Trial Plan, then Checkout starts Trial (`trial_period_days`) and collects the payment method. Billing Portal is not used for the first card. This supersedes Interval pick and unpicked-cancel in [ADR-0019](0019-billing-prices-per-currency-product.md).

## Considered Options

- **Keep Interval pick / unpicked-cancel (ADR-0019)** — rejected: the default or Checkout Price is the chosen Price; a 15-day Trial on yearly should convert to yearly.
- **Card-off without a default Price (Plan page, then `subscriptions.create`)** — rejected: if card is not required the developer must provide Trial Prices.
- **Billing Portal to collect the first card** — rejected: no Subscription yet; that is Checkout.
- **Pick a Plan without a Price id** — rejected: monthly/quarterly/yearly are Prices on one Product.
- **Always require a default Price even when card is on** — rejected: card-on may omit default so the Owner picks a Price before Checkout.
