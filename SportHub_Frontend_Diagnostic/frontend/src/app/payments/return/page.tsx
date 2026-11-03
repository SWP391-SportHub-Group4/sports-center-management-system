import { CheckoutScreen } from "@/features/payments/checkout-screen";
import { PublicHeader } from "@/app/public-header";

export default function Page() {
  return <CheckoutScreen publicHeader={<PublicHeader />} />;
}
