(function () {
  const $ = (id) => document.getElementById(id);
  const cartPanel = $("cartPanel");
  if (!cartPanel || typeof supabaseClient === "undefined") return;
  const inner = cartPanel.querySelector(".cart-inner");
  const checkoutButton = $("checkoutButton");
  const note = inner?.querySelector(".cart-note");
  if (!inner || !checkoutButton || !note) return;

  const style = document.createElement("style");
  style.textContent = `.merch-checkout-form{display:none;margin-top:18px;padding-top:18px;border-top:1px solid #333}.merch-checkout-form.open{display:block}.merch-checkout-form h3{font-size:14px;margin:0 0 12px}.merch-checkout-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.merch-checkout-fields label{display:grid;gap:6px;color:#999;font-size:10px;letter-spacing:.7px}.merch-checkout-fields .wide{grid-column:1/-1}.merch-checkout-fields input{width:100%;min-height:42px;padding:9px;background:#111;border:1px solid #444;color:#fff;font-size:12px}.merch-checkout-rates{display:grid;gap:8px;margin-top:14px}.merch-checkout-rate{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px;border:1px solid #393939;color:#ddd;font-size:11px;line-height:1.5}.merch-checkout-rate input{accent-color:#fff}.merch-checkout-status{min-height:22px;margin-top:10px;color:#bbb;font-size:11px;line-height:1.5}.merch-checkout-terms{margin-top:11px;color:#777;font-size:10px;line-height:1.6}.merch-checkout-terms button{padding:0;border:0;background:none;color:#eee;text-decoration:underline;cursor:pointer}@media(max-width:400px){.merch-checkout-fields{grid-template-columns:1fr}.merch-checkout-fields .wide{grid-column:auto}}`;
  document.head.appendChild(style);

  const form = document.createElement("section");
  form.className = "merch-checkout-form";
  form.id = "merchCheckoutForm";
  form.innerHTML = `<h3>DELIVERY ADDRESS</h3><div class="merch-checkout-fields">
    <label class="wide">FULL NAME<input name="name" autocomplete="name" required maxlength="120"></label>
    <label class="wide">ADDRESS<input name="address1" autocomplete="address-line1" required maxlength="200"></label>
    <label class="wide">APARTMENT / UNIT (OPTIONAL)<input name="address2" autocomplete="address-line2" maxlength="200"></label>
    <label>CITY<input name="city" autocomplete="address-level2" required maxlength="100"></label>
    <label>STATE / PROVINCE<input name="state_code" autocomplete="address-level1" maxlength="20"></label>
    <label>POSTAL CODE<input name="zip" autocomplete="postal-code" required maxlength="20"></label>
    <label>COUNTRY CODE<input name="country_code" autocomplete="country" value="US" required minlength="2" maxlength="2" aria-describedby="merchCountryHelp"></label>
    <label class="wide">PHONE (OPTIONAL)<input name="phone" autocomplete="tel" maxlength="40"></label>
    <span id="merchCountryHelp" class="wide" style="color:#777;font-size:10px">Use the 2-letter country code, such as US, CA, or GB.</span>
  </div><button class="outline" type="button" id="getPrintfulRates">GET SHIPPING OPTIONS</button><div class="merch-checkout-rates" id="merchCheckoutRates" role="radiogroup" aria-label="Printful shipping options"></div><p class="merch-checkout-status" id="merchCheckoutStatus" role="status" aria-live="polite"></p><p class="merch-checkout-terms">By continuing, you agree to the <button type="button" data-open-policy>Shipping & Returns</button> policy. Stripe will display applicable tax and the final amount before payment.</p><button class="add" type="button" id="payForMerch" disabled>CONTINUE TO SECURE PAYMENT</button>`;
  checkoutButton.insertAdjacentElement("beforebegin", form);

  let checkoutAvailable = false;
  let currentQuoteId = "";
  let lastAddress = null;

  function setStatus(message) { $("merchCheckoutStatus").textContent = message; }
  function addressValue() {
    const value = {};
    new FormData(form).forEach((entry, key) => { value[key] = String(entry).trim(); });
    value.country_code = String(value.country_code || "").toUpperCase();
    return value;
  }
  function cartInput() {
    return (Array.isArray(cart) ? cart : []).map((item) => ({ id: Number(item.id), size: item.size || "", color: item.color || "", quantity: Number(item.quantity) }));
  }
  async function invoke(body) {
    const result = await supabaseClient.functions.invoke("merch-checkout", { body });
    if (result.error) {
      let detail = "";
      try { detail = (await result.error.context?.json())?.error || ""; } catch (_) { /* use client error */ }
      throw new Error(detail || result.error.message || "Checkout request failed.");
    }
    if (result.data?.error) throw new Error(result.data.error);
    return result.data;
  }
  async function refreshAvailability() {
    checkoutButton.disabled = true;
    checkoutButton.textContent = "CHECKOUT SETUP REQUIRED";
    try {
      const status = await invoke({ action: "status" });
      checkoutAvailable = status.enabled === true;
    } catch (_) { checkoutAvailable = false; }
    if (checkoutAvailable) {
      note.innerHTML = "Shipping options are calculated for the Printful items in your bag. Stripe will show any applicable tax and your final amount before payment.";
      checkoutButton.textContent = "CONTINUE TO CHECKOUT";
      checkoutButton.disabled = !Array.isArray(cart) || cart.length === 0;
    } else {
      note.innerHTML = "<strong>Checkout setup is still in progress.</strong> You can build a bag, but no order or charge will be created yet.";
    }
  }

  checkoutButton.addEventListener("click", () => {
    if (!checkoutAvailable) return;
    form.classList.toggle("open");
    checkoutButton.textContent = form.classList.contains("open") ? "HIDE CHECKOUT" : "CONTINUE TO CHECKOUT";
  });

  $("getPrintfulRates").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const address = addressValue();
    const invalidInput = [...form.querySelectorAll("input[required]")].find((input) => !input.checkValidity());
    if (invalidInput) { invalidInput.reportValidity(); return; }
    button.disabled = true;
    button.textContent = "CHECKING RATES…";
    currentQuoteId = "";
    $("merchCheckoutRates").replaceChildren();
    $("payForMerch").disabled = true;
    setStatus("Getting current Printful shipping rates…");
    try {
      const result = await invoke({ action: "quote", address, items: cartInput() });
      currentQuoteId = result.quoteId;
      lastAddress = address;
      const host = $("merchCheckoutRates");
      for (const [index, rate] of (result.rates || []).entries()) {
        const label = document.createElement("label");
        label.className = "merch-checkout-rate";
        const delivery = rate.min_delivery_days && rate.max_delivery_days ? ` · ${rate.min_delivery_days}–${rate.max_delivery_days} days` : "";
        label.innerHTML = `<span><input type="radio" name="printfulRate" value="${String(index)}"> ${safe(String(rate.name))}${delivery}</span><strong>${money(rate.amount)}</strong>`;
        label.querySelector("input").dataset.rateId = String(rate.id);
        host.appendChild(label);
      }
      host.querySelectorAll('input[name="printfulRate"]').forEach((radio) => radio.addEventListener("change", () => { $("payForMerch").disabled = !currentQuoteId; }));
      setStatus("Choose a shipping option, then continue to secure Stripe checkout.");
    } catch (error) { setStatus(error.message || "Could not get shipping rates."); }
    finally { button.disabled = false; button.textContent = "REFRESH SHIPPING OPTIONS"; }
  });

  $("payForMerch").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const selected = form.querySelector('input[name="printfulRate"]:checked');
    if (!currentQuoteId || !selected || !lastAddress) { setStatus("Get shipping options and choose one before continuing."); return; }
    button.disabled = true;
    button.textContent = "OPENING STRIPE…";
    setStatus("Preparing secure payment…");
    try {
      const result = await invoke({ action: "start", quoteId: currentQuoteId, rateId: selected.dataset.rateId });
      if (!result.checkoutUrl) throw new Error("Stripe did not return a checkout link.");
      window.location.assign(result.checkoutUrl);
    } catch (error) { setStatus(error.message || "Could not start checkout."); button.disabled = false; button.textContent = "CONTINUE TO SECURE PAYMENT"; }
  });

  document.querySelectorAll("[data-open-policy]").forEach((button) => button.addEventListener("click", () => $("storePolicy")?.classList.add("open")));
  const params = new URLSearchParams(location.search);
  if (params.has("checkout_cancelled")) { notify("Checkout was cancelled. No payment was taken."); history.replaceState({}, "", location.pathname); }
  if (params.has("store_order")) { notify("Stripe is confirming your payment. Check Your Account → Store Orders for the latest status."); history.replaceState({}, "", location.pathname); }
  refreshAvailability();
  const cartObserver = new MutationObserver(() => {
    if (checkoutAvailable && form.classList.contains("open")) checkoutButton.disabled = !Array.isArray(cart) || cart.length === 0;
  });
  cartObserver.observe($("cartItems"), { childList: true, subtree: true });
})();

