"use client";

import Link from "next/link";
import { useState } from "react";

import {
  api,
  ApiError,
} from "@/lib/apiClient";

import {
  useApi,
} from "@/lib/useApi";

import {
  useLanguage,
} from "@/lib/language";

import {
  pagedItems,
} from "@/lib/paged";

import {
  formatDate,
  formatTime,
} from "@/lib/format";

import {
  MutationFeedback,
  useMutation,
} from "@/features/operations";

import type {
  GymCheckInDto,
  MemberPackageDto,
  Paged,
  UserAdminDto,
} from "@/lib/types";

import styles from "./desk.module.css";

import {
  AvatarImage,
} from "@/components/AvatarImage";

import {
  ReportAvatarButton,
} from "@/components/ReportAvatarButton";

import {
  MemberCancellations,
} from "./member-cancellations";

import {
  MemberSupportRequests,
} from "./member-support-requests";

export function SelectedMemberPanel({
  member,
  onChange,
  showProfileLink = true,
}: {
  member: UserAdminDto;

  onChange: (
    member: UserAdminDto | null,
  ) => void;

  showProfileLink?: boolean;
}) {
  const { t } =
    useLanguage();

  const l =
    t.frontDesk;

  const mutation =
    useMutation();

  const [
    note,
    setNote,
  ] =
    useState<string | null>(
      null,
    );

  const memberId =
    member.userId;

  const packages =
    useApi(
      (signal) =>
        api.get<
          MemberPackageDto[]
        >(
          `/api/members/${memberId}/packages`,
          {
            signal,
          },
        ),
      [memberId],
    );

  const visits =
    useApi(
      (signal) =>
        api.get<
          Paged<GymCheckInDto>
        >(
          `/api/members/${memberId}/gym-checkins`,
          {
            signal,
            query: {
              page: 1,
              pageSize: 5,
            },
          },
        ),
      [memberId],
    );

  const activePackage =
    packages.data?.find(
      (p) =>
        p.status ===
          "ACTIVE" &&
        p.isUsable,
    );

  const open =
    pagedItems(
      visits.data,
    ).find(
      (v) =>
        !v.checkOutTime,
    );

  const ready =
    !packages.loading &&
    !visits.loading;

  const blocked =
    ready &&
    !open &&
    !activePackage;

  async function toggle() {
    setNote(null);

    const ok =
      await mutation.run(
        async () => {
          try {
            if (open) {
              await api.post(
                `/api/gym-checkins/${open.checkInId}/checkout`,
              );
            } else {
              await api.post(
                "/api/gym-checkins",
                {
                  targetMemberId:
                    memberId,
                },
              );
            }
          } catch (error) {
            if (
              error instanceof
                ApiError &&
              error.code ===
                "gym_already_checked_in"
            ) {
              visits.reload();

              throw new ApiError(
                error.status,
                error.code,
                l.alreadyInside,
                error.details,
              );
            }

            throw error;
          }
        },
      );

    if (ok) {
      const now =
        new Date().toISOString();

      setNote(
        (
          open
            ? l.checkedOut
            : l.checkedIn
        ).replace(
          "{time}",
          formatTime(now),
        ),
      );

      visits.reload();
    }
  }

  return (
    <section
      className={
        styles.selected
      }
      aria-label={
        l.selectedMember
      }
    >
      <div
        className={
          styles.selectedTop
        }
      >
        <AvatarImage
          name={
            member.fullName ||
            member.email
          }
          avatarUrl={
            member.avatarUrl
          }
          size={64}
        />

        <div>
          <h2
            className={
              styles.selectedName
            }
          >
            {member.fullName ||
              member.email}
          </h2>

          <p
            className={
              styles.selectedMeta
            }
          >
            {member.email}

            {member.phone
              ? ` · ${member.phone}`
              : ""}
          </p>

          <ReportAvatarButton
            targetUserId={
              member.userId
            }
            avatarUrl={
              member.avatarUrl
            }
          />
        </div>

        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() =>
            onChange(null)
          }
        >
          {l.changeMember}
        </button>
      </div>

      <dl
        className={
          styles.facts
        }
      >
        <div
          className={`${styles.fact} ${
            ready &&
            !activePackage
              ? styles.factWarn
              : ""
          }`}
        >
          <dt>
            {l.membership}
          </dt>

          <dd>
            {!ready
              ? "…"
              : activePackage
                ? l.membershipUntil.replace(
                    "{date}",
                    formatDate(
                      activePackage.endDate,
                    ),
                  )
                : l.noMembership}
          </dd>
        </div>

        <div
          className={
            styles.fact
          }
        >
          <dt>
            Gym
          </dt>

          <dd>
            {!ready
              ? "…"
              : open
                ? l.insideSince.replace(
                    "{time}",
                    formatTime(
                      open.checkInTime,
                    ),
                  )
                : l.notInside}
          </dd>
        </div>
      </dl>

      <p
        className={
          styles.hint
        }
      >
        {l.nextAction}
      </p>

      <div
        className={
          styles.actions
        }
      >
        <button
          type="button"
          className="btn"
          disabled={
            !ready ||
            mutation.busy ||
            blocked
          }
          onClick={toggle}
        >
          {open
            ? l.checkOut
            : l.checkIn}
        </button>

        <Link
          className="btn btn--secondary"
          href="/receptionist/sales"
        >
          {l.sell}
        </Link>

        <Link
          className="btn btn--secondary"
          href="/receptionist/invoices"
        >
          {l.viewInvoices}
        </Link>

        {showProfileLink && (
          <Link
            className="btn btn--ghost"
            href={`/receptionist/members/${memberId}`}
          >
            {l.openProfile}
          </Link>
        )}
      </div>

      {blocked && (
        <p
          className={
            styles.block
          }
        >
          {l.needMembership}
        </p>
      )}

      <MemberCancellations
        memberId={
          memberId
        }
        packages={
          packages.data ?? []
        }
        onChanged={() => {
          packages.reload();
        }}
      />

      <MemberSupportRequests
        memberId={
          memberId
        }
      />

      {note && (
        <p
          className={
            styles.note
          }
          role="status"
        >
          {note}
        </p>
      )}

      <MutationFeedback
        mutation={
          mutation
        }
      />
    </section>
  );
}