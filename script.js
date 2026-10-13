"use strict";

// Prices are stored in kopecks in the HTML to avoid floating-point arithmetic.
const purchaseForm = document.querySelector("#purchase-form");
const sku = document.querySelector("#product-sku");
const currentPrice = document.querySelector("#current-price");
const oldPrice = document.querySelector("#old-price");
const discount = document.querySelector("#discount");
const priceUnit = document.querySelector("#price-unit");
const announcement = document.querySelector("#selection-announcement");
const cartFeedback = document.querySelector("#cart-feedback");

function formatPrice(kopecks) {
  const fractionDigits = kopecks % 100 === 0 ? 0 : 2;

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(kopecks / 100);
}

function updatePackage(input, announce = true) {
  const price = Number(input.dataset.price);
  const previousPrice = Number(input.dataset.oldPrice);
  const hasDiscount = previousPrice > price;
  const discountPercent = Math.round((1 - price / previousPrice) * 100);
  const packageLabel = input.nextElementSibling.textContent.trim();

  sku.textContent = input.dataset.sku;
  currentPrice.textContent = formatPrice(price);
  oldPrice.textContent = formatPrice(previousPrice);
  oldPrice.hidden = !hasDiscount;
  discount.hidden = !hasDiscount;
  discount.textContent = `−${discountPercent}%`;
  discount.setAttribute("aria-label", `Скидка ${discountPercent} процентов`);
  priceUnit.textContent = `за ${packageLabel}`;
  cartFeedback.textContent = "";

  if (announce) {
    announcement.textContent = `${packageLabel}. Артикул ${input.dataset.sku}. Цена ${formatPrice(price)}.${hasDiscount ? ` Старая цена ${formatPrice(previousPrice)}.` : ""}`;
  }
}

purchaseForm.addEventListener("change", (event) => {
  if (event.target.matches('input[name="package"]')) {
    updatePackage(event.target);
  }
});

purchaseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedPackage = purchaseForm.querySelector('input[name="package"]:checked');
  const packageLabel = selectedPackage.nextElementSibling.textContent.trim();

  cartFeedback.textContent = `Добавлено: Ананасовый улун, ${packageLabel} (демо).`;
});

// Synchronize with the radio state restored by the browser on reload/back navigation.
function syncSelection() {
  updatePackage(purchaseForm.querySelector('input[name="package"]:checked'), false);
}

syncSelection();
window.addEventListener("pageshow", syncSelection);
