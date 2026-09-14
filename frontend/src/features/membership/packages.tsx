"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Modal } from "@/shared/ui";
import { money, dateLabel } from "@/shared/lib/date";
import type { PackageOption, Invoice } from "./model";
export function PackageList({
  catalog,
  invoices,
  busy,
  onPurchase,
}: {
  catalog: PackageOption[];
  invoices: Invoice[];
  busy: boolean;
  onPurchase: (id: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(catalog[0]?.id ?? "");
  const [confirm, setConfirm] = useState(false);
  const option = catalog.find((p) => p.id === selected);
  return (
    <div className="stack">
      <h1>Chọn gói hội viên</h1>
      <p className="muted">Chọn gói phù hợp để bắt đầu tập luyện.</p>
      <fieldset className="package-options">
        <legend className="sr-only">Gói hội viên</legend>
        {catalog.map((p) => (
          <label
            className={`card package-option ${selected === p.id ? "selected" : ""}`}
            key={p.id}
          >
            <span className="row between">
              <span>
                {p.durationDays >= 365 ? "12 tháng" : "6 tháng"}{" "}
                {selected === p.id && "· Đang chọn"}
              </span>
              <input
                type="radio"
                name="package"
                value={p.id}
                checked={selected === p.id}
                onChange={() => setSelected(p.id)}
              />
            </span>
            <h2>{p.name}</h2>
            <strong className="price">{money(p.price)}</strong>
            <span>
              Tổng giá gói ·{" "}
              {p.sessionLimit === null
                ? "Không giới hạn buổi"
                : `${p.sessionLimit} buổi`}
            </span>
            <ul>
              {p.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </label>
        ))}
      </fieldset>
      {option && (
        <>
          <p>
            Tổng thanh toán: <strong>{money(option.price)}</strong>
          </p>
          <Button onClick={() => setConfirm(true)}>Đăng ký gói</Button>
        </>
      )}
      <Link className="text-link" href="/member/profile">
        Quay lại trang cá nhân
      </Link>
      {invoices.length > 0 && (
        <Card>
          <h2>Yêu cầu chờ thanh toán</h2>
          {invoices.map((i) => (
            <div className="list-row" key={i.id}>
              <div>
                <strong>{i.packageName}</strong>
                <p className="muted">
                  {dateLabel(i.createdAt)} · {i.id}
                </p>
              </div>
              <div>
                <strong>{money(i.total)}</strong>
                <p>Chờ thanh toán tại quầy</p>
              </div>
            </div>
          ))}
        </Card>
      )}
      {confirm && option && (
        <Modal title="Xác nhận đăng ký gói" onClose={() => setConfirm(false)}>
          <div className="stack">
            <h3>{option.name}</h3>
            <p>{money(option.price)}</p>
            <p>
              Gói sẽ ở trạng thái chờ thanh toán. Chỉ được sử dụng sau khi trung
              tâm xác nhận thanh toán.
            </p>
            <p className="muted">
              Bản xem trước không phát sinh khoản thu hoặc giao dịch thật.
            </p>
            <div className="row">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Quay lại
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  if (await onPurchase(option.id)) setConfirm(false);
                }}
              >
                {busy ? "Đang xử lý…" : "Xác nhận đăng ký gói"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
