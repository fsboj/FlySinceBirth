(function () {
  "use strict";

  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function invoke(body) {
    if (typeof supabaseClient === "undefined") return Promise.reject(new Error("Ticket checkout is unavailable right now."));
    return supabaseClient.functions.invoke("event-ticket-checkout", { body: body });
  }

  async function mount(event, host) {
    host.replaceChildren(element("p", "event-detail-copy", "Checking ticket availability…"));
    const result = await invoke({ action: "status", eventId: event.id });
    if (result.error || !result.data) throw new Error(result.error?.message || "Ticket availability could not be checked.");
    const status = result.data;
    host.replaceChildren();
    const panel = element("div", "fsb-ticket-panel");
    const header = element("div", "fsb-ticket-price", money(status.ticket_price) + " per ticket");
    panel.appendChild(header);
    const availability = status.remaining == null
      ? "No capacity limit"
      : status.remaining > 0 ? status.remaining + " ticket" + (status.remaining === 1 ? "" : "s") + " remaining" : "Sold out";
    panel.appendChild(element("p", "event-detail-copy", availability));

    if (status.remaining === 0) {
      panel.appendChild(element("p", "event-detail-copy", "Tickets are currently sold out."));
      host.appendChild(panel);
      return;
    }
    if (!Array.isArray(status.providers) || !status.providers.length) {
      panel.appendChild(element("p", "event-detail-copy", "On-site checkout is being configured. Please check back soon."));
      host.appendChild(panel);
      return;
    }

    const form = element("form", "fsb-ticket-form");
    const quantityLabel = element("label", "fsb-ticket-label", "Quantity");
    const quantity = element("select", "fsb-ticket-input");
    const maxQuantity = Math.min(10, status.remaining == null ? 10 : Number(status.remaining));
    for (let count = 1; count <= maxQuantity; count += 1) {
      const option = element("option", "", String(count)); option.value = String(count); quantity.appendChild(option);
    }
    quantityLabel.appendChild(quantity); form.appendChild(quantityLabel);

    const methodLabel = element("div", "fsb-ticket-label", "Pay with");
    const methods = element("div", "fsb-ticket-methods");
    status.providers.forEach(function (provider, index) {
      const label = element("label", "fsb-ticket-method");
      const radio = document.createElement("input"); radio.type = "radio"; radio.name = "ticket-provider";
      radio.value = provider; radio.required = true; radio.checked = index === 0;
      label.appendChild(radio); label.appendChild(document.createTextNode(provider === "paypal" ? "PayPal" : "Credit or debit card"));
      methods.appendChild(label);
    });
    methodLabel.appendChild(methods); form.appendChild(methodLabel);

    const message = element("p", "event-detail-copy fsb-ticket-message", "");
    message.setAttribute("aria-live", "polite"); form.appendChild(message);
    const submit = element("button", "event-action fsb-ticket-submit", "CONTINUE TO CHECKOUT");
    submit.type = "submit"; form.appendChild(submit);
    form.addEventListener("submit", async function (submitEvent) {
      submitEvent.preventDefault();
      submit.disabled = true; message.textContent = "Starting secure checkout…";
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.user) { message.textContent = "Sign in or create an account to buy tickets. "; const accountLink = element("a", "event-action", "SIGN IN / CREATE ACCOUNT"); accountLink.href = "account.html?return=" + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash); message.appendChild(accountLink); submit.disabled = false; return; }
      const provider = form.querySelector("input[name='ticket-provider']:checked")?.value;
      let started;
      try {
        started = await invoke({
          action: "start", eventId: event.id, quantity: Number(quantity.value), provider: provider,
        });
      } catch (error) {
        started = { error: error };
      }
      if (started.error || !started.data?.checkoutUrl) {
        message.textContent = started.data?.error || started.error?.message || "Checkout could not be started. Please try again.";
        submit.disabled = false;
        return;
      }
      window.location.assign(started.data.checkoutUrl);
    });
    panel.appendChild(form); host.appendChild(panel);
  }

  async function handleReturn() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("ticket_order");
    if (params.has("ticket_cancelled")) {
      params.delete("ticket_cancelled");
      const suffix = params.toString();
      history.replaceState(null, "", window.location.pathname + (suffix ? "?" + suffix : "") + window.location.hash);
      return;
    }
    if (!orderId) return;
    const overlay = element("div", "event-detail-overlay");
    const dialog = element("section", "event-detail-dialog");
    dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", "Ticket checkout status");
    const heading = element("h2", "event-detail-title", "CONFIRMING YOUR TICKETS");
    const copy = element("p", "event-detail-copy", "Checking the payment with the provider…");
    dialog.append(heading, copy); overlay.appendChild(dialog); document.body.appendChild(overlay);
    const body = { action: "confirm", orderId: orderId };
    if (params.get("stripe_session")) body.sessionId = params.get("stripe_session");
    if (params.get("provider") === "paypal") body.paypalOrderId = params.get("token") || "";
    let confirmed;
    try {
      confirmed = await invoke(body);
    } catch (error) {
      confirmed = { error: error };
    }
    if (confirmed.error || !confirmed.data?.order) {
      heading.textContent = "PAYMENT NOT CONFIRMED";
      copy.textContent = confirmed.data?.error || confirmed.error?.message || "We could not confirm this payment. Contact FSB before trying again.";
    } else {
      const ticket = confirmed.data.order;
      heading.textContent = "TICKETS CONFIRMED";
      copy.textContent = "Ticket code " + ticket.ticket_code + " · " + ticket.quantity + " ticket" + (Number(ticket.quantity) === 1 ? "" : "s") + " · Total " + money(Number(ticket.unit_price) * Number(ticket.quantity));
    }
    const done = element("button", "event-action", "DONE"); done.type = "button";
    done.addEventListener("click", function () { overlay.remove(); }); dialog.appendChild(done);
    params.delete("ticket_order"); params.delete("stripe_session"); params.delete("provider"); params.delete("token");
    const suffix = params.toString();
    history.replaceState(null, "", window.location.pathname + (suffix ? "?" + suffix : "") + window.location.hash);
  }

  window.FSBTicketing = { mount: mount };
  handleReturn().catch(function (error) { console.error("Could not confirm event tickets:", error); });
})();

