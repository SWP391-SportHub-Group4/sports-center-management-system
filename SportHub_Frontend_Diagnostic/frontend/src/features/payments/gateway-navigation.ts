import type { PaymentAttemptDto } from "@/lib/types";

/** Navigate in the current tab so the gateway returns to the same Member session. */
export function openPaymentGateway(attempt: PaymentAttemptDto) {
  if (!attempt.paymentUrl)
    throw new Error("The payment link is unavailable. Please try again.");
  let url: URL;
  try {
    url = new URL(attempt.paymentUrl);
  } catch {
    throw new Error("The payment link is invalid. Please try again.");
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error(
      "The payment link is not secure. Please contact the centre.",
    );
  window.location.assign(url.toString());
}
