# app/services/email.py
# Brevo transactional email service
# You already have Brevo set up for Nomi — reuse the same API key.
#
# Required env vars on Railway:
#   BREVO_API_KEY   — your Brevo API key
#   STORE_EMAIL     — e.g. info@velostore.nl  (sender + owner notifications)
#   STORE_URL       — e.g. https://botsupport-production.up.railway.app

import os
import httpx

BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
STORE_EMAIL   = os.getenv("STORE_EMAIL", "info@velostore.nl")
STORE_URL     = os.getenv("STORE_URL", "https://botsupport-production.up.railway.app")
FROM_NAME     = "Velo"


# ── Core send helper ──────────────────────────────────────────────

async def send_email(to_email: str, to_name: str, subject: str, html: str) -> bool:
    """Send a single transactional email via Brevo."""
    if not BREVO_API_KEY:
        print(f"[email] BREVO_API_KEY not set — skipping email to {to_email}")
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "accept": "application/json",
                    "api-key": BREVO_API_KEY,
                    "content-type": "application/json",
                },
                json={
                    "sender":      {"name": FROM_NAME, "email": STORE_EMAIL},
                    "to":          [{"email": to_email, "name": to_name}],
                    "subject":     subject,
                    "htmlContent": html,
                },
            )
        if res.status_code not in (200, 201):
            print(f"[email] Brevo error {res.status_code}: {res.text[:200]}")
            return False
        return True
    except Exception as e:
        print(f"[email] Failed to send email: {e}")
        return False


# ── Email templates ───────────────────────────────────────────────

def _email_wrapper(body_html: str) -> str:
    """Wraps body in consistent Velo branded shell."""
    return f"""<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{{margin:0;padding:0;background:#F7F5F0;font-family:Inter,-apple-system,sans-serif;color:#0D0D0D}}
  .outer{{max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E8E0D0}}
  .header{{background:#0D0D0D;padding:24px 32px}}
  .logo{{font-family:Georgia,serif;color:#fff;font-size:26px;margin:0}}
  .logo span{{color:#C9410A}}
  .body{{padding:32px}}
  .footer{{background:#F7F5F0;padding:16px 32px;font-size:12px;color:#9CA3AF;text-align:center;border-top:1px solid #E8E0D0}}
  h2{{font-family:Georgia,serif;font-size:22px;margin:0 0 12px;letter-spacing:-.3px}}
  p{{font-size:14px;line-height:1.75;color:#374151;margin:0 0 16px}}
  .box{{background:#F7F5F0;border-radius:8px;padding:16px 20px;margin:16px 0}}
  .mono{{font-family:'Courier New',monospace}}
  table{{width:100%;border-collapse:collapse}}
  th{{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6B7280;text-align:left;padding:0 0 8px;border-bottom:1px solid #E8E0D0}}
  td{{font-size:13px;padding:9px 0;border-bottom:1px solid #F7F5F0;vertical-align:top}}
  .btn{{display:inline-block;background:#C9410A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;margin:8px 0}}
  .green{{background:#d1fae5;color:#065f46;border-radius:8px;padding:16px 20px}}
</style></head><body>
<div class="outer">
  <div class="header"><p class="logo">Velo<span>.</span></p></div>
  <div class="body">{body_html}</div>
  <div class="footer">© 2026 Velo &nbsp;·&nbsp; Vragen? <a href="mailto:{STORE_EMAIL}" style="color:#C9410A">{STORE_EMAIL}</a></div>
</div>
</body></html>"""


def _items_table(items: list) -> str:
    rows = ""
    for item in items:
        subtotal = item.get("price", 0) * item.get("qty", 1)
        rows += f"""<tr>
          <td>{item.get('name','—')}</td>
          <td style="text-align:center;color:#6B7280">{item.get('qty',1)}×</td>
          <td style="text-align:right" class="mono">€{subtotal:.2f}</td>
        </tr>"""
    return f"""<table>
      <thead><tr><th>Product</th><th style="text-align:center">Aantal</th><th style="text-align:right">Prijs</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>"""


def _address_block(addr: dict) -> str:
    return (f"{addr.get('street','')}<br/>"
            f"{addr.get('zip_code','')} {addr.get('city','')}<br/>"
            f"{addr.get('country','NL')}")


# ── 1. Order confirmation → customer ─────────────────────────────

async def send_order_confirmation(order) -> bool:
    """Sent to customer immediately after order is placed."""
    addr  = order.shipping_address or {}
    items = order.items or []
    first = order.customer_name.split()[0] if order.customer_name else "klant"

    body = f"""
    <h2>Bedankt voor je bestelling!</h2>
    <p>Hi {first}, je bestelling is ontvangen. We verwerken hem zo snel mogelijk.</p>

    <div class="box">
      <div style="font-size:11px;color:#6B7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Bestelnummer</div>
      <div class="mono" style="font-size:18px;font-weight:700">{order.order_number}</div>
    </div>

    {_items_table(items)}

    <div style="display:flex;justify-content:space-between;padding:12px 0;font-weight:600;border-top:2px solid #0D0D0D;margin-top:4px">
      <span>Totaal (incl. BTW)</span>
      <span class="mono">€{order.total:.2f}</span>
    </div>

    <div class="box" style="margin-top:20px">
      <div style="font-size:11px;color:#6B7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Bezorgadres</div>
      <div style="font-size:14px;line-height:1.8">{order.customer_name}<br/>{_address_block(addr)}</div>
    </div>

    <p style="margin-top:20px">Verwachte levertijd: <strong>3–7 werkdagen</strong>.
    Je ontvangt een e-mail zodra je pakket onderweg is.</p>

    <p>Vragen over je bestelling? Mail ons met je bestelnummer.</p>
    """

    return await send_email(
        order.customer_email,
        order.customer_name,
        f"✓ Bestelling ontvangen — {order.order_number}",
        _email_wrapper(body),
    )


# ── 2. New order notification → store owner ──────────────────────

async def send_owner_notification(order) -> bool:
    """Sent to the store owner immediately after order is placed."""
    addr  = order.shipping_address or {}
    items = order.items or []

    items_text = "".join(
        f"<li>{item.get('name','?')} × {item.get('qty',1)} — €{item.get('price',0)*item.get('qty',1):.2f}</li>"
        for item in items
    )

    body = f"""
    <h2>🛒 Nieuwe bestelling!</h2>

    <div class="box">
      <strong>{order.order_number}</strong> &nbsp;·&nbsp; €{order.total:.2f}<br/>
      <span style="font-size:13px;color:#6B7280">{order.customer_name} &lt;{order.customer_email}&gt;</span>
    </div>

    <p><strong>Bezorgadres</strong></p>
    <div class="box" style="font-family:'Courier New',monospace;font-size:13px;line-height:1.8">
      {order.customer_name}<br/>
      {_address_block(addr)}
    </div>

    <p><strong>Bestelde producten</strong></p>
    <ul style="font-size:13px;line-height:2;color:#374151">{items_text}</ul>

    <a class="btn" href="{STORE_URL}/admin">Open Admin Dashboard →</a>

    <p style="font-size:12px;color:#6B7280;margin-top:16px">
      Ga naar de Verwerking tab in het admin dashboard om deze bestelling te verwerken.
    </p>
    """

    return await send_email(
        STORE_EMAIL,
        "Velo Admin",
        f"🛒 Nieuwe bestelling: {order.order_number} — €{order.total:.2f}",
        _email_wrapper(body),
    )


# ── 3. Shipping notification → customer ──────────────────────────

async def send_shipping_notification(order, tracking_number: str) -> bool:
    """Sent to customer when tracking number is added in admin."""
    first = order.customer_name.split()[0] if order.customer_name else "klant"

    body = f"""
    <h2>Je pakket is onderweg! 📦</h2>
    <p>Goed nieuws, {first}! Je bestelling <strong>{order.order_number}</strong>
    is verzonden en onderweg naar jou.</p>

    <div class="green">
      <div style="font-size:11px;color:#065f46;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Trackingnummer</div>
      <div class="mono" style="font-size:22px;font-weight:700;color:#065f46;letter-spacing:1px">{tracking_number}</div>
    </div>

    <p style="margin-top:20px">
      Volg je pakket op de website van de vervoerder met het trackingnummer hierboven.
      Heb je een vraag? Reageer op deze e-mail met je bestelnummer.
    </p>
    """

    return await send_email(
        order.customer_email,
        order.customer_name,
        f"📦 Je bestelling van Velo is verzonden — {tracking_number}",
        _email_wrapper(body),
    )
