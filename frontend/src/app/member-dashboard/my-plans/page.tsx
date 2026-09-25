"use client";

import Link from "next/link";
import { MemberShell } from "@/components/MemberShell";
import { api } from "@/lib/apiClient";
import { formatDate, formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { MemberPackageDto, MembershipPackageDto } from "@/lib/types";
import styles from "./my-plans.module.css";

/**
 * Gói của hội viên (BR-9, BR-11) và danh mục gói đang bán (BR-8).
 * Hội viên không tự mua online: BR-30 quy định hóa đơn phát hành tại quầy trước khi thu tiền,
 * nên việc mua gói đi qua Lễ tân.
 */
export default function MyPackagesPage() {
  const { language } = useLanguage();

  const myPackages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );

  const catalog = useApi(
    (signal) =>
      api.get<MembershipPackageDto[]>("/api/membership-packages", { signal }),
    [],
  );

  const getStatusBadge = (item: MemberPackageDto) => {
    if (item.status === "Active" && item.isUsable) {
      return (
        <span className={`${styles.statusBadge} ${styles.statusActive}`}>
          {language === "en" ? "✓ In Use" : "✓ Đang sử dụng"}
        </span>
      );
    }
    if (item.status === "Active" && !item.isUsable) {
      return (
        <span className={`${styles.statusBadge} ${styles.statusDepleted}`}>
          {language === "en" ? "Depleted" : "Hết lượt tập"}
        </span>
      );
    }
    return (
      <span className={`${styles.statusBadge} ${styles.statusExpired}`}>
        {item.status}
      </span>
    );
  };

  return (
    <MemberShell
      title={language === "en" ? "Membership Passes & Packages" : "Gói hội viên & Dịch vụ"}
      description={
        language === "en"
          ? "Manage your active passes, session balances, and explore available SportHub packages"
          : "Quản lý các gói tập bạn đang sở hữu, số buổi khả dụng và khám phá các gói tập SportHub"
      }
    >
      <div className={styles.container}>
        {/* Section 1: My Active & Owned Packages */}
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {language === "en" ? "Your Active Passes" : "Gói tập của tôi"}
            </h2>
            <p className={styles.sectionDesc}>
              {language === "en"
                ? "Valid and previously used membership passes at SportHub (BR-9, BR-11)."
                : "Các gói hội viên còn hiệu lực hoặc đã từng sử dụng tại hệ thống SportHub (BR-9, BR-11)."}
            </p>
          </div>

          {myPackages.loading ? (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIcon}>⏳</div>
              <h3 className={styles.emptyTitle}>
                {language === "en" ? "Loading membership passes..." : "Đang tải danh sách gói tập..."}
              </h3>
              <p className={styles.emptyDesc}>
                {language === "en" ? "Please wait a moment." : "Vui lòng chờ trong giây lát."}
              </p>
            </div>
          ) : !myPackages.data || myPackages.data.length === 0 ? (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIcon}>💳</div>
              <h3 className={styles.emptyTitle}>
                {language === "en" ? "You do not own any membership passes yet" : "Bạn chưa sở hữu gói hội viên nào"}
              </h3>
              <p className={styles.emptyDesc}>
                {language === "en"
                  ? "Browse our package catalog below and visit the SportHub reception desk to enroll in the pass that best fits your goals!"
                  : "Hãy tham khảo bảng danh mục gói tập bên dưới và liên hệ quầy Lễ tân SportHub để được tư vấn kích hoạt gói tập phù hợp nhất!"}
              </p>
            </div>
          ) : (
            <div className={styles.passesGrid}>
              {myPackages.data.map((item) => {
                const isUnlimited = item.remainingSessions === null;
                const total = item.sessionLimit ?? (item.remainingSessions ?? 0);
                const remaining = item.remainingSessions ?? 0;
                const percent = total > 0 ? Math.min(100, Math.round((remaining / total) * 100)) : 100;

                return (
                  <div
                    key={item.memberPackageId}
                    className={`${styles.passCard} ${item.isUsable ? styles.passCardUsable : ""}`}
                  >
                    <div>
                      <div className={styles.passCardHeader}>
                        <div>
                          <div className={styles.passBrandRow}>
                            <span className={styles.passIcon}>⚡</span>
                            <span className={styles.passBrand}>SportHub Membership Pass</span>
                          </div>
                          <h3 className={styles.packageName}>{item.packageName}</h3>
                        </div>

                        {getStatusBadge(item)}
                      </div>

                      {/* Sessions Box */}
                      <div className={styles.sessionBox}>
                        <div className={styles.sessionNumbers}>
                          <span className={styles.sessionLabel}>
                            {language === "en" ? "Available Sessions" : "Buổi tập khả dụng"}
                          </span>
                          <div>
                            {isUnlimited ? (
                              <span className={styles.sessionCount}>
                                {language === "en" ? "Unlimited" : "Không giới hạn"}
                              </span>
                            ) : (
                              <>
                                <span className={styles.sessionCount}>{remaining}</span>
                                {item.sessionLimit && (
                                  <span className={styles.sessionLimit}>
                                    {language === "en" ? ` / ${item.sessionLimit} sessions` : ` / ${item.sessionLimit} buổi`}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {!isUnlimited && (
                          <div className={styles.progressBarBg}>
                            <div
                              className={styles.progressBarFill}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        )}

                        <div className={styles.passDates}>
                          <div className={styles.dateRow}>
                            <span>{language === "en" ? "Start Date:" : "Ngày bắt đầu:"}</span>
                            <strong>{formatDate(item.startDate)}</strong>
                          </div>
                          <div className={styles.dateRow}>
                            <span>{language === "en" ? "Expiry Date:" : "Ngày hết hạn:"}</span>
                            <strong>{formatDate(item.endDate)}</strong>
                          </div>
                        </div>

                        {item.stackingApproved && (
                          <div className={styles.stackingNote}>
                            {language === "en"
                              ? `ℹ️ Approved stacked package: ${item.stackingApprovalReason ?? "Approved"}`
                              : `ℹ️ Gói gối đầu được phê duyệt: ${item.stackingApprovalReason ?? "Đã duyệt"}`}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={styles.passFooter}>
                      <Link href="/member-dashboard/class-schedule" className={styles.bookBtn}>
                        {language === "en" ? "Use pass to book class →" : "Dùng gói đặt lịch lớp ngay →"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Catalog of Packages for Sale */}
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {language === "en" ? "Available SportHub Packages Catalog" : "Danh mục gói tập SportHub đang phát hành"}
            </h2>
            <p className={styles.sectionDesc}>
              {language === "en"
                ? "Explore Gym, Yoga, GroupX, and Personal Training packages (BR-8)."
                : "Khám phá các gói tập Gym, Yoga, GroupX và Huấn luyện viên cá nhân (BR-8)."}
            </p>
          </div>

          <div className={styles.catalogNotice}>
            {language === "en" ? (
              <>
                💡 <strong>Enrollment & Renewal Guide (BR-30):</strong> By facility safety policy, package invoices are issued directly at the reception desk before payment. Please visit reception or call our hotline for assistance.
              </>
            ) : (
              <>
                💡 <strong>Hướng dẫn đăng ký & gia hạn (BR-30):</strong> Theo quy trình an toàn của trung tâm, hóa đơn gói tập được phát hành trực tiếp tại quầy Lễ tân trước khi thanh toán. Hội viên vui lòng ghé quầy Lễ tân hoặc liên hệ hotline để được phục vụ nhanh chóng.
              </>
            )}
          </div>

          {catalog.loading ? (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIcon}>⏳</div>
              <h3 className={styles.emptyTitle}>
                {language === "en" ? "Loading package catalog..." : "Đang tải bảng danh mục gói..."}
              </h3>
            </div>
          ) : !catalog.data || catalog.data.length === 0 ? (
            <div className={styles.emptyCard}>
              <div className={styles.emptyIcon}>📦</div>
              <h3 className={styles.emptyTitle}>
                {language === "en" ? "No packages currently available for sale" : "Chưa có gói tập nào đang mở bán"}
              </h3>
            </div>
          ) : (
            <div className={styles.catalogGrid}>
              {catalog.data.map((item) => (
                <div key={item.packageId} className={styles.catalogCard}>
                  <div className={styles.catalogTop}>
                    <h3 className={styles.catalogName}>{item.name}</h3>

                    <div className={styles.priceRow}>
                      <span className={styles.priceAmount}>{formatMoney(item.price)}</span>
                      <span className={styles.pricePeriod}>
                        {language === "en" ? `/ ${item.durationDays} days` : `/ ${item.durationDays} ngày`}
                      </span>
                    </div>

                    <div className={styles.catalogFeatures}>
                      <div className={styles.featureItem}>
                        <span className={styles.featureIcon}>✓</span>
                        <span>
                          {language === "en" ? "Validity period: " : "Thời hạn sử dụng: "}
                          <strong>
                            {language === "en" ? `${item.durationDays} days` : `${item.durationDays} ngày`}
                          </strong>
                        </span>
                      </div>
                      <div className={styles.featureItem}>
                        <span className={styles.featureIcon}>✓</span>
                        <span>
                          {language === "en" ? "Session allowance: " : "Số buổi tập: "}
                          <strong>
                            {item.sessionLimit === null
                              ? (language === "en" ? "Unlimited" : "Không giới hạn")
                              : (language === "en" ? `${item.sessionLimit} sessions` : `${item.sessionLimit} buổi`)}
                          </strong>
                        </span>
                      </div>
                      <div className={styles.featureItem}>
                        <span className={styles.featureIcon}>✓</span>
                        <span>
                          {language === "en"
                            ? "Complimentary smart lockers & premium shower amenities"
                            : "Tự do sử dụng tủ đồ thông minh & phòng tắm cao cấp"}
                        </span>
                      </div>
                    </div>

                    {item.description && (
                      <p className={styles.catalogDesc}>{item.description}</p>
                    )}
                  </div>

                  <div className={styles.receptionCta}>
                    {language === "en" ? "Visit reception desk to enroll" : "Liên hệ quầy Lễ tân để kích hoạt gói"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MemberShell>
  );
}
