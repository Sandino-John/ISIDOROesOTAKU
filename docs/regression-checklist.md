# Regression Checklist

Manual smoke test for the Motel 23 system.

Use this checklist after touching:

- `public/app.js`
- `public/index.html`
- `public/style.css`
- `server.js`
- inventory routes or DB logic
- checkout, cashbox, reporting, or accounting code

## Test Setup

- Run the app from the target workspace.
- Open the UI in a clean browser tab.
- Confirm the app loads without console errors.
- If possible, test against a disposable/local copy of the database.

## 1. App Boot

- Open `/` and verify the main dashboard renders.
- Confirm room cards appear.
- Confirm sidebar buttons open correctly.
- Confirm no broken product images appear in minibar/product views.

Expected:

- UI loads fully.
- No blank screen.
- No missing critical icons or images.

## 2. Basic Check-in

- Pick a free room.
- Perform check-in without prepaid amount.
- Choose a vehicle/guest marker.
- Verify the room becomes occupied.
- Verify timer starts running.

Expected:

- Room changes from free to occupied.
- Timer updates live.
- Checkout modal can open.

## 3. Checkout in Cash

- Use an occupied room without prepaid amount.
- Go to checkout.
- Leave payment fully in cash.
- Confirm checkout.

Expected:

- Room moves to cleaning state.
- History receives the entry.
- Current shift receives the entry.
- Cash totals increase in the time cashbox.
- No QR commission is shown.

## 4. Checkout in QR

- Check in a room again.
- Go to checkout.
- Move the room payment fully to QR.
- Confirm the displayed QR commission appears.
- Confirm checkout.

Expected:

- Final total includes the QR commission.
- History entry stores room `cash`, `qr`, and `comision`.
- Cashbox summary shows QR amount and commission correctly.
- Accounting should register:
  - room income
  - QR surcharge income

## 5. Mixed Checkout

- Check in another room.
- In checkout, split room payment between cash and QR.
- Confirm checkout.

Expected:

- Cash and QR split match the entered amounts.
- Commission only applies to the QR portion of the room.
- Total charged equals room pending amount plus commission.

## 6. Prepaid Flow

- Check in a room using prepaid hours.
- Use one of:
  - cash prepaid
  - QR prepaid
  - mixed prepaid
- Open checkout later.

Expected:

- Room card shows prepaid state/countdown.
- Checkout discounts the prepaid amount from the room bill.
- Remaining room balance is correct.
- Cashbox totals include prepaid cash/QR correctly.

## 7. Minibar Sale from Room

- Occupy a room.
- Add a minibar beverage item.
- Confirm checkout.

Expected:

- Beverage amount appears under minibar, not vitrina.
- Beverage stock is reduced from inventory.
- Cashbox “Bebidas” reflects the payment.
- Accounting uses:
  - `1003` for cash beverage sales
  - `1002` for QR beverage sales
  - `4002` as income

## 8. Vitrina Sale from Room

- Occupy a room.
- Add a vitrina item.
- Confirm checkout.

Expected:

- Vitrina amount appears under vitrina, not minibar.
- Vitrina stock is reduced from inventory.
- Cashbox “Vitrina” reflects the payment.
- Accounting uses:
  - `1004` for cash vitrina sales
  - `1002` for QR vitrina sales
  - `4003` as income

## 9. Direct Vitrina Sale

- Open direct vitrina sale flow.
- Sell one vitrina item in cash.
- Sell another one in QR if possible.

Expected:

- Sale is recorded.
- Vitrina totals update.
- Vitrina stock decreases.
- QR-only sales do not appear as if they entered the physical vitrina cashbox.

## 10. Cashbox: Main Time Cash

- Set initial cash amount.
- Add one expense.
- Make one cash checkout.
- Make one QR checkout.

Expected:

- Time cashbox total = initial cash + cash income - change - expenses.
- Digital total reflects QR collections.
- Commissions are shown separately and do not disappear.

## 11. Cashbox: Bebidas and Vitrina

- Set initial stock amount for bebidas.
- Set initial stock amount for vitrina.
- Register at least one sale in each.
- Register one withdrawal in each.
- Open “Libros” for bebidas and vitrina.

Expected:

- Each box only shows movements that touched its own physical cashbox.
- QR-only sales increase digital/accounting totals but do not fake a physical cash entry.
- Stock initial, sales, withdrawals, and saldo are coherent.

## 12. Accounting Views

- Open “Libros”.
- Review:
  - Diario
  - Mayor
  - Resultados
  - Bebidas
  - Vitrina

Expected:

- Diario shows recent seats.
- Mayor balances update after test operations.
- Resultados includes room/minibar/vitrina income.
- QR surcharge appears as its own income account if used.
- Bebidas and vitrina tabs do not mix QR movements with physical cash movements.

## 13. Report Generation

- Generate a printable daily report.
- Generate/export JSON if available.
- Trigger autobackup if the flow exists.

Expected:

- Files are written inside `public/Reportes Diarios/`.
- HTML save works.
- PDF generation works for HTML reports.
- No server crash if report generation fails.

## 14. Inventory Admin Module

- Open `/almacen`.
- Create or edit a product if needed.
- Register an entry.
- Move stock from almacén to nevera.
- Move stock from almacén to vitrina.

Expected:

- Inventory screens render.
- Stock changes are reflected correctly.
- PMS minibar product feed still loads.

## 15. Shift Close

- Close the current shift.
- Include any stock deposit/shift prepay flows if they are active.

Expected:

- Shift closes without errors.
- Shift summary is coherent.
- Entries remain visible in history/turnos.
- Cashbox and accounting remain consistent after closing.

## 16. Safety Checks

- Try saving a report with a normal filename.
- Verify report save still works.

Expected:

- Normal names like `MIERCOLES 28 marzo 2026 RD.html` work.
- Files stay inside `public/Reportes Diarios/`.
- No unintended write outside that directory.

## Pass Criteria

The build is acceptable only if:

- app boots
- check-in works
- checkout cash works
- checkout QR works
- minibar/vitrina separation works
- cashbox totals are coherent
- accounting views do not contradict cashbox behavior
- report generation does not break the server

## Notes Template

Date:

Workspace:

Tester:

Result:

Open issues:
