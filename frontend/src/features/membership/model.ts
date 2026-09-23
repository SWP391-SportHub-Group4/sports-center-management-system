export interface PackageOption {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  sessionLimit: number | null;
  benefits: string[];
}
export interface MemberPackage {
  id: string;
  packageId: string;
  name: string;
  status: "Active" | "PendingPayment" | "Expired";
  expiresAt: string;
  remainingSessions: number | null;
}
export interface Invoice {
  id: string;
  packageName: string;
  total: number;
  status: "Issued";
  createdAt: string;
}
